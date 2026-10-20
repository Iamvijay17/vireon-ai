const config = require('../../config');
const LoggerService = require('../common/LoggerService');
const MetricsService = require('../common/MetricsService');
const { GpuScheduler } = require('./GpuScheduler');
const { createVramProbe } = require('./vram');
const { RedisTicketQueue } = require('./RedisTicketQueue');
const ledger = require('./gpuTaskLedger');
const { workerName } = require('../../workers/workerIdentity');

/**
 * Build the process's GpuScheduler from config and attach it to `gpu`, so every
 * existing `gpu.withGPU(...)` call site becomes a scheduled task without
 * changing shape. Called once by services/localAI/index.js.
 *
 * GPU_SCHEDULER=false opts out entirely (withGPU() goes back to being the plain
 * acquire -> run -> release) - a way back if the scheduler ever misbehaves on
 * the real card.
 */
function attachGpuScheduler(gpu) {
  if (process.env.GPU_SCHEDULER === 'false') return null;

  // The cross-process line only means anything - and only costs a Redis
  // connection - when the lease it feeds is in use.
  let global = null;
  if (config.gpu.coordinator === 'redis') {
    const Redis = require('ioredis');
    const client = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      lazyConnect: true,
      // Fail fast (the scheduler fails open to the lease alone) rather than
      // hanging a GPU task on an unreachable Redis.
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });
    // One line per outage window, not one per reconnect attempt.
    let lastWarnAt = 0;
    client.on('error', (err) => {
      if (Date.now() - lastWarnAt < 30_000) return;
      lastWarnAt = Date.now();
      LoggerService.warn('[GPU] Ticket queue Redis error', { error: err.message || err.code });
    });
    global = new RedisTicketQueue({
      client,
      owner: workerName('gpu'),
      ttlMs: config.gpu.scheduler.ticketTtlMs,
    });
  }

  const scheduler = new GpuScheduler({
    gpu,
    settings: config.gpu,
    maxConcurrent: config.gpu.maxConcurrent,
    probe: createVramProbe({ cacheMs: config.gpu.vram.probeCacheMs }),
    global,
    ledger,
    metrics: MetricsService,
    heartbeatMs: ledger.HEARTBEAT_MS,
    logger: LoggerService,
    worker: workerName('gpu'),
  });
  gpu.attachScheduler(scheduler);
  return scheduler;
}

module.exports = { attachGpuScheduler };
