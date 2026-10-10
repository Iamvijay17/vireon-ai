const { PublishError } = require('../errors');
const { computeBackoffMs } = require('../../../utils/backoff');
const { toInsertBody } = require('./metadata');

const MAX_CHUNK_RETRIES = 5; // consecutive transient failures on one chunk before the job-level retry takes over
const MAX_SESSION_RESTARTS = 2; // times an expired/rejected session may be replaced within one run
const MAX_STALLS = 3; // responses that confirm no new bytes in a row

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The YouTube resumable upload (videos.insert, uploadType=resumable), driven
 * from MinIO byte ranges.
 *
 * Why this shape:
 *  - The session URL is persisted the moment it exists (hooks.saveSession), so
 *    after a crash/restart the next run asks YouTube "how much do you have?"
 *    and continues from there instead of re-sending gigabytes.
 *  - Chunks are read straight from storage by range - no local temp copy of
 *    the video, and any offset YouTube reports is directly resumable.
 *  - After any transient failure the server may already hold part (or all) of
 *    the chunk, so we ask for its real offset rather than assuming; the
 *    response to that query can also reveal a finished upload whose final
 *    reply was lost - in which case we return the video instead of sending it
 *    again (this is what prevents a duplicate upload).
 *
 * Returns `{ video }` only when YouTube answered 200/201 with the video
 * resource - i.e. the remote API confirmed it. Anything else throws.
 *
 * @param {object} p
 * @param {object} p.job        { accountId, metadata, source{bucket,key,size,contentType}, session }
 * @param {object} p.api        YouTubeApi
 * @param {object} p.auth       YouTubeAuthService (getAccessToken)
 * @param {object} p.storage    storage provider (getObjectRange)
 * @param {number} p.chunkSize  bytes, multiple of 256 KiB
 * @param {object} p.hooks      saveSession(url), clearSession(), onProgress(done,total), checkCancelled()
 */
async function uploadToYouTube({ job, api, auth, storage, chunkSize, hooks, sleep = defaultSleep }) {
  const { bucket, key, size: total, contentType } = job.source;
  if (!(total > 0)) throw new PublishError('SOURCE_MISSING', 'The video file is empty or missing');

  const withAuth = async (fn) => {
    try {
      return await fn(await auth.getAccessToken(job.accountId));
    } catch (err) {
      if (err instanceof PublishError && err.code === 'AUTH_EXPIRED') {
        // The cached token went stale (revoked early / clock skew): mint a fresh one once.
        return fn(await auth.getAccessToken(job.accountId, { forceRefresh: true }));
      }
      throw err;
    }
  };

  let sessionUrl = job.session || '';
  let offset = 0;
  let restarts = 0;

  const openSession = async () => {
    sessionUrl = await withAuth((token) =>
      api.initiateUpload(token, { body: toInsertBody(job.metadata), size: total, contentType })
    );
    offset = 0;
    await hooks.saveSession(sessionUrl);
  };

  const replaceSession = async () => {
    if (restarts >= MAX_SESSION_RESTARTS) {
      throw new PublishError('SERVER', 'YouTube kept dropping the upload session', { retryable: true });
    }
    restarts += 1;
    await hooks.clearSession();
    await openSession();
  };

  // Ask YouTube what it has. A finished upload surfaces here as { done: true }.
  const query = () => withAuth((token) => api.queryUpload(token, sessionUrl, { total }));

  // Transient errors are retried here with backoff for as long as the budget
  // allows; the rest (permanent / auth / quota) go straight to the job level.
  const retryTransient = async (err, attempt) => {
    if (!(err instanceof PublishError) || !err.retryable || err.defer || err.code === 'SESSION_EXPIRED') throw err;
    if (attempt > MAX_CHUNK_RETRIES) throw err;
    await sleep(err.retryAfterMs ?? computeBackoffMs(attempt, { base: 1000, max: 30_000 }));
  };

  // ── establish a session, or resume the one we have ──
  if (!sessionUrl) {
    await openSession();
  } else {
    for (let attempt = 1; ; attempt += 1) {
      try {
        const state = await query();
        if (state.done) return { video: state.video };
        offset = state.nextOffset;
        break;
      } catch (err) {
        if (err instanceof PublishError && err.code === 'SESSION_EXPIRED') {
          await replaceSession();
          break;
        }
        await retryTransient(err, attempt);
      }
    }
  }
  await hooks.onProgress(offset, total);

  // ── send the rest ──
  let failures = 0;
  let stalls = 0;
  while (offset < total) {
    await hooks.checkCancelled();

    const length = Math.min(chunkSize, total - offset);
    const chunk = await storage.getObjectRange(bucket, key, offset, length);
    if (chunk.length !== length) {
      throw new PublishError('SOURCE_CHANGED', 'The stored video is shorter than when this draft was created');
    }

    let result;
    let recovered = false; // result came from a status query after a failure, not from sending data
    try {
      result = await withAuth((token) => api.uploadChunk(token, sessionUrl, { chunk, start: offset, total, contentType }));
      failures = 0;
    } catch (err) {
      if (err instanceof PublishError && err.code === 'SESSION_EXPIRED') {
        await replaceSession();
        continue;
      }
      failures += 1;
      await retryTransient(err, failures);
      // Find out how far YouTube really got before sending anything again.
      try {
        result = await query();
        recovered = true;
      } catch (queryErr) {
        if (queryErr instanceof PublishError && queryErr.code === 'SESSION_EXPIRED') {
          await replaceSession();
          continue;
        }
        await retryTransient(queryErr, failures);
        continue;
      }
    }

    if (result.done) {
      await hooks.onProgress(total, total);
      return { video: result.video };
    }

    // Stall detection is for a server that ACCEPTS data yet confirms none of it;
    // a status query after a failure legitimately reports "nothing new" (the
    // failure budget above bounds that case).
    if (!recovered) stalls = result.nextOffset > offset ? 0 : stalls + 1;
    if (stalls >= MAX_STALLS) throw new PublishError('SERVER', 'YouTube stopped accepting upload data', { retryable: true });
    offset = Math.min(result.nextOffset, total);
    await hooks.onProgress(offset, total);
  }

  // Every byte is acknowledged but no final response was seen: ask once more.
  const final = await query();
  if (final.done) {
    await hooks.onProgress(total, total);
    return { video: final.video };
  }
  throw new PublishError('SERVER', 'YouTube received all the data but did not confirm the upload', { retryable: true });
}

module.exports = { uploadToYouTube, MAX_CHUNK_RETRIES, MAX_SESSION_RESTARTS };
