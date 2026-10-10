const { startPublishingWorker } = require('./publishingWorkerBase');
const { QUEUE_NAMES } = require('../queues/publishingQueues');
const { getRuntime } = require('../services/social');
const { processSocialPost } = require('../services/social/processSocialPost');
const { getStorageProvider } = require('../services/storage/providers');
const SocialPost = require('../models/SocialPost');
const LoggerService = require('../services/common/LoggerService');
const config = require('../config');
const { SOCIAL_PLATFORM } = require('../constants');

/**
 * Promotion Studio worker: `npm run social-worker`.
 * Consumes the `social-publishing` queue - posts to Facebook Pages, Instagram and Threads.
 *
 * Besides delivering jobs it runs the two duties that make scheduling and logins durable:
 *   - every SOCIAL_SCHEDULER_INTERVAL_MS it promotes SCHEDULED posts whose time has come (so a
 *     Redis flush or a restart cannot lose a scheduled post - Mongo is the source of truth);
 *   - every few hours it renews Threads tokens that are close to expiry and flags accounts whose
 *     access has already lapsed, so the dashboard asks for reauthorisation BEFORE a post fails.
 *
 * Several workers (dev + prod share one queue and database) are safe: promotion is an atomic
 * transition, the claim is lease-guarded, and every worker must use the same
 * PUBLISHING_TOKEN_ENCRYPTION_KEY.
 */
const concurrency = parseInt(process.env.SOCIAL_WORKER_CONCURRENCY, 10) || 2;
const TOKEN_TICK_MS = 6 * 3600_000;

const worker = startPublishingWorker({
  role: 'social',
  queueName: QUEUE_NAMES.social,
  platform: { $in: Object.values(SOCIAL_PLATFORM) },
  concurrency,
  idField: 'postId',
  sweepOptions: { Job: SocialPost },
  buildProcessor: ({ workerId }) => {
    const { apis, auth, store, service } = getRuntime();
    const enqueue = (post, opts) => service.enqueue(post, opts);
    return (postId) => processSocialPost(postId, { store, auth, apis, storage: getStorageProvider(), enqueue, workerId });
  },
  enqueueFor: () => (post, opts) => getRuntime().service.enqueue(post, opts),
  ticks: [
    {
      name: 'scheduler',
      everyMs: config.social.schedulerIntervalMs,
      run: async () => {
        const promoted = await getRuntime().service.promoteDue();
        if (promoted) LoggerService.info(`Scheduler promoted ${promoted} scheduled post(s)`);
      },
    },
    {
      name: 'token maintenance',
      everyMs: TOKEN_TICK_MS,
      run: async () => {
        const result = await getRuntime().auth.refreshDueTokens();
        if (result.refreshed || result.expired || result.failed) LoggerService.info('Social token maintenance', result);
      },
    },
  ],
});

module.exports = worker;
