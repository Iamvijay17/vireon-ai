const config = require('../../config');
const LoggerService = require('../common/LoggerService');
const PlatformAccount = require('../../models/PlatformAccount');
const { PUBLISH_STATUS, SOCIAL_PLATFORM } = require('../../constants');
const { decideRetry, describeRetry, describeExhausted } = require('../common/retryPolicy');
const { computeBackoffMs } = require('../../utils/backoff');
const { PublishError } = require('../publishing/errors');
const { toStoredSocialError } = require('./errors');
const { validatePost } = require('./contentRules');
const { providerFor } = require('./providers');
const mediaGateway = require('./mediaGateway');
const events = require('./SocialEvents');
const { PLATFORM_DAILY_LIMITS, PLATFORM_LABEL } = require('./constants');

const S = PUBLISH_STATUS;
const MAX_LIMIT_DEFERRALS = 6;
const RECHECK_MS = 2 * 60_000;
const DAY_MS = 24 * 3600_000;
const LIMIT_PAD_MS = 60_000;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const plain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : JSON.parse(JSON.stringify(doc)));
const clampPercent = (done, total) => (total > 0 ? Math.min(100, Math.floor((done / total) * 100)) : 0);

/**
 * Run one social post to its next resting state.
 *
 *   claim -> VALIDATING -> UPLOADING -> PROCESSING -> (publish) -> COMPLETED
 *
 * A run can also end in RETRYING (transient failure / waiting for the platform's
 * daily allowance), PROCESSING-with-a-timer (the platform is still working on
 * the media), or FAILED. Everything the run learns is written to the SocialPost
 * first, so re-running it for the same post is always safe:
 *
 *  - the claim is atomic and lease-guarded - two workers cannot both run it;
 *  - a post that already has `remote.postId` is never published again, only confirmed;
 *  - a container / upload that was already created is resumed, not recreated;
 *  - `remote.publishAttemptedAt` is written BEFORE the publish call. If a run dies
 *    (or the answer is lost) after that, the next run first asks the platform whether
 *    the post exists (provider.reconcile). If it cannot tell for sure it stops with
 *    OUTCOME_UNKNOWN instead of guessing - a human checks, nothing is double-posted.
 *
 * Nothing is reported as published until the platform confirmed it.
 *
 * Everything external is injected (store, auth, apis, storage, enqueue, sleep, clock), which is what
 * lets the tests drive the whole lifecycle against fakes.
 *
 * @returns {Promise<{outcome: string}>} skipped | completed | retrying | waiting | failed | cancelled
 */
async function processSocialPost(postId, deps) {
  const {
    store, auth, apis, storage, enqueue, workerId,
    settings = config.social, sleep = defaultSleep, now = () => Date.now(),
  } = deps;

  // A scheduled post's delayed job may fire before the periodic tick has promoted it.
  await store.promoteIfDue(postId);
  const claimed = await store.claim(postId, workerId);
  if (!claimed) {
    LoggerService.info('Social post not claimable (already handled, cancelled, not due, or owned by another worker)', { postId });
    return { outcome: 'skipped' };
  }

  const broadcast = (doc) => doc && events.emitPost(doc);
  const owned = (doc) => {
    if (!doc) throw new PublishError('CANCELLED', 'The post was cancelled or taken over by another worker');
    return doc;
  };
  let lost = false;
  const patch = async (change) => {
    const doc = await store.patch(postId, workerId, change);
    if (!doc) lost = true;
    return owned(doc);
  };

  let job = claimed;
  LoggerService.info('Social post started', { postId, attempt: job.attempts, platform: job.platform });
  broadcast(job);

  try {
    // ── VALIDATING ─────────────────────────────────────────────────────────
    const account = await PlatformAccount.findOne({ _id: job.accountId, ownerId: job.ownerId, platform: job.platform });
    if (!account) throw new PublishError('AUTH_REVOKED', 'The account was disconnected - connect it again', { action: 'Reconnect the account in Promotion Studio > Accounts, then retry.' });
    if (account.status === PlatformAccount.ACCOUNT_STATUS.NEEDS_REAUTH) {
      throw new PublishError('AUTH_REVOKED', account.statusReason || 'This account needs to be reconnected', { action: 'Reconnect the account in Promotion Studio > Accounts, then retry.' });
    }

    const provider = providerFor(job.platform);
    const api = job.platform === SOCIAL_PLATFORM.THREADS ? apis.threads : apis.meta;
    const post = plain(job);
    const acct = plain(account);

    // Already published and just awaiting confirmation (a Reel the platform is still finishing)?
    const confirming = Boolean(post.remote.postId);

    if (!confirming) {
      const check = validatePost({
        platform: post.platform, content: post.content, media: post.media.key ? { ...post.media, kind: post.media.kind } : null,
        format: post.format, caps: { publicMedia: mediaGateway.isConfigured(settings) },
      });
      if (!check.ok) {
        throw new PublishError('VALIDATION_FAILED', check.errors.map((e) => e.message).join(' '), {
          retryable: false, action: 'Edit the post to fix the problems above, then retry.',
        });
      }

      if (post.media.key) {
        const stat = await storage.statObject(post.media.bucket, post.media.key);
        if (!stat || !(stat.size > 0)) throw new PublishError('SOURCE_MISSING', 'The media file is no longer in storage');
        if (stat.size !== post.media.size || (post.media.etag && stat.etag && stat.etag !== post.media.etag)) {
          throw new PublishError('SOURCE_CHANGED', 'The media changed after this post was created');
        }
      }
    }

    const token = await auth.getAccessToken(job.accountId);
    const hooks = makeHooks({ patch, now, getPost: () => ctx.post, lost: () => lost });
    const ctx = { post, account: acct, token, api, provider, storage, settings, hooks, now, aiLabel: settings.aiLabel !== false && Boolean(post.videoJobId || post.courseVideoId) };

    // ── An earlier run may have sent the publish and lost the answer ──────
    if (!confirming && post.remote.publishAttemptedAt) {
      const found = await provider.reconcile(ctx);
      if (found.found) {
        job = await recordPublished({ ctx, patch, provider, found, postId, workerId, store, now, broadcast });
        return { outcome: 'completed' };
      }
      if (!found.certain) {
        throw new PublishError('OUTCOME_UNKNOWN', `${PLATFORM_LABEL[post.platform]} may or may not have published this post (the earlier request was never confirmed)`);
      }
      job = await patch({ set: { 'remote.publishAttemptedAt': null }, unset: ['quotaCountedAt'], ev: [S.VALIDATING, 'Checked with the platform: the earlier publish did not go through'] });
      ctx.post.remote.publishAttemptedAt = null;
    }

    if (!confirming) {
      // ── local daily allowance (rolling 24 h) ─────────────────────────────
      if (provider.countsTowardDailyLimit(post)) {
        const limit = Math.min(settings.dailyLimits?.[post.platform] ?? Infinity, PLATFORM_DAILY_LIMITS[post.platform]);
        const usage = await store.dailyUsage(job.accountId, job.platform, { predicate: (p) => provider.countsTowardDailyLimit(p) });
        if (usage.used >= limit) {
          throw limitError(post.platform, limit, usage.oldest ? new Date(usage.oldest.getTime() + DAY_MS + LIMIT_PAD_MS) : new Date(now() + 3600_000));
        }
      }

      // ── UPLOADING: create the container / send the bytes ────────────────
      job = await patch({
        set: { status: S.UPLOADING, 'progress.phase': post.media.key ? 'Sending media' : 'Preparing', 'progress.bytesTotal': post.media.size || 0 },
        ev: [S.UPLOADING, post.remote.containerId || post.remote.videoId ? 'Resuming' : 'Preparing the post'],
      });
      broadcast(job);
      await provider.start(ctx);
    }

    // ── PROCESSING: wait for the platform to finish with the media ─────────
    if (!confirming) {
      job = await patch({ set: { status: S.PROCESSING, 'progress.phase': 'Processing on the platform', 'progress.percent': 100 }, ev: [S.PROCESSING, 'Media sent - waiting for the platform to process it'] });
      broadcast(job);

      const deadline = now() + settings.processingWindowMs;
      for (;;) {
        const state = await provider.poll(ctx);
        if (state.state === 'published') {
          // The container was already published (an earlier answer was lost).
          const found = await provider.reconcile({ ...ctx, post: { ...ctx.post, remote: { ...ctx.post.remote, publishAttemptedAt: ctx.post.remote.publishAttemptedAt || new Date(now() - 5 * 60_000) } } });
          if (found.found) {
            job = await recordPublished({ ctx, patch, provider, found, postId, workerId, store, now, broadcast });
            return { outcome: 'completed' };
          }
          throw new PublishError('OUTCOME_UNKNOWN', `${PLATFORM_LABEL[post.platform]} reports this post as published, but its id could not be recovered`);
        }
        if (state.state === 'ready') break;
        if (state.state === 'failed') throw new PublishError('MEDIA_INVALID', state.detail || 'The platform could not process the media');
        if (state.state === 'expired') {
          // Start over with a fresh container on the next attempt.
          await patch({ set: { 'remote.containerId': '', 'remote.videoId': '', 'remote.state': '' } });
          throw new PublishError('MEDIA_UNREACHABLE', state.detail || 'The media container expired', { retryable: true });
        }

        if (now() >= deadline) {
          const checks = (job.processingChecks || 0) + 1;
          if (checks > settings.processingMaxChecks) throw new PublishError('MEDIA_NOT_READY', 'The platform is still processing the media after the maximum wait', { retryable: false, action: 'Retry later; the platform may be slow, or the media may be unsupported.' });
          const nextRetryAt = new Date(now() + RECHECK_MS);
          job = owned(await store.settle(postId, workerId, {
            status: S.PROCESSING, set: { nextRetryAt, processingChecks: checks },
            ev: [S.PROCESSING, `Still processing - checking again at ${nextRetryAt.toISOString()}`],
          }));
          await enqueue(job, { delayMs: RECHECK_MS });
          broadcast(job);
          return { outcome: 'waiting' };
        }
        await sleep(settings.processingPollMs);
        await patch({});
      }

      // ── remote allowance, then PUBLISH ──────────────────────────────────
      if (provider.quota) await remoteQuota({ provider, ctx, post, now });

      const attemptedAt = new Date(now());
      job = await patch({
        set: { 'progress.phase': 'Publishing', 'remote.publishAttemptedAt': attemptedAt, ...(provider.countsTowardDailyLimit(post) ? { quotaCountedAt: attemptedAt } : {}) },
        ev: [S.PROCESSING, 'Publishing'],
      });
      ctx.post.remote.publishAttemptedAt = attemptedAt;
      broadcast(job);

      let result;
      try {
        result = await provider.publish(ctx);
      } catch (err) {
        if (isDefinitiveRefusal(err)) {
          // The platform said no: nothing was published, so release the markers (and the quota count).
          await store.patch(postId, workerId, { set: { 'remote.publishAttemptedAt': null }, unset: ['quotaCountedAt'] }).catch(() => {});
        }
        throw err;
      }

      // Persist the id BEFORE anything else can fail.
      job = await patch({
        set: { 'remote.postId': result.postId, 'remote.state': result.pending ? 'publishing' : 'live', ...(result.permalink ? { 'remote.permalink': result.permalink } : {}) },
        ev: [S.PROCESSING, result.pending ? `Publish requested (${result.postId}) - waiting for the platform to make it live` : `Platform accepted the post (${result.postId})`],
      });
      ctx.post.remote.postId = result.postId;
      ctx.post.remote.state = result.pending ? 'publishing' : 'live';
      if (!result.pending) {
        job = await finish({ ctx, store, postId, workerId, owned, now, permalink: result.permalink });
        broadcast(job);
        return { outcome: 'completed' };
      }
    }

    // ── confirm an asynchronous publish (Reels / videos) ───────────────────
    if (ctx.post.remote.state !== 'live') {
      const deadline = now() + settings.processingWindowMs;
      for (;;) {
        const c = await provider.confirm(ctx);
        if (c.state === 'live') {
          job = await finish({ ctx, store, postId, workerId, owned, now, permalink: c.permalink });
          broadcast(job);
          return { outcome: 'completed' };
        }
        if (c.state === 'failed') throw new PublishError('CONTENT_REJECTED', c.detail || 'The platform could not publish the post');
        if (now() >= deadline) {
          const checks = (job.processingChecks || 0) + 1;
          if (checks > settings.processingMaxChecks) throw new PublishError('MEDIA_NOT_READY', 'The platform has not confirmed the post after the maximum wait', { retryable: false, action: 'Check the account on the platform; if the post is there, nothing more is needed.' });
          const nextRetryAt = new Date(now() + RECHECK_MS);
          job = owned(await store.settle(postId, workerId, {
            status: S.PROCESSING, set: { nextRetryAt, processingChecks: checks },
            ev: [S.PROCESSING, `Waiting for the platform to confirm - checking again at ${nextRetryAt.toISOString()}`],
          }));
          await enqueue(job, { delayMs: RECHECK_MS });
          broadcast(job);
          return { outcome: 'waiting' };
        }
        await sleep(settings.processingPollMs);
        await patch({});
      }
    }

    job = await finish({ ctx, store, postId, workerId, owned, now, permalink: ctx.post.remote.permalink });
    broadcast(job);
    return { outcome: 'completed' };
  } catch (err) {
    return handleFailure({ err, postId, workerId, store, auth, enqueue, now, settings, broadcast });
  }
}

/** Hooks the providers use to persist what they learn and report progress; all lease-guarded through `patch`. */
function makeHooks({ patch, now, getPost, lost }) {
  let lastEmit = 0;
  return {
    async saveRemote(fields) {
      const set = Object.fromEntries(Object.entries(fields).map(([k, v]) => [`remote.${k}`, v]));
      const doc = await patch({ set });
      Object.assign(getPost().remote, fields);
      return doc;
    },
    // Called from inside a streaming upload: never throws into the stream; ownership loss is surfaced via lost().
    async progress(done, total) {
      if (done < total && now() - lastEmit < 700) return;
      lastEmit = now();
      try {
        const doc = await patch({ set: { 'progress.bytesUploaded': done, 'progress.bytesTotal': total, 'progress.percent': clampPercent(done, total) } });
        events.emitPost(doc);
      } catch {
        /* lost() reports it */
      }
    },
    async checkCancelled() {
      await patch({});
    },
    lost,
  };
}

async function remoteQuota({ provider, ctx, post, now }) {
  try {
    const { used, total } = await provider.quota(ctx);
    if (total && used >= total) throw limitError(post.platform, total, new Date(now() + 3600_000));
  } catch (err) {
    // The allowance endpoint failing must not block a post - only a definite "used up" does.
    if (err instanceof PublishError && err.code === 'PUBLISH_LIMIT_REACHED') throw err;
    if (err instanceof PublishError && ['AUTH_REVOKED', 'PERMISSION_DENIED'].includes(err.code)) throw err;
    LoggerService.warn('Could not read the publishing allowance (continuing)', { platform: post.platform, code: err.code });
  }
}

function limitError(platform, limit, retryAt) {
  const err = new PublishError('PUBLISH_LIMIT_REACHED', `${PLATFORM_LABEL[platform]}'s 24-hour publishing limit (${limit}) for this account is used up`);
  err.retryAt = retryAt;
  return err;
}

/** An answer that proves the platform did NOT create the post (as opposed to a timeout / 5xx where we cannot know). */
function isDefinitiveRefusal(err) {
  return err instanceof PublishError && err.httpStatus >= 400 && err.httpStatus < 500 && !['NETWORK', 'SERVER'].includes(err.code);
}

/** Mark COMPLETED: the platform has confirmed the post is live. */
async function finish({ ctx, store, postId, workerId, owned, now, permalink }) {
  const link = permalink || ctx.post.remote.permalink || await ctx.provider?.permalink?.(ctx, ctx.post.remote.postId) || '';
  const at = new Date(now());
  const doc = owned(await store.settle(postId, workerId, {
    status: S.COMPLETED,
    set: {
      completedAt: at, 'remote.publishedAt': at, 'remote.state': 'live', ...(link ? { 'remote.permalink': link } : {}),
      'progress.percent': 100, 'progress.phase': 'Published', nextRetryAt: null,
      error: { code: '', message: '', action: '', retryable: false, requiresReauth: false, httpStatus: null, at: null },
    },
    ev: [S.COMPLETED, `Published (${ctx.post.remote.postId})`],
  }));
  LoggerService.info('Social post published', { postId, platform: doc.platform, remoteId: ctx.post.remote.postId });
  return doc;
}

async function recordPublished({ ctx, patch, provider, found, postId, workerId, store, now, broadcast }) {
  ctx.post.remote.postId = found.postId;
  ctx.post.remote.state = 'live';
  await patch({ set: { 'remote.postId': found.postId, 'remote.state': 'live', ...(found.permalink ? { 'remote.permalink': found.permalink } : {}) }, ev: [S.PROCESSING, `Found the post on the platform (${found.postId}) - not publishing again`] });
  const doc = await finish({ ctx: { ...ctx, provider }, store, postId, workerId, owned: (d) => { if (!d) throw new PublishError('CANCELLED', 'cancelled'); return d; }, now, permalink: found.permalink });
  broadcast(doc);
  return doc;
}

/**
 * Decide what a failed run becomes:
 *   cancelled               -> nothing more to do (the API already set CANCELLED)
 *   reauthorisation needed  -> account flagged, FAILED (retry after reconnecting)
 *   daily allowance used up -> RETRYING at the time it frees up (bounded, free of attempts)
 *   transient + budget left -> RETRYING with exponential backoff (longer for rate limits)
 *   anything else           -> FAILED with an actionable message, duplicate lock released
 */
async function handleFailure({ err, postId, workerId, store, auth, enqueue, now, settings, broadcast }) {
  const pe = err instanceof PublishError ? err : new PublishError('UNKNOWN', err?.message || 'Unexpected error', { cause: err });

  if (pe.code === 'CANCELLED') {
    LoggerService.info('Social post stopped (cancelled or lease lost)', { postId });
    return { outcome: 'cancelled' };
  }
  LoggerService.warn('Social post run failed', { postId, code: pe.code, retryable: pe.retryable, httpStatus: pe.httpStatus, reason: pe.reason, message: pe.message });

  const current = await store.get(postId);
  if (!current) return { outcome: 'failed' };

  if (pe.requiresReauth) {
    const label = PLATFORM_LABEL[current.platform] || 'the platform';
    await auth.markNeedsReauth(current.accountId, pe.code === 'PERMISSION_DENIED'
      ? `${pe.message}. Reconnect ${label} and approve every permission.`
      : `${label} no longer accepts this account's saved access. Reconnect to continue.`).catch(() => {});
  }

  const attempt = current.attempts || 1;
  const maxAttempts = current.maxAttempts || settings.maxAttempts;

  if (pe.defer && (current.deferrals || 0) < MAX_LIMIT_DEFERRALS) {
    const retryAt = pe.retryAt || new Date(now() + 3600_000);
    const updated = await store.settle(postId, workerId, {
      status: S.RETRYING,
      set: { nextRetryAt: retryAt, error: toStoredSocialError(pe) },
      inc: { deferrals: 1, attempts: -1 },
      ev: [S.RETRYING, `${pe.message}. Will continue at ${retryAt.toISOString()}.`, 'warn'],
    });
    if (updated) {
      await enqueue(updated, { delayMs: Math.max(0, retryAt.getTime() - now()) });
      broadcast(updated);
    }
    return { outcome: 'retrying' };
  }

  const rateLimited = pe.code === 'RATE_LIMITED';
  const decision = decideRetry({ attempt, maxRetries: maxAttempts - 1, eligible: pe.retryable && !pe.defer });
  if (decision.shouldRetry) {
    const delayMs = rateLimited ? computeBackoffMs(attempt, { base: 60_000, max: 15 * 60_000 }) : decision.delayMs;
    const nextRetryAt = new Date(now() + delayMs);
    const updated = await store.settle(postId, workerId, {
      status: S.RETRYING,
      set: { nextRetryAt, error: toStoredSocialError(pe) },
      ev: [S.RETRYING, describeRetry({ step: 'Publishing', attempt, maxRetries: maxAttempts, delayMs, reason: pe.message }), 'warn'],
    });
    if (updated) {
      await enqueue(updated, { delayMs });
      broadcast(updated);
    }
    return { outcome: 'retrying' };
  }

  // Terminal. Release the duplicate lock so the user can fix and retry or start over - except when the
  // outcome is unknown: keep the lock, because a second post could be a duplicate of one that is live.
  const unknown = pe.code === 'OUTCOME_UNKNOWN';
  const updated = await store.settle(postId, workerId, {
    status: S.FAILED,
    set: { error: toStoredSocialError(pe), nextRetryAt: null },
    unset: unknown ? [] : ['dedupeKey'],
    ev: [S.FAILED, pe.retryable ? describeExhausted({ step: 'Publishing', attempt, reason: pe.message }) : pe.message, 'error'],
  });
  if (updated) broadcast(updated);
  return { outcome: 'failed' };
}

module.exports = { processSocialPost, handleFailure, isDefinitiveRefusal, MAX_LIMIT_DEFERRALS };
