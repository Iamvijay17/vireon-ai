const fs = require('fs').promises;
const path = require('path');
const config = require('../../../config');
const LoggerService = require('../../common/LoggerService');
const ActivityLogService = require('../../common/ActivityLogService');
const JobEventService = require('../../common/JobEventService');
const StorageService = require('../../storage/StorageService');
const { buildAllowedHosts } = require('../../../utils/assetUrlGuard');
const VideoQualityService = require('./VideoQualityService');
const { QualityCheckError } = require('./QualityCheckError');
const { skippedReport, isRenderFault, describeIssues } = require('./report');

const isCancel = (err) => err?.name === 'AbortError' || err?.cancelled === true;

/** The real storage and network, behind the seams VideoQualityService injects. */
function defaultDeps() {
  const { getStorageProvider } = require('../../storage/providers');
  const LayoutQcService = require('../LayoutQcService');
  const allowedHosts = buildAllowedHosts(config);
  return {
    objectExists: (jobId, file) => getStorageProvider().objectExists(jobId, 'audio', file),
    probeImage: (url) => LayoutQcService.probeImage(url, { allowedHosts }),
  };
}

/**
 * The finished render is bad in a way another render can fix, so make sure the
 * retry actually renders. A retry skips the render when its fingerprint matches
 * the assets (RemotionService.isRenderCurrent) - and a failed-QC render matches
 * them perfectly, so without this the job would "retry" by re-checking the
 * same broken file until its budget ran out.
 */
async function discardRender(id) {
  const jobDir = StorageService.getJobDir(String(id));
  await fs.rm(path.join(jobDir, '.render-fingerprint'), { force: true }).catch(() => {});
  await fs.rm(StorageService.getRenderDir(String(id)), { recursive: true, force: true }).catch(() => {});
}

/**
 * The output quality gate as a pipeline step. Runs right after a video is
 * rendered (or its existing render is reused) and before anything is uploaded or
 * marked complete: records the report on the job, an event and an activity-log
 * line, and - in `enforce` mode, the default - throws QualityCheckError when a
 * required check fails, so the job never reaches COMPLETED with a broken file.
 *
 * A checker that itself breaks (ffmpeg missing, a probe crash) never blocks a
 * video: that produces a `skipped` report saying why. Cancellation passes through.
 *
 * Shared by the standalone-video worker and the course render stage.
 *
 * @param {object} args
 * @param {string|object} args.id          job / course-video id
 * @param {object[]} args.scenes           the final script scenes
 * @param {string} [args.resolution]
 * @param {AbortSignal} [args.signal]
 * @param {(report: object) => Promise<void>} [args.save]  persists the report on the owning record
 * @param {object} [args.deps]             test seams, merged over the real ones
 * @returns {Promise<object|null>} the report, or null when QC_VIDEO_MODE=off
 */
async function runVideoQualityGate({ id, scenes, resolution, signal, save, videoPath, deps }) {
  const settings = config.qc.video;
  if (settings.mode === 'off') return null;

  const jobId = String(id);
  const file = videoPath || path.join(StorageService.getRenderDir(jobId), 'video.mp4');

  let report;
  try {
    report = await VideoQualityService.run({ jobId, scenes, videoPath: file, resolution, signal, deps: { ...defaultDeps(), ...deps } });
  } catch (err) {
    if (isCancel(err)) throw err;
    LoggerService.warn('Quality check could not run - not blocking completion', { jobId, error: err.message });
    report = skippedReport(`The quality check could not run: ${String(err.message).slice(0, 200)}`, settings.mode);
  }

  if (save) {
    await Promise.resolve(save(report)).catch((err) =>
      LoggerService.warn('Could not save the quality report', { jobId, error: err.message }));
  }
  await JobEventService.append(jobId, 'qualityReport', {
    jobId,
    status: report.status,
    errors: report.summary.errors,
    warnings: report.summary.warnings,
    durationMs: report.durationMs,
    issues: report.issues.slice(0, 40),
  }).catch((err) => LoggerService.warn('Could not record the quality report event', { jobId, error: err.message }));

  await ActivityLogService.add(jobId, activityLine(report, settings.mode));

  if (!report.passed && settings.mode === 'enforce') {
    const renderFault = isRenderFault(report);
    if (renderFault) await discardRender(jobId);
    throw new QualityCheckError(report, { renderFault });
  }
  return report;
}

function activityLine(report, mode) {
  if (report.status === 'skipped') return `Quality check skipped: ${report.skippedReason}`;
  if (report.status === 'passed') return 'Quality check passed.';
  const { errors, warnings } = report.summary;
  const counts = `${errors} error(s), ${warnings} warning(s)`;
  if (report.passed) return `Quality check passed with warnings (${counts}): ${describeIssues(report, { severity: 'warn', limit: 3 })}`;
  const verdict = mode === 'enforce' ? 'failed' : 'found problems (report only)';
  return `Quality check ${verdict} (${counts}): ${describeIssues(report)}`;
}

module.exports = { runVideoQualityGate, discardRender, activityLine };
