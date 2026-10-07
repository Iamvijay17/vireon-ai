/**
 * Real-stack smoke test of the segmented narration pipeline: Qwen3-TTS on the
 * GPU, ffmpeg post-processing, whisper alignment and the MinIO Smart Cache.
 * Nothing here is mocked, so it needs the same services a real job does
 * (TTS server, MinIO, MongoDB for metrics; the GPU lease uses Redis when
 * GPU_COORDINATOR=redis).
 *
 *   node scripts/smokeNarration.js [--voice custom:Ryan] [--style documentary]
 *                                  [--text "..."] [--out ./smoke.wav] [--cleanup]
 *
 * Runs the scene twice: the first run generates (cache misses), the second
 * must be served from cache. Prints per-segment timings and the caption
 * timeline. `--cleanup` removes this run's cache entries afterwards.
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const mongoose = require('mongoose');
const config = require('../src/config');
const { planScene } = require('../src/services/audio/pipeline/segmentPlanner');
const { synthesizeScene } = require('../src/services/audio/pipeline/segmentSynthesis');
const ffmpeg = require('../src/services/audio/pipeline/ffmpeg');
const LocalAIService = require('../src/services/localAI');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const DEFAULT_TEXT = [
  `Smoke test ${Date.now()}: we built the backend with Node.js and MongoDB, and queued the work with BullMQ.`,
  'The pipeline costs about $5 per hour and handles 1,000 requests at 99% uptime. Remember this: stable beats fast.',
].join('\n\n');

async function main() {
  const text = arg('text', DEFAULT_TEXT);
  const voice = arg('voice', 'custom:Ryan');
  const style = arg('style', undefined);
  const out = path.resolve(arg('out', path.join(os.tmpdir(), `vireon-smoke-${Date.now()}.wav`)));

  await mongoose.connect(config.mongodb.uri);
  console.log('ffmpeg:', await ffmpeg.getFfmpegStatus());

  const run = async (label) => {
    const plan = await planScene({ text, sceneNumber: 1, voice, style, isFirstScene: true, isLastScene: true });
    console.log(`\n== ${label}: ${plan.segments.length} segment(s), style=${plan.style}`);
    plan.segments.forEach((s) => console.log(`  ${s.id} spoken: ${JSON.stringify(s.spokenText.slice(0, 90))}`));

    const holder = { current: null };
    const stages = [];
    const startedAt = Date.now();
    try {
      const result = await LocalAIService.gpu.withGPU('tts', () =>
        synthesizeScene({
          jobId: 'smoke-job',
          sceneNumber: 1,
          plan,
          workDir: path.join(os.tmpdir(), `vireon-smoke-work-${Date.now()}`),
          outputPath: out,
          clientHolder: holder,
          onProgress: (e) => stages.push(`${e.stage}${e.current ? ` ${e.current}/${e.total}` : ''}`),
        })
      );
      console.log(`  wall ${Date.now() - startedAt}ms  stats`, result.stats);
      console.log('  stages:', stages.join(' -> '));
      result.segments.forEach((s) => console.log(`  ${s.id} ${s.cache} ${s.startMs}-${s.endMs}ms gen=${s.generationMs ?? '-'}ms proc=${s.processingMs ?? '-'}ms`));
      const ct = result.captionTimestamps;
      console.log('  caption words:', ct ? `${ct.length} (estimated ${ct.filter((w) => w.estimated).length})` : 'none');
      if (ct) console.log('  first 8:', ct.slice(0, 8).map((w) => `${w.word}@${w.start}`).join('  '));
      return { plan, result };
    } finally {
      if (holder.current) holder.current.close();
    }
  };

  const first = await run('run 1 (expect cache misses)');
  const second = await run('run 2 (expect all cache hits)');

  const ok = second.result.stats.cacheMisses === 0 && second.result.durationMs === first.result.durationMs;
  console.log(`\nfinal audio: ${out} (${first.result.durationMs}ms)`);
  console.log(ok ? 'PASS: second run served entirely from cache' : 'FAIL: second run was not a pure cache hit');

  if (flag('cleanup')) {
    const { getStorageProvider } = require('../src/services/storage/providers');
    const client = getStorageProvider().client;
    const keys = first.plan.segments.flatMap((s) => [
      `tts-seg/raw/${s.rawCacheKey}.wav`, `tts-seg/raw/${s.rawCacheKey}.json`,
      `tts-seg/processed/${s.processedCacheKey}.wav`, `tts-seg/processed/${s.processedCacheKey}.json`,
    ]);
    await client.removeObjects(config.minio.cacheBucket, keys);
    console.log(`cleaned ${keys.length} cache objects`);
  }
  if (!flag('keep-output') && flag('cleanup')) fs.rmSync(out, { force: true });

  await mongoose.disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('smoke test failed:', err);
  process.exit(1);
});
