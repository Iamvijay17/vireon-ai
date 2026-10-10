const config = require('../../../config');
const LoggerService = require('../../common/LoggerService');
const PlatformAccount = require('../../../models/PlatformAccount');
const { PUBLISH_STATUS } = require('../../../constants');
const { decideRetry, describeRetry, describeExhausted } = require('../../common/retryPolicy');
const cipher = require('../crypto');
const { PublishError, toStoredError } = require('../errors');
const { quotaDayStart, nextQuotaReset } = require('../quota');
const { validateYouTubeMetadata } = require('./metadata');
const { uploadToYouTube } = require('./YouTubeUploader');
const { watchUrl, studioUrl } = require('./constants');
const events = require('../PublishingEvents');

const MAX_QUOTA_DEFERRALS = 3;
const PROCESSING_RECHECK_MS = 5 * 60_000;
const QUOTA_RESET_PAD_MS = 60_000;
const REJECTED = new Set(['failed', 'rejected', 'deleted']);

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const plain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);
const clampPercent = (done, total) => (total > 0 ? Math.min(100, Math.floor((done / total) * 100)) : 0);

/**
 * Run one YouTube publishing job to its next resting state.
 *
 *   claim -> VALIDATING -> UPLOADING -> PROCESSING -> COMPLETED
 *
 * "Resting state" because a run can also end in RETRYING (transient failure,
 * or waiting for the quota to reset), PROCESSING-with-a-timer (YouTube is
 * still transcoding), or FAILED. All state lives on the job document; this
 * function holds nothing that a crash could lose. Re-running it for the same
 * job is always safe:
 *   - a job that already has a `remote.videoId` is never uploaded again - it
 *     only re-verifies that video;
 *   - one with a stored upload session resumes from YouTube's confirmed offset;
 *   - the claim is atomic and lease-guarded, so two workers cannot both run it.
 *
 * Everything external is injected (store, api, auth, storage, enqueue, sleep),
 * which is what lets the tests drive the whole lifecycle against fakes.
 *
 * @returns {Promise<{outcome: string}>} outcome: skipped | completed | retrying | waiting | failed | cancelled
 */
async function processYouTubeJob(jobId, deps) {
  const {
    store, api, auth, storage, enqueue, workerId,
    settings = config.publishing, sleep = defaultSleep, now = () => Date.now(),
  } = deps;
  const yt = settings.youtube;

  const claimed = await store.claim(jobId, workerId);
  if (!claimed) {
    LoggerService.info('Publishing job not claimable (already handled, cancelled, or owned by another worker)', { jobId });
    return { outcome: 'skipped' };
  }

  const broadcast = (doc) => doc && events.emitJob(doc);
  // A null from the store means the job was cancelled or our lease was taken over.
  const owned = (doc) => {
    if (!doc) throw new PublishError('CANCELLED', 'The job was cancelled or taken over by another worker');
    return doc;
  };
  const patch = async (change) => owned(await store.patch(jobId, workerId, change));

  let job = claimed;
  LoggerService.info('Publishing job started', { jobId, attempt: job.attempts, platform: job.platform });
  broadcast(job);

  try {
    // ── VALIDATING ─────────────────────────────────────────────────────────
    const account = await PlatformAccount.findOne({ _id: job.accountId, ownerId: job.ownerId });
    if (!account) throw new PublishError('AUTH_REVOKED', 'The publishing account was disconnected - connect it again');
    if (account.status === PlatformAccount.ACCOUNT_STATUS.NEEDS_REAUTH) {
      throw new PublishError('AUTH_REVOKED', account.statusReason || 'This account needs to be reconnected');
    }

    if (!job.remote?.videoId) {
      try {
        validateYouTubeMetadata(plain(job).metadata, { apiVerified: yt.apiVerified, now: now() });
      } catch (err) {
        throw new PublishError('INVALID_METADATA', err.details?.map((d) => `${d.field}: ${d.message}`).join('; ') || err.message);
      }

      const source = plain(job).source;
      const stat = await storage.statObject(source.bucket, source.key);
      if (!stat || !(stat.size > 0)) throw new PublishError('SOURCE_MISSING', 'The rendered video is no longer in storage');
      if (stat.size !== source.size || (source.etag && stat.etag && stat.etag !== source.etag)) {
        throw new PublishError('SOURCE_CHANGED', 'The stored video changed after this draft was created');
      }
      if (stat.size > yt.maxUploadBytes) {
        throw new PublishError('SOURCE_TOO_LARGE', `The video is ${Math.round(stat.size / 1048576)} MB; the configured limit is ${Math.round(yt.maxUploadBytes / 1048576)} MB`);
      }

      const session = await store.readSession(jobId);
      if (!session) {
        const used = await store.countUploadsSince(quotaDayStart(new Date(now())));
        if (used >= yt.dailyUploadLimit) {
          throw new PublishError('QUOTA_EXCEEDED', `Today's upload allowance (${yt.dailyUploadLimit}) is used up`);
        }
      }

      // ── UPLOADING ────────────────────────────────────────────────────────
      job = await patch({
        set: { status: PUBLISH_STATUS.UPLOADING, 'progress.phase': 'Uploading', 'progress.bytesTotal': source.size },
        ev: [PUBLISH_STATUS.UPLOADING, session ? 'Resuming upload' : 'Starting upload'],
      });
      broadcast(job);

      let lastEmit = 0;
      const { video } = await uploadToYouTube({
        job: { accountId: job.accountId, metadata: plain(job).metadata, source, session },
        api, auth, storage, sleep,
        chunkSize: yt.chunkSizeBytes,
        hooks: {
          async saveSession(url) {
            await patch({
              set: { 'remote.sessionEnc': cipher.encrypt(url), quotaCountedAt: new Date(now()) },
              ev: [PUBLISH_STATUS.UPLOADING, 'Upload session opened with YouTube'],
            });
          },
          async clearSession() {
            await patch({ set: { 'remote.sessionEnc': '' }, ev: [PUBLISH_STATUS.UPLOADING, 'Upload session expired - opening a new one', 'warn'] });
          },
          async onProgress(done, total) {
            const doc = await patch({
              set: { 'progress.bytesUploaded': done, 'progress.bytesTotal': total, 'progress.percent': clampPercent(done, total) },
            });
            if (now() - lastEmit > 700 || done >= total) {
              lastEmit = now();
              broadcast(doc);
            }
          },
          async checkCancelled() {
            // patch() both renews the lease and proves we still own the job.
            await patch({});
          },
        },
      });

      // YouTube confirmed the upload. Persist the id BEFORE anything else can
      // fail, so a later retry verifies this video instead of uploading again.
      job = await patch({
        set: {
          status: PUBLISH_STATUS.PROCESSING,
          'remote.videoId': video.id,
          'remote.url': watchUrl(video.id),
          'remote.studioUrl': studioUrl(video.id),
          'remote.sessionEnc': '',
          'remote.uploadStatus': video.status?.uploadStatus || 'uploaded',
          'remote.privacyStatus': video.status?.privacyStatus || plain(job).metadata.privacyStatus,
          'progress.percent': 100,
          'progress.bytesUploaded': source.size,
          'progress.phase': 'Processing on YouTube',
        },
        ev: [PUBLISH_STATUS.PROCESSING, `YouTube accepted the upload (video ${video.id})`],
      });
      broadcast(job);
    } else if (job.status !== PUBLISH_STATUS.PROCESSING) {
      job = await patch({
        set: { status: PUBLISH_STATUS.PROCESSING, 'progress.phase': 'Processing on YouTube' },
        ev: [PUBLISH_STATUS.PROCESSING, 'Upload already confirmed - verifying the video on YouTube'],
      });
      broadcast(job);
    }

    // ── PROCESSING: wait for YouTube to finish with the video ──────────────
    const videoId = job.remote.videoId;
    const withToken = async (fn) => {
      try {
        return await fn(await auth.getAccessToken(job.accountId));
      } catch (err) {
        if (err instanceof PublishError && err.code === 'AUTH_EXPIRED') return fn(await auth.getAccessToken(job.accountId, { forceRefresh: true }));
        throw err;
      }
    };

    const deadline = now() + yt.processingWindowMs;
    for (;;) {
      const status = await withToken((token) => api.getVideoStatus(token, videoId));
      if (!status) throw new PublishError('REMOTE_REJECTED', 'YouTube no longer has this video (it may have been deleted in Studio)');
      if (REJECTED.has(status.uploadStatus)) {
        const why = status.rejectionReason || status.failureReason || status.processingFailureReason || status.uploadStatus;
        throw new PublishError('REMOTE_REJECTED', `YouTube ${status.uploadStatus} the video (${why})`);
      }

      if (status.uploadStatus === 'processed') {
        job = await store.settle(jobId, workerId, {
          status: PUBLISH_STATUS.COMPLETED,
          set: {
            completedAt: new Date(now()),
            'remote.uploadStatus': status.uploadStatus,
            'remote.processingState': status.processingStatus || 'succeeded',
            'remote.privacyStatus': status.privacyStatus || job.remote.privacyStatus,
            'progress.percent': 100,
            'progress.phase': 'Published',
            error: { code: '', message: '', action: '', retryable: false, httpStatus: null, at: null },
          },
          ev: [PUBLISH_STATUS.COMPLETED, `YouTube finished processing the video (${status.privacyStatus || 'private'})`],
        });
        owned(job);
        broadcast(job);
        LoggerService.info('Publishing job completed', { jobId, videoId });
        return { outcome: 'completed' };
      }

      await patch({ set: { 'remote.uploadStatus': status.uploadStatus, 'remote.processingState': status.processingStatus || '' } });

      if (now() >= deadline) {
        const checks = (job.processingChecks || 0) + 1;
        if (checks > yt.processingMaxChecks) {
          throw new PublishError('PROCESSING_TIMEOUT', 'YouTube is still processing the video after the maximum wait');
        }
        const nextRetryAt = new Date(now() + PROCESSING_RECHECK_MS);
        job = owned(await store.settle(jobId, workerId, {
          status: PUBLISH_STATUS.PROCESSING,
          set: { nextRetryAt, processingChecks: checks },
          ev: [PUBLISH_STATUS.PROCESSING, `Still processing on YouTube - checking again at ${nextRetryAt.toISOString()}`],
        }));
        await enqueue(job, { delayMs: PROCESSING_RECHECK_MS });
        broadcast(job);
        return { outcome: 'waiting' };
      }

      await sleep(yt.processingPollMs);
      await patch({}); // lease renewal + cancellation check
    }
  } catch (err) {
    return handleFailure({ err, jobId, workerId, store, enqueue, now, settings, broadcast });
  }
}

/**
 * Decide what a failed run becomes:
 *   cancelled                -> nothing more to do (the API already set CANCELLED)
 *   account needs reconnect  -> FAILED, not retryable until reconnected
 *   daily quota exhausted    -> RETRYING at the next quota reset (bounded, free of attempts)
 *   transient + budget left  -> RETRYING with exponential backoff
 *   anything else            -> FAILED with an actionable message
 */
async function handleFailure({ err, jobId, workerId, store, enqueue, now, settings, broadcast }) {
  const pe = err instanceof PublishError ? err : new PublishError('UNKNOWN', err?.message || 'Unexpected error', { cause: err });

  if (pe.code === 'CANCELLED') {
    LoggerService.info('Publishing job stopped (cancelled or lease lost)', { jobId });
    return { outcome: 'cancelled' };
  }

  LoggerService.warn('Publishing job run failed', { jobId, code: pe.code, retryable: pe.retryable, httpStatus: pe.httpStatus, reason: pe.reason, message: pe.message });

  const current = await store.get(jobId);
  if (!current) return { outcome: 'failed' };
  const attempt = current.attempts || 1;
  const maxAttempts = current.maxAttempts || settings.youtube.maxAttempts;

  // Quota: not the job's fault and not worth an attempt - wait for the reset.
  if (pe.defer && (current.deferrals || 0) < MAX_QUOTA_DEFERRALS) {
    const nextRetryAt = new Date(nextQuotaReset(new Date(now())).getTime() + QUOTA_RESET_PAD_MS);
    const updated = await store.settle(jobId, workerId, {
      status: PUBLISH_STATUS.RETRYING,
      set: { nextRetryAt, error: toStoredError(pe) },
      inc: { deferrals: 1, attempts: -1 },
      ev: [PUBLISH_STATUS.RETRYING, `${pe.message}. Waiting for the quota reset (${nextRetryAt.toISOString()}).`, 'warn'],
    });
    if (updated) {
      await enqueue(updated, { delayMs: nextRetryAt.getTime() - now() });
      broadcast(updated);
    }
    return { outcome: 'retrying' };
  }

  // Transient: bounded exponential backoff, shared policy with the video workers.
  const decision = decideRetry({ attempt, maxRetries: maxAttempts - 1, eligible: pe.retryable && !pe.defer && pe.code !== 'PROCESSING_TIMEOUT' });
  if (decision.shouldRetry) {
    // From the injected clock (not decision.nextRetryAt, which reads the wall clock) so the
    // stored time and the queue delay are computed from the same instant.
    const nextRetryAt = new Date(now() + decision.delayMs);
    const updated = await store.settle(jobId, workerId, {
      status: PUBLISH_STATUS.RETRYING,
      set: { nextRetryAt, error: toStoredError(pe) },
      ev: [PUBLISH_STATUS.RETRYING, describeRetry({ step: 'Publishing', attempt, maxRetries: maxAttempts, delayMs: decision.delayMs, reason: pe.message }), 'warn'],
    });
    if (updated) {
      await enqueue(updated, { delayMs: decision.delayMs });
      broadcast(updated);
    }
    return { outcome: 'retrying' };
  }

  // Terminal. Release the duplicate lock so the user can fix and retry or start over.
  const stored = toStoredError(pe);
  const updated = await store.settle(jobId, workerId, {
    status: PUBLISH_STATUS.FAILED,
    set: { error: stored },
    unset: ['dedupeKey'],
    ev: [PUBLISH_STATUS.FAILED, pe.retryable ? describeExhausted({ step: 'Publishing', attempt, reason: pe.message }) : pe.message, 'error'],
  });
  if (updated) broadcast(updated);
  return { outcome: 'failed' };
}

module.exports = { processYouTubeJob, handleFailure, MAX_QUOTA_DEFERRALS, PROCESSING_RECHECK_MS };
