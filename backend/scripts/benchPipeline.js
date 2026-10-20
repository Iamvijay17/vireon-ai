/**
 * Run ONE real video through the real pipeline and record how long each stage took.
 *
 *   node scripts/benchPipeline.js --label baseline-1
 *   node scripts/benchPipeline.js --label after-x --topic "How tides work" --duration 2 --notes "REMOTION_CONCURRENCY=4"
 *   node scripts/benchPipeline.js --list          # stored runs
 *   node scripts/benchPipeline.js --compare <idA> <idB>
 *
 * Needs the stack running (API on --api, default http://127.0.0.1:3000, plus the video worker
 * and the local AI services). It submits the job through POST /api/videos exactly as the UI
 * does, polls until a terminal status, then reads the job's persisted stage record (duration,
 * attempts, measured VRAM/RAM/CPU per stage) and the cache-ledger change and stores one
 * PerfBenchmark document. It creates a normal job in the database the API uses - you will see
 * it in the Jobs list; delete it there if you do not want it.
 *
 * The LLM writes a different script every run, so two runs never process identical work.
 * Compare per-scene figures (--compare prints them) and prefer the median of several runs.
 */
const axios = require('axios');
const mongoose = require('mongoose');
const config = require('../src/config');

mongoose.set('autoIndex', false);

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
const fmt = (ms) => (ms == null ? 'n/a' : ms < 90000 ? `${(ms / 1000).toFixed(1)}s` : `${(ms / 60000).toFixed(1)}m`);

async function list() {
  const PerfBenchmark = require('../src/models/PerfBenchmark');
  const rows = await PerfBenchmark.find({}).sort({ finishedAt: -1 }).limit(30).lean();
  if (!rows.length) return console.log('No stored benchmark runs.');
  for (const r of rows) {
    console.log(`${r._id}  ${new Date(r.finishedAt).toISOString().slice(0, 16)}  ${(r.label || '-').padEnd(18)} ${r.status.padEnd(9)} total ${fmt(r.totalMs).padStart(7)}  scenes ${r.workload?.scenes ?? '?'}  ${r.notes || ''}`);
  }
}

async function compare(idA, idB) {
  const PerfBenchmark = require('../src/models/PerfBenchmark');
  const { compareRuns } = require('../src/services/perf/benchmarkAnalysis');
  const [a, b] = await Promise.all([PerfBenchmark.findById(idA).lean(), PerfBenchmark.findById(idB).lean()]);
  if (!a || !b) throw new Error('Both ids must be stored runs (see --list).');
  const cmp = compareRuns(a, b);
  console.log(`before: ${a.label} (${a.workload?.scenes} scenes, total ${fmt(a.totalMs)})   after: ${b.label} (${b.workload?.scenes} scenes, total ${fmt(b.totalMs)})`);
  if (cmp.caveat) console.log(`NOTE: ${cmp.caveat}`);
  for (const r of cmp.rows) {
    if (r.beforeMs == null && r.afterMs == null) continue;
    console.log(`${r.label.padEnd(24)} ${fmt(r.beforeMs).padStart(8)} -> ${fmt(r.afterMs).padStart(8)}  ${r.deltaPct == null ? '' : `${r.deltaPct > 0 ? '+' : ''}${r.deltaPct}%`}   per scene ${fmt(r.beforePerSceneMs)} -> ${fmt(r.afterPerSceneMs)}`);
  }
  console.log(`total ${cmp.totalDeltaPct == null ? 'n/a' : `${cmp.totalDeltaPct}%`}; per scene ${cmp.perSceneDeltaPct == null ? 'n/a' : `${cmp.perSceneDeltaPct}%`} (negative = faster)`);
}

async function runOne() {
  const { readHardware, readVersions, cacheTotals, buildRecord } = require('../src/services/perf/benchmarkRecorder');
  const PerfBenchmark = require('../src/models/PerfBenchmark');
  const { findBottleneck } = require('../src/services/perf/benchmarkAnalysis');
  const api = arg('api', 'http://127.0.0.1:3000');
  const timeoutMs = Number(arg('timeout-min', '90')) * 60000;

  await axios.get(`${api}/api/videos`, { params: { limit: 1 }, timeout: 8000 }).catch((e) => {
    throw new Error(`The API is not reachable at ${api} (${e.message}). Start the API and the video worker first.`);
  });

  const cacheBefore = await cacheTotals();
  const hardware = await readHardware();
  const versions = readVersions();

  const body = {
    topic: arg('topic', 'How a bill becomes a law'),
    type: arg('type', 'educational'),
    duration: Number(arg('duration', '2')),
    resolution: arg('resolution', '1920x1080'),
    quality: arg('quality', 'standard'),
    fastGeneration: true,
    autoApprove: true,
  };
  const submittedAt = new Date();
  const { data: created } = await axios.post(`${api}/api/videos`, body, { timeout: 15000 });
  const jobId = created.jobId;
  console.log(`submitted ${jobId}: ${JSON.stringify(body)}`);

  const db = mongoose.connection.db;
  let job;
  let lastStatus = '';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    job = await db.collection('videojobs').findOne({ _id: jobId });
    if (job && job.status !== lastStatus) {
      lastStatus = job.status;
      console.log(`  ${new Date().toISOString().slice(11, 19)} ${job.status} ${job.progress ?? ''}%`);
    }
    if (job && TERMINAL.has(job.status)) break;
  }
  if (!job || !TERMINAL.has(job.status)) throw new Error(`Timed out after ${arg('timeout-min', '90')} min with the job still ${job?.status}. Nothing stored; the job keeps running.`);
  const finishedAt = new Date();

  const record = buildRecord({
    job, submittedAt, finishedAt, hardware, versions, cacheBefore, cacheAfter: await cacheTotals(),
    label: arg('label', ''), notes: arg('notes', ''), profile: process.env.PERF_PROFILE || null,
  });
  const saved = await PerfBenchmark.create(record);
  console.log(`\nstored benchmark ${saved._id}: ${job.status}, total ${fmt(record.totalMs)}, ${record.workload.scenes} scenes, ${record.workload.audioSeconds}s audio`);
  for (const s of record.ranking) console.log(`  ${s.key.padEnd(8)} ${fmt(s.durationMs).padStart(8)}  ${s.sharePct}%`);
  const b = findBottleneck(record.stages, record.workload);
  console.log(`bottleneck: ${b.facts.join(' ')}`);
  if (b.nextExperiment) console.log(`next: ${b.nextExperiment}`);
  if (record.cache) console.log(`cache: ${JSON.stringify(record.cache)}`);
  if (record.validation) console.log(`output validation: ${JSON.stringify(record.validation)}`);
  if (job.status !== 'COMPLETED') process.exitCode = 2;
}

(async () => {
  await mongoose.connect(config.mongodb.uri, { serverSelectionTimeoutMS: 8000, autoIndex: false });
  try {
    if (has('list')) await list();
    else if (has('compare')) await compare(arg('compare'), process.argv[process.argv.indexOf('--compare') + 2]);
    else await runOne();
  } finally {
    await mongoose.disconnect();
  }
})().catch((err) => {
  console.error('benchPipeline failed:', err.message);
  process.exit(1);
});
