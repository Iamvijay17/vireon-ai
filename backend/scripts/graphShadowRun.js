/**
 * Shadow-compile the v2 step graph for real jobs and report what it would
 * have done differently from the v1 sequential pipeline - without
 * spending any TTS/GPU/render time. Read-only: shadowHandlers never touch
 * storage or a real model, only predict a TTS cache key the same way the
 * real call would (AudioService.predictCacheKey).
 *
 * Reports, per job: node count vs. v1's fixed 9 steps, the graph's actual
 * parallelism (levels/max width - see DagRunner.analyzeParallelism), and
 * how many scene-audio nodes would have hit the existing TTS cache
 * (compared against Asset.cacheKey records Phase 1 already recorded).
 *
 * Usage: node scripts/graphShadowRun.js [limit=10]
 */
const { connectDatabase } = require('../src/config/database');
const VideoJob = require('../src/models/VideoJob');
const Asset = require('../src/models/Asset');
const { compile } = require('../src/ir');
const { runGraph, analyzeParallelism } = require('../src/core/graph/DagRunner');
const { compileVideoGraph, shadowHandlers } = require('../src/core/graph/videoStepGraph');

async function shadowRunOne(job) {
  const ir = compile({ jobId: job._id, script: job.script, jobConfig: job, stage: 'script' });
  if (!ir.ir) return { id: job._id, error: 'IR compile failed', issues: ir.issues };

  const nodes = compileVideoGraph({ jobId: job._id, ir: ir.ir, videoJob: job, handlers: shadowHandlers({ videoJob: job }) });
  const parallelism = analyzeParallelism(nodes);
  const { results, ok } = await runGraph(nodes, { concurrency: Infinity });

  const existingCacheKeys = new Set(
    (await Asset.find({ ownerId: job._id, category: 'audio', cacheKey: { $ne: null } }).select('cacheKey').lean())
      .map((a) => a.cacheKey)
  );

  let predictedHits = 0;
  let audioNodes = 0;
  for (const [id, r] of results) {
    if (!id.startsWith('scene.audio.')) continue;
    audioNodes++;
    if (r.value?.cacheKey && existingCacheKeys.has(r.value.cacheKey)) predictedHits++;
  }

  return {
    id: job._id,
    type: job.type,
    v1Steps: 9,
    v2Nodes: nodes.length,
    levels: parallelism.levels,
    maxWidth: parallelism.maxWidth,
    audioNodes,
    predictedHits,
    graphOk: ok,
  };
}

async function main() {
  const limit = parseInt(process.argv[2], 10) || 10;
  const jobs = await VideoJob.find({ status: 'COMPLETED' }).sort({ createdAt: -1 }).limit(limit).lean();

  if (jobs.length === 0) {
    console.log('No completed video jobs found to shadow-run.');
    process.exit(0);
  }

  console.log(`\nShadow-running the v2 step graph for ${jobs.length} completed job(s) (no side effects)\n`);
  console.log('job'.padEnd(14), 'type'.padEnd(12), 'v1'.padEnd(4), 'v2'.padEnd(4), 'levels'.padEnd(7), 'maxWidth'.padEnd(9), 'audio hits');
  console.log('-'.repeat(70));

  let totalAudioNodes = 0, totalHits = 0, failed = 0;
  for (const job of jobs) {
    const r = await shadowRunOne(job);
    if (r.error) {
      failed++;
      console.log(`${r.id.padEnd(14)} IR compile failed: ${r.issues.slice(0, 2).map((i) => i.message).join('; ')}`);
      continue;
    }
    totalAudioNodes += r.audioNodes;
    totalHits += r.predictedHits;
    console.log(
      String(r.id).padEnd(14),
      String(r.type).padEnd(12),
      String(r.v1Steps).padEnd(4),
      String(r.v2Nodes).padEnd(4),
      String(r.levels).padEnd(7),
      String(r.maxWidth).padEnd(9),
      `${r.predictedHits}/${r.audioNodes}`,
    );
  }

  console.log('-'.repeat(70));
  console.log(`\nv1 is always ${jobs.length} sequential runs of exactly 9 steps each, regardless of scene count.`);
  console.log(`v2's node count scales with scene count; "levels" is how many sequential waits remain after`);
  console.log(`parallelizing independent scene work - a lower number than v1's fixed 9 means real time saved.`);
  console.log(`Predicted TTS cache hits across all scanned jobs: ${totalHits}/${totalAudioNodes}.`);
  if (failed > 0) console.log(`${failed} job(s) failed to compile - see above.`);
  console.log('');

  process.exit(0);
}

connectDatabase().then(main).catch((err) => {
  console.error('Shadow run failed:', err);
  process.exit(1);
});
