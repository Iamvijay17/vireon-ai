const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../../../config');
const LoggerService = require('../../common/LoggerService');
const { PUBLISH_STATUS } = require('../../../constants');
const { PublishError } = require('../errors');
const { sanitizeFilename } = require('../../../utils/filename');
const events = require('../PublishingEvents');
const { handleFailure } = require('../youtube/processYouTubeJob');
const { buildCoursePlan, validateCoursePlan } = require('./coursePlan');
const { buildPackage } = require('./buildPackage');

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Run one Udemy package build to completion.
 *
 *   claim -> VALIDATING (plan + report) -> PROCESSING (ZIP) -> COMPLETED
 *
 * This only ever reads the course and its stored videos and writes one ZIP
 * to our own storage. It does not contact Udemy at all - there is nothing to
 * contact (see capabilities.js).
 *
 * Failure handling is the same as the YouTube path (shared handleFailure):
 * transient storage hiccups retry with bounded backoff, everything else - an
 * invalid course, an oversized export - fails with a message saying what to fix.
 */
async function processExportJob(jobId, deps) {
  const {
    store, storage, enqueue, workerId, loadData,
    settings = config.publishing, now = () => Date.now(),
    tmpDir = os.tmpdir(), buildZip = buildPackage,
  } = deps;

  const claimed = await store.claim(jobId, workerId);
  if (!claimed) return { outcome: 'skipped' };

  const broadcast = (doc) => doc && events.emitJob(doc);
  const owned = (doc) => {
    if (!doc) throw new PublishError('CANCELLED', 'The export was cancelled');
    return doc;
  };
  const patch = async (change) => owned(await store.patch(jobId, workerId, change));

  let job = claimed;
  const tmpFile = path.join(tmpDir, `vireon-udemy-${jobId}.zip`);
  broadcast(job);

  try {
    // ── VALIDATING ──
    const { course, profile, videos } = await loadData(job.ownerId, job.courseId);
    const plan = buildCoursePlan({ course, profile: profile || {}, videos });
    const validation = validateCoursePlan(plan);
    const options = job.exportOptions?.toObject ? job.exportOptions.toObject() : job.exportOptions || {};

    job = await patch({
      set: { 'exportResult.validation': validation, 'exportResult.totals': validation.totals },
      ev: [PUBLISH_STATUS.VALIDATING, validation.ok ? 'Course passed validation' : `${validation.errors.length} problem(s) found`, validation.ok ? 'info' : 'warn'],
    });
    broadcast(job);

    if (!validation.ok && !options.allowIncomplete) {
      throw new PublishError('VALIDATION_FAILED', `The course has ${validation.errors.length} problem(s) to fix before it can be exported: ${validation.errors.slice(0, 3).map((e) => e.message).join(' ')}`);
    }

    // Size guard before streaming anything.
    const lectures = plan.sections.flatMap((s) => s.lectures).filter((l) => l.video.available);
    if (options.includeMedia !== false) {
      let total = 0;
      for (const item of [...lectures.map((l) => l.video), ...(plan.promo?.video.available ? [plan.promo.video] : [])]) {
        const { bucket, key } = storage.parsePublicUrl(item.renderUrl);
        const stat = await storage.statObject(bucket, key);
        if (!stat) throw new PublishError('SOURCE_MISSING', `A lesson video (${item.path}) is missing from storage. Re-render it, then export again.`);
        total += stat.size;
      }
      if (total > settings.export.maxBytes) {
        throw new PublishError('SOURCE_TOO_LARGE', `The package would be ${(total / 1024 ** 3).toFixed(1)} GB; the limit is ${(settings.export.maxBytes / 1024 ** 3).toFixed(1)} GB (PUBLISHING_EXPORT_MAX_BYTES). Export without media instead.`, {
          action: 'Export without media, or raise PUBLISHING_EXPORT_MAX_BYTES.',
        });
      }
    }

    // ── PROCESSING: build the ZIP ──
    job = await patch({
      set: { status: PUBLISH_STATUS.PROCESSING, 'progress.phase': 'Building package', 'progress.percent': 0 },
      ev: [PUBLISH_STATUS.PROCESSING, 'Building the course package'],
    });
    broadcast(job);

    let lastEmit = 0;
    const { bytes } = await buildZip({
      plan, validation, videos, storage, outFile: tmpFile,
      includeMedia: options.includeMedia !== false,
      includeCaptions: options.includeCaptions !== false,
      onProgress: async ({ done, steps }) => {
        const doc = await patch({ set: { 'progress.percent': clamp((done / steps) * 90) } });
        if (now() - lastEmit > 700) {
          lastEmit = now();
          broadcast(doc);
        }
      },
      isCancelled: async () => !(await store.patch(jobId, workerId, {})),
    });

    job = await patch({ set: { 'progress.phase': 'Saving package', 'progress.percent': 95 } });
    broadcast(job);

    const fileName = `${sanitizeFilename(course.title)} - Udemy package.zip`;
    const key = `publishing/exports/${jobId}/${fileName}`;
    const stored = await storage.putObjectFile(config.minio.videoBucket, key, tmpFile, 'application/zip');

    job = owned(await store.settle(jobId, workerId, {
      status: PUBLISH_STATUS.COMPLETED,
      set: {
        completedAt: new Date(now()),
        'progress.percent': 100,
        'progress.phase': 'Ready to download',
        exportResult: {
          bucket: stored.bucket, key: stored.key, fileName, size: stored.size, validation, totals: validation.totals,
        },
      },
      unset: ['dedupeKey'],
      ev: [PUBLISH_STATUS.COMPLETED, `Package ready (${(stored.size / 1048576).toFixed(1)} MB, ${bytes ? 'with' : 'without'} media)`],
    }));
    broadcast(job);
    LoggerService.info('Udemy package exported', { jobId, courseId: job.courseId, size: stored.size });
    return { outcome: 'completed' };
  } catch (rawErr) {
    let err = rawErr;
    if (!(err instanceof PublishError)) {
      err = err?.code === 'ENOSPC'
        ? new PublishError('UNKNOWN', 'The server ran out of disk space while building the package', { action: 'Free disk space on the server, then retry.' })
        : new PublishError('SERVER', `Packaging failed: ${err?.message || 'unknown error'}`, { retryable: true, cause: rawErr });
    }
    return handleFailure({ err, jobId, workerId, store, enqueue, now, settings, broadcast });
  } finally {
    await fs.promises.rm(tmpFile, { force: true }).catch(() => {});
  }
}

module.exports = { processExportJob };
