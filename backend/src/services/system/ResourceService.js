const os = require('os');
const { execFile } = require('child_process');
const axios = require('axios');
const config = require('../../config');
const { HEARTBEAT_MS } = require('../gpu/gpuTaskLedger');

/**
 * Host resource telemetry for the GPU & Resources page.
 *
 * Everything here is measured, never estimated: a figure that cannot be read
 * (no NVIDIA driver, Redis down, ...) is `null`, which the UI shows as
 * "Unavailable". The browser cannot read any of this itself, so it comes from
 * the machine the API runs on - which is also the machine the GPU workers run
 * on in this deployment.
 *
 * The GPU task list is the GpuTask ledger (written by every worker process), not
 * this process's in-memory scheduler: the API process runs no GPU tasks, so its
 * own scheduler view is empty and would read as "idle" while a worker is busy.
 */

// A queued/running task whose heartbeat has been silent this long is shown as
// stale - several missed beats, the same idea as the recovery sweep's threshold.
const STALE_AFTER_MS = HEARTBEAT_MS * 3;

const GPU_QUERY = ['--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu', '--format=csv,noheader,nounits'];

const defaultExec = (cmd, args, opts) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** First row of nvidia-smi csv output -> reading, or null when it is not one. */
function parseGpuReading(stdout) {
  const row = String(stdout || '').trim().split('\n')[0];
  if (!row) return null;
  const [name, util, used, total, temp] = row.split(',').map((s) => s.trim());
  const totalMb = num(total);
  const usedMb = num(used);
  if (!name || totalMb === null || totalMb <= 0 || usedMb === null) return null;
  return {
    name,
    // [N/A] (some laptop / virtualised GPUs) parses to NaN -> null, not 0.
    utilizationPercent: num(util),
    memoryUsedMb: usedMb,
    memoryTotalMb: totalMb,
    temperatureC: num(temp),
  };
}

/** Share of non-idle CPU time between two os.cpus() samples, 0-100. */
function cpuPercentBetween(before, after) {
  let idle = 0;
  let total = 0;
  const cores = Math.min(before.length, after.length);
  for (let i = 0; i < cores; i += 1) {
    const a = before[i].times;
    const b = after[i].times;
    const sum = (t) => t.user + t.nice + t.sys + t.idle + t.irq;
    total += sum(b) - sum(a);
    idle += b.idle - a.idle;
  }
  if (total <= 0) return null;
  return Math.round(Math.min(100, Math.max(0, (1 - idle / total) * 100)) * 10) / 10;
}

function shapeTask(row, nowMs) {
  const active = ['queued', 'running', 'retrying'].includes(row.status);
  const beat = row.heartbeatAt ? new Date(row.heartbeatAt).getTime() : null;
  return {
    taskId: row.taskId,
    jobId: row.jobId || null,
    service: row.service,
    stage: row.stage || null,
    label: row.label || null,
    status: row.status,
    priority: row.priority ?? 0,
    attempts: row.attempts ?? 0,
    enqueuedAt: row.enqueuedAt || null,
    startedAt: row.startedAt || null,
    finishedAt: row.finishedAt || null,
    waitMs: row.waitMs ?? null,
    runMs: row.runMs ?? null,
    admittedUnderPressure: Boolean(row.admittedUnderPressure),
    worker: row.worker || null,
    error: row.error?.message ? { code: row.error.code || null, message: row.error.message } : null,
    // Only a task that should still be alive can be stale.
    stale: active && (beat === null || nowMs - beat > STALE_AFTER_MS),
  };
}

class ResourceService {
  constructor({
    osModule = os,
    exec = defaultExec,
    now = Date.now,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    loadTaskModel = () => require('../../models/GpuTask'),
    probeDependencies = null,
  } = {}) {
    this.os = osModule;
    this.exec = exec;
    this.now = now;
    this.sleep = sleep;
    this.loadTaskModel = loadTaskModel;
    this.probeDependencies = probeDependencies || (() => ResourceService.defaultDependencyChecks());
    this._cpu = { at: 0, value: null };
    this._cpuInFlight = null;
  }

  /** CPU load over a short sample window; cached so a polling page does not re-sample each call. */
  async readCpu({ sampleMs = 250, cacheMs = 1000 } = {}) {
    if (this._cpu.at && this.now() - this._cpu.at < cacheMs) return this._cpu.value;
    if (this._cpuInFlight) return this._cpuInFlight;
    this._cpuInFlight = (async () => {
      const before = this.os.cpus();
      await this.sleep(sampleMs);
      const after = this.os.cpus();
      const value = { percent: cpuPercentBetween(before, after), cores: after.length };
      this._cpu = { at: this.now(), value };
      return value;
    })().finally(() => {
      this._cpuInFlight = null;
    });
    return this._cpuInFlight;
  }

  readMemory() {
    const totalBytes = this.os.totalmem();
    const freeBytes = this.os.freemem();
    return { totalBytes, usedBytes: totalBytes - freeBytes, freeBytes };
  }

  async readGpu() {
    try {
      const stdout = await this.exec('nvidia-smi', GPU_QUERY, { timeout: 3000, windowsHide: true });
      return parseGpuReading(stdout);
    } catch {
      return null; // no NVIDIA driver / nvidia-smi not on PATH
    }
  }

  async readGpuTasks({ recent = 10 } = {}) {
    try {
      const Task = this.loadTaskModel();
      const [active, finished] = await Promise.all([
        Task.find({ status: { $in: ['queued', 'running', 'retrying'] } }).sort({ enqueuedAt: 1 }).limit(100).lean(),
        Task.find({ status: { $in: ['completed', 'failed', 'cancelled', 'abandoned'] } })
          .sort({ finishedAt: -1 })
          .limit(recent)
          .lean(),
      ]);
      const nowMs = this.now();
      return {
        available: true,
        active: active.map((r) => shapeTask(r, nowMs)),
        recent: finished.map((r) => shapeTask(r, nowMs)),
      };
    } catch {
      return { available: false, active: [], recent: [] };
    }
  }

  static async defaultDependencyChecks() {
    const mongoose = require('mongoose');
    const videoQueue = require('../../queues/videoQueue');
    const withTimeout = (promise, ms) =>
      Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

    const mongo = mongoose.connection.readyState === 1;
    const redis = await (async () => {
      try {
        const client = await videoQueue.client;
        return (await withTimeout(client.ping(), 2000)) === 'PONG';
      } catch {
        return false;
      }
    })();
    const storage = await (async () => {
      try {
        const scheme = config.minio.useSSL ? 'https' : 'http';
        const res = await axios.get(`${scheme}://${config.minio.endpoint}:${config.minio.port}/minio/health/live`, {
          timeout: 2000,
          validateStatus: () => true,
        });
        return res.status === 200;
      } catch {
        return false;
      }
    })();
    return { mongo, redis, storage };
  }

  async snapshot() {
    const [cpu, gpu, gpuTasks, dependencies] = await Promise.all([
      this.readCpu(),
      this.readGpu(),
      this.readGpuTasks(),
      this.probeDependencies().catch(() => ({ mongo: null, redis: null, storage: null })),
    ]);
    return {
      sampledAt: new Date(this.now()).toISOString(),
      cpu,
      memory: this.readMemory(),
      gpu,
      gpuTasks,
      dependencies,
      staleAfterMs: STALE_AFTER_MS,
    };
  }
}

module.exports = new ResourceService();
module.exports.ResourceService = ResourceService;
module.exports.parseGpuReading = parseGpuReading;
module.exports.cpuPercentBetween = cpuPercentBetween;
module.exports.shapeTask = shapeTask;
module.exports.STALE_AFTER_MS = STALE_AFTER_MS;
