const { Worker } = require('bullmq');
const mongoose = require('mongoose');
const config = require('../config');
// Same fail-fast guard server.js and the other workers apply - see config/validate.js.
require('../config/validate').assertValidOrExit(config);
const LoggerService = require('../services/common/LoggerService');
require('../utils/ensureRedis')();

const SocketService = require('../services/common/SocketService');
const { connection } = require('../queues/publishingQueues');
const { sweepPublishingJobs, SWEEP_INTERVAL_MS } = require('../services/publishing/recovery');
const { workerName } = require('./workerIdentity');

/**
 * Shared bootstrap for the two publishing worker processes (YouTube uploads,
 * Udemy package builds): Mongo + Redis pub/sub for live progress, a BullMQ
 * Worker, a periodic recovery sweep, graceful shutdown.
 *
 * Each worker is its own process so a multi-gigabyte upload and a ZIP build
 * never compete, and either can be restarted without touching the other (or
 * the video/course workers). A restart mid-upload loses nothing: the job's
 * state, YouTube's resumable-session URL and its confirmed offset are all in
 * Mongo, and the next claim carries on from them.
 */
function startPublishingWorker({ role, queueName, platform, concurrency, buildProcessor, enqueueFor }) {
  process.on('uncaughtException', (err) => {
    LoggerService.error(`${role} worker uncaught exception`, { error: err.message, stack: err.stack });
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    LoggerService.error(`${role} worker unhandled rejection`, { reason: reason?.message || reason });
  });

  mongoose.connect(config.mongodb.uri, { serverSelectionTimeoutMS: 5000, heartbeatFrequencyMS: 10000 })
    .then(() => LoggerService.success(`${role} worker MongoDB connected`))
    .catch((err) => {
      LoggerService.error(`${role} worker MongoDB connection failed`, { error: err.message });
      process.exit(1);
    });

  SocketService.initRedis();

  const name = workerName(role);
  const processor = buildProcessor({ workerId: name });
  const enqueue = enqueueFor();

  const worker = new Worker(
    queueName,
    async (job) => {
      const { jobId } = job.data;
      LoggerService.border(`📤 ${role}: ${jobId}`, 'event');
      return LoggerService.runWithContext({ jobId }, () => processor(jobId));
    },
    {
      connection: connection(),
      name,
      concurrency,
      // BullMQ renews the lock while this process is alive, so a long upload does
      // not need a long lock; this only bounds how long a crashed worker's lock lingers.
      lockDuration: 300_000,
      stalledInterval: 60_000,
      maxStalledCount: 3,
    }
  );

  worker.on('completed', (job, result) => LoggerService.info(`${role} job ${job.id} finished`, { outcome: result?.outcome }));
  worker.on('failed', (job, err) => LoggerService.error(`${role} job ${job?.id} failed`, { error: err.message }));
  worker.on('error', (err) => LoggerService.error(`${role} worker error`, { error: err.message }));
  worker.on('stalled', (id) => LoggerService.warn(`${role} job ${id} stalled - its worker likely crashed, reclaiming`));

  // Recovery: once at start (after Mongo is up) and then periodically.
  const sweep = () => sweepPublishingJobs({ platform, enqueue }).catch((err) => LoggerService.warn('Publishing recovery sweep failed', { error: err.message }));
  mongoose.connection.once('open', sweep);
  const sweepTimer = setInterval(() => { if (mongoose.connection.readyState === 1) sweep(); }, SWEEP_INTERVAL_MS);
  sweepTimer.unref();

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    LoggerService.info(`${role} worker received ${signal} - finishing active work...`);
    const force = setTimeout(() => {
      LoggerService.warn(`${role} worker shutdown timed out, forcing exit (the job resumes on next start)`);
      process.exit(1);
    }, 30_000);
    try {
      await worker.close();
      clearTimeout(force);
      await mongoose.connection.close();
      process.exit(0);
    } catch (err) {
      clearTimeout(force);
      LoggerService.error(`${role} worker shutdown error`, { error: err.message });
      process.exit(1);
    }
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  LoggerService.border(`📤 ${role} worker started`, 'event');
  LoggerService.info('Worker listening for jobs', { queue: queueName, concurrency, redis: `${config.redis.host}:${config.redis.port}` });
  return worker;
}

module.exports = { startPublishingWorker };
