const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const config = require('../../config');
const { rankStages, activeMs } = require('./benchmarkAnalysis');

/**
 * Builds the record scripts/benchPipeline.js stores in PerfBenchmark: what machine, which
 * model/workflow versions, which settings, how long each stage took and how much memory it
 * held, and whether the output passed the quality gate. Reads only; nothing is estimated.
 * A value that cannot be read is null, never a guess.
 */

const run = (cmd, args) =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout: 4000, windowsHide: true }, (err, stdout) => resolve(err ? null : String(stdout).trim()));
  });

async function readHardware() {
  const cpus = os.cpus();
  const gpuRow = await run('nvidia-smi', ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader,nounits']);
  const [gpuName, vramTotalMb, driver] = gpuRow ? gpuRow.split('\n')[0].split(',').map((s) => s.trim()) : [];
  return {
    os: `${os.type()} ${os.release()}`,
    cpuModel: cpus[0]?.model?.trim() || null,
    cpuThreads: cpus.length,
    ramTotalMb: Math.round(os.totalmem() / 1048576),
    gpu: gpuName ? { name: gpuName, vramTotalMb: Number(vramTotalMb) || null, driver: driver || null } : null,
  };
}

const sha1 = (file) => {
  try {
    return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 12);
  } catch {
    return null;
  }
};

function remotionVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../remotion/package.json'), 'utf8')).dependencies.remotion;
  } catch {
    return null;
  }
}

/** Model / workflow identifiers actually configured. The workflow is identified by content hash. */
function readVersions() {
  return {
    node: process.version,
    remotion: remotionVersion(),
    llm: { model: config.ollama.model, numCtx: config.ollama.numCtx ?? null },
    tts: { modelSize: config.tts.modelSize, fastModelSize: config.tts.fastModelSize },
    alignment: { provider: config.speech?.alignment?.provider ?? null, model: config.speech?.alignment?.model ?? null },
    images: config.imageGen?.enabled
      ? { checkpoint: config.imageGen.checkpoint || null, workflow: path.basename(config.imageGen.workflowPath || ''), workflowHash: sha1(config.imageGen.workflowPath) }
      : { enabled: false },
  };
}

/** Sum the cache ledger's counters per kind. null when the ledger cannot be read. */
async function cacheTotals() {
  try {
    const CacheEntry = require('../../models/CacheEntry');
    const rows = await CacheEntry.aggregate([{ $group: { _id: '$kind', hits: { $sum: '$hits' }, misses: { $sum: '$misses' }, shared: { $sum: '$shared' } } }]);
    return Object.fromEntries(rows.map((r) => [r._id, { hits: r.hits, misses: r.misses, shared: r.shared }]));
  } catch {
    return null;
  }
}

/** Counter change per kind between two cacheTotals() reads. */
function cacheDelta(before, after) {
  if (!before || !after) return null;
  const out = {};
  for (const kind of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const b = before[kind] || { hits: 0, misses: 0, shared: 0 };
    const a = after[kind] || { hits: 0, misses: 0, shared: 0 };
    const hits = a.hits - b.hits;
    const misses = a.misses - b.misses;
    if (hits || misses || a.shared - b.shared) {
      out[kind] = { hits, misses, shared: a.shared - b.shared, hitRatePct: hits + misses > 0 ? Math.round((hits / (hits + misses)) * 1000) / 10 : null };
    }
  }
  return out;
}

/**
 * Assemble the stored record from a finished job document. `job` is a lean VideoJob.
 * Pure given its inputs (hardware/versions/cache reads are passed in), so it is testable.
 */
function buildRecord({ job, submittedAt, finishedAt, hardware, versions, cacheBefore, cacheAfter, label = '', notes = '', profile = null }) {
  const scenes = job.script?.scenes || [];
  const audioSeconds = scenes.reduce((n, s) => n + (s.audio?.duration || 0), 0);
  const images = scenes.filter((s) => s.imageUrl || s.elements?.image).length;
  const stages = {};
  for (const [key, st] of Object.entries(job.stages || {})) {
    if (!st) continue;
    stages[key] = {
      status: st.status,
      durationMs: st.durationMs ?? null,
      attempt: st.attempt ?? null,
      reused: Boolean(st.reused),
      resources: st.resources ?? null,
    };
  }

  const q = job.qualityReport;
  const firstQueued = (job.statusHistory || []).find((h) => h.from === 'QUEUED');
  const startedAt = new Date(submittedAt);
  const ended = new Date(finishedAt);

  return {
    label,
    kind: 'pipeline',
    jobId: String(job._id),
    status: job.status,
    startedAt,
    finishedAt: ended,
    totalMs: ended - startedAt,
    queueWaitMs: firstQueued ? new Date(firstQueued.timestamp) - startedAt : null,
    hardware,
    versions,
    settings: {
      profile,
      type: job.type,
      resolution: job.resolution,
      quality: job.quality,
      fastAudio: Boolean(job.fastAudio),
      ttsSegmented: process.env.TTS_SEGMENTED === 'true',
      speechAlignment: process.env.ENABLE_SPEECH_ALIGNMENT === 'true',
      imageGeneration: Boolean(config.imageGen?.enabled),
      gpuVramEstimatesMb: config.gpu?.vram ?? null,
      videoWorkerConcurrency: config.videoWorker?.concurrency ?? null,
    },
    workload: { scenes: scenes.length, audioSeconds: Math.round(audioSeconds * 10) / 10, images, topic: job.topic },
    stages,
    activeMs: activeMs(stages),
    ranking: rankStages(stages).map((s) => ({ key: s.key, durationMs: s.durationMs, sharePct: s.sharePct })),
    cache: cacheDelta(cacheBefore, cacheAfter),
    validation: q ? { status: q.status ?? null, passed: q.passed ?? null, summary: q.summary ?? null } : null,
    error: job.error?.message ? { message: job.error.message, step: job.error.step ?? null } : null,
    notes,
  };
}

module.exports = { readHardware, readVersions, cacheTotals, cacheDelta, buildRecord };
