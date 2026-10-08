/**
 * Performance audit: where does a video's time actually go?
 *
 * MEASURES, does not optimise. Read-only, from what the system already persisted:
 *
 *   - per-stage wall time of every finished job (statusHistory.durationMs, and
 *     VideoJob.stages for jobs run since stage tracking), as a share of active time
 *   - queue wait (createdAt -> first worker status) and time parked on a person
 *   - retries and the time they cost
 *   - which stages hold the GPU (script = Ollama, audio = TTS, images = ComfyUI) versus the CPU (render)
 *   - this machine right now: CPU count / load, RAM, GPU memory + utilisation, disk free
 *
 * It cannot invent measurements it does not have: CPU/RAM/VRAM *during* a job need a job
 * running while it samples, so run it with `--watch` alongside one.
 *
 *   node scripts/perfAudit.js            # persisted history + a machine snapshot
 *   node scripts/perfAudit.js --watch 60 # also sample the machine every 2s for 60s
 *
 * No writes; autoIndex/autoCreate are off.
 */
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const mongoose = require('mongoose');
const config = require('../src/config');

const run = promisify(execFile);
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const ACTIVE = ['SCRIPT_GENERATION', 'GENERATING_AUDIO', 'GENERATING_IMAGES', 'PREPARING_ASSETS', 'RENDERING', 'UPLOADING'];
// What holds which resource while the job is in that status.
const RESOURCE = {
  SCRIPT_GENERATION: 'GPU (Ollama)',
  GENERATING_AUDIO: 'GPU (Qwen3-TTS) + CPU alignment',
  GENERATING_IMAGES: 'GPU (ComfyUI)',
  PREPARING_ASSETS: 'CPU / disk',
  RENDERING: 'CPU (Remotion)',
  UPLOADING: 'network / disk (MinIO)',
};

const fmt = (ms) => {
  if (ms == null) return '—';
  const s = ms / 1000;
  if (s < 90) return `${s.toFixed(1)}s`;
  if (s < 5400) return `${(s / 60).toFixed(1)}m`;
  return `${(s / 3600).toFixed(2)}h`;
};
const pct = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—');
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

async function machineSnapshot() {
  const out = { cpus: os.cpus().length, loadAvg1m: os.loadavg()[0], totalRamGb: os.totalmem() / 2 ** 30, freeRamGb: os.freemem() / 2 ** 30 };
  try {
    const { stdout } = await run('nvidia-smi', ['--query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu', '--format=csv,noheader,nounits']);
    const [name, used, total, util, temp] = stdout.trim().split(',').map((s) => s.trim());
    out.gpu = { name, usedMiB: Number(used), totalMiB: Number(total), utilPct: Number(util), tempC: Number(temp) };
  } catch {
    out.gpu = null;
  }
  try {
    const stat = fs.statfsSync(process.cwd());
    out.diskFreeGb = (stat.bavail * stat.bsize) / 2 ** 30;
  } catch {
    out.diskFreeGb = null;
  }
  return out;
}

function stageTotals(jobs) {
  const totals = Object.fromEntries(ACTIVE.map((s) => [s, []]));
  for (const job of jobs) {
    const perStatus = {};
    for (const h of job.statusHistory || []) {
      if (ACTIVE.includes(h.from) && typeof h.durationMs === 'number') perStatus[h.from] = (perStatus[h.from] || 0) + h.durationMs;
    }
    for (const [status, ms] of Object.entries(perStatus)) totals[status].push(ms);
  }
  return totals;
}

async function main() {
  const watchIdx = process.argv.indexOf('--watch');
  const watchSeconds = watchIdx > -1 ? Number(process.argv[watchIdx + 1]) || 60 : 0;

  await mongoose.connect(config.mongodb.uri, { serverSelectionTimeoutMS: 8000, autoIndex: false });
  const jobs = await mongoose.connection.db.collection('videojobs')
    .find({}, { projection: { status: 1, type: 1, duration: 1, createdAt: 1, startedAt: 1, completedAt: 1, statusHistory: 1, stages: 1, retryCount: 1, 'script.scenes.sceneNumber': 1, 'script.scenes.sceneType': 1 } })
    .toArray();
  const finished = jobs.filter((j) => j.status === 'COMPLETED');

  console.log(`\n=== Persisted history: ${jobs.length} jobs, ${finished.length} completed ===`);

  // ---- where does the time go -------------------------------------------------------------
  const totals = stageTotals(finished);
  const grand = ACTIVE.reduce((n, s) => n + (mean(totals[s]) || 0), 0);
  console.log('\nTime per active stage, completed jobs (mean of per-job totals):');
  console.log('stage'.padEnd(20), 'jobs'.padStart(5), 'mean'.padStart(9), 'median'.padStart(9), 'max'.padStart(9), 'share'.padStart(8), '  holds');
  for (const s of ACTIVE) {
    const xs = totals[s];
    console.log(s.padEnd(20), String(xs.length).padStart(5), fmt(mean(xs)).padStart(9), fmt(median(xs)).padStart(9), fmt(xs.length ? Math.max(...xs) : null).padStart(9), pct(mean(xs) || 0, grand).padStart(8), ' ', RESOURCE[s]);
  }
  console.log('active total (sum of means):'.padEnd(20), fmt(grand));

  // ---- queue wait and human wait -----------------------------------------------------------
  const queueWaits = finished.map((j) => {
    const first = (j.statusHistory || []).find((h) => h.from === 'QUEUED');
    return first && j.createdAt ? new Date(first.timestamp) - new Date(j.createdAt) : null;
  }).filter((x) => x != null && x >= 0);
  const parked = finished.map((j) => (j.statusHistory || []).filter((h) => ['AWAITING_APPROVAL', 'SCRIPT_COMPLETED', 'AUDIO_COMPLETED'].includes(h.from)).reduce((n, h) => n + (h.durationMs || 0), 0));
  console.log(`\nQueue wait (created -> a worker picked it up): mean ${fmt(mean(queueWaits))}, median ${fmt(median(queueWaits))}, max ${fmt(queueWaits.length ? Math.max(...queueWaits) : null)}  (n=${queueWaits.length})`);
  console.log(`Time parked on a person (approval / manual steps): mean ${fmt(mean(parked))}, median ${fmt(median(parked))}  (not pipeline time)`);

  // ---- retries --------------------------------------------------------------------------------
  const retried = jobs.filter((j) => (j.statusHistory || []).some((h) => h.to === 'RETRY_SCHEDULED'));
  const retries = retried.reduce((n, j) => n + (j.statusHistory || []).filter((h) => h.to === 'RETRY_SCHEDULED').length, 0);
  console.log(`\nRetries: ${retried.length} of ${jobs.length} jobs retried (${retries} retries in total); failed ${jobs.filter((j) => j.status === 'FAILED').length}, cancelled ${jobs.filter((j) => j.status === 'CANCELLED').length}`);

  // ---- does time scale with content? ------------------------------------------------------------
  const rows = finished.map((j) => ({ scenes: (j.script?.scenes || []).length, ms: ACTIVE.reduce((n, s) => n + ((j.statusHistory || []).filter((h) => h.from === s).reduce((m, h) => m + (h.durationMs || 0), 0)), 0), mins: j.duration }));
  if (rows.length > 1) {
    const perScene = rows.filter((r) => r.scenes > 0).map((r) => r.ms / r.scenes);
    console.log(`\nActive time per scene: mean ${fmt(mean(perScene))}, median ${fmt(median(perScene))} (n=${perScene.length}) - the figure to multiply by a video's scene count`);
  }

  // ---- stage state recorded since Phase 2 ---------------------------------------------------------
  const withStages = jobs.filter((j) => j.stages && typeof j.stages === 'object');
  console.log(`\nJobs with per-stage state (run since stage tracking): ${withStages.length}`);

  // ---- duplicate generation in the cache ledger ---------------------------------------------------
  const cacheEntries = await mongoose.connection.db.collection('cacheentries').countDocuments().catch(() => 0);
  console.log(`Cache ledger entries: ${cacheEntries}${cacheEntries === 0 ? ' (no ledger data yet: nothing to say about reuse or duplicate generation)' : ''}`);

  // ---- machine ------------------------------------------------------------------------------------
  console.log('\n=== This machine, right now ===');
  const snap = await machineSnapshot();
  console.log(`CPU: ${snap.cpus} logical cores, 1-min load ${snap.loadAvg1m.toFixed(2)} (always 0 on Windows)`);
  console.log(`RAM: ${snap.freeRamGb.toFixed(1)} GB free of ${snap.totalRamGb.toFixed(1)} GB`);
  console.log(snap.gpu ? `GPU: ${snap.gpu.name}, ${snap.gpu.usedMiB}/${snap.gpu.totalMiB} MiB used, ${snap.gpu.utilPct}% util, ${snap.gpu.tempC}C` : 'GPU: nvidia-smi not available');
  console.log(`Disk free (working dir): ${snap.diskFreeGb == null ? '—' : `${snap.diskFreeGb.toFixed(1)} GB`}`);
  console.log(`Configured: VIDEO_WORKER_CONCURRENCY=${config.videoWorker.concurrency}, GPU slots=${config.localAI?.gpu?.maxConcurrentServices ?? 'n/a'}`);

  if (watchSeconds > 0) {
    console.log(`\nSampling every 2s for ${watchSeconds}s - start a job now...`);
    const samples = [];
    const end = Date.now() + watchSeconds * 1000;
    let lastCpu = os.cpus();
    while (Date.now() < end) {
      await new Promise((r) => setTimeout(r, 2000));
      const now = os.cpus();
      let idle = 0; let total = 0;
      now.forEach((c, i) => {
        const a = lastCpu[i].times; const b = c.times;
        idle += b.idle - a.idle;
        total += (b.user - a.user) + (b.nice - a.nice) + (b.sys - a.sys) + (b.irq - a.irq) + (b.idle - a.idle);
      });
      lastCpu = now;
      const s = await machineSnapshot();
      samples.push({ cpuPct: total ? (1 - idle / total) * 100 : 0, usedRamGb: s.totalRamGb - s.freeRamGb, vramMiB: s.gpu?.usedMiB, gpuPct: s.gpu?.utilPct });
    }
    const peak = (k) => Math.max(...samples.map((x) => x[k] ?? 0));
    console.log(`Peak over ${samples.length} samples: CPU ${peak('cpuPct').toFixed(0)}%, RAM ${peak('usedRamGb').toFixed(1)} GB, VRAM ${peak('vramMiB')} MiB, GPU ${peak('gpuPct')}%`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('perfAudit failed:', err.message);
  process.exit(1);
});
