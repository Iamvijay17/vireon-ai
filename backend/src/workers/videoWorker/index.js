const { Worker } = require('bullmq');
const mongoose = require('mongoose');
const config = require('../../config');
const LoggerService = require('../../services/common/LoggerService');

// Fire-and-forget: spawns a local redis-server if REDIS_HOST is localhost
// and nothing's listening there yet, so the queue connection below doesn't
// spend the next several minutes retrying against a dead port.
require('../../utils/ensureRedis')();

// Mirrors server.js's handlers - this process had neither before, meaning
// any unhandled rejection (e.g. @gradio/client's Client.close() aborting an
// internal SSE reader it never itself catches AbortError on - see
// audioService's sceneSynthesis.js) would crash the whole worker process on
// Node's default unhandled-rejection behavior, silently killing every job
// it was concurrently processing (concurrency: 3), not just the one that
// happened to trigger it. uncaughtException still exits (the process is in
// an undefined state past that point - Node's own default behavior is the
// same, this just guarantees it's logged through LoggerService first);
// unhandledRejection is logged and swallowed instead of being fatal, same
// tradeoff server.js already made.
process.on('uncaughtException', (err) => {
  LoggerService.error('Worker uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  LoggerService.error('Worker unhandled rejection', { reason: reason?.message || reason });
});

// Connect to MongoDB on worker startup
mongoose.connect(config.mongodb.uri, {
  serverSelectionTimeoutMS: 5000,
  heartbeatFrequencyMS: 10000,
}).then(() => {
  LoggerService.success('Worker MongoDB connected successfully');
}).catch((err) => {
  LoggerService.error('Worker MongoDB connection failed', { error: err.message });
  process.exit(1);
});

const { processVideoJob } = require('./processor');

const connection = {
  host: config.redis.host,
  port: config.redis.port,
};

/**
 * Video rendering worker.
 * Processes jobs from the BullMQ queue through the 9-step pipeline (see
 * processor.js). Never crashes - all errors are caught and logged.
 * Supports resuming from failed steps.
 */
const worker = new Worker(
  'video-rendering',
  processVideoJob,
  {
    connection,
    concurrency: 3, // Process up to 3 jobs concurrently
    // BullMQ auto-renews this lock (roughly every lockDuration/2) for as
    // long as the worker process is alive and actively processing - a long
    // render doesn't need a long lockDuration, it just needs the process to
    // stay up. lockDuration only controls how long a *dead* worker's
    // abandoned lock lingers before another worker can reclaim the job. This
    // was set to 60 minutes on the mistaken assumption it needed to cover a
    // whole job's runtime, which meant a crashed/restarted worker left its
    // in-progress job stuck (unreclaimable) for up to an hour - hit this
    // directly (had to manually clear a stuck Redis lock to unstick a job).
    // 5 minutes comfortably covers the renewal interval while keeping
    // crash-recovery fast.
    lockDuration: 300_000,
    stalledInterval: 60_000, // Check for stalled jobs every 60 seconds
    maxStalledCount: 3, // Allow up to 3 stalled checks before failing
    limiter: {
      max: 10, // Max 10 jobs per second
      duration: 1000,
    },
  }
);

worker.on('completed', (job) => {
  LoggerService.info(`Worker completed job ${job.id}`);
});

worker.on('failed', (job, err) => {
  LoggerService.error(`Worker failed job ${job.id}`, { error: err.message });
});

worker.on('error', (err) => {
  LoggerService.error('Worker error', { error: err.message });
});

// Fires when a job's lock expired without renewal (its worker crashed/died
// mid-processing) and BullMQ is reclaiming it for reprocessing. The pipeline
// itself is resumable (script/audio/render steps each skip work already
// persisted), so this is safe - logged so a recurring pattern is visible
// instead of silently eating a few minutes of recovery time every time.
worker.on('stalled', (jobId) => {
  LoggerService.warn(`Job ${jobId} stalled - its worker likely crashed mid-processing, reclaiming for reprocessing`);
});

LoggerService.border('🎥 Video Worker Started', 'event');
LoggerService.info('Worker listening for jobs', {
  queue: 'video-rendering',
  concurrency: 3,
  redis: `${config.redis.host}:${config.redis.port}`,
});

module.exports = worker;
