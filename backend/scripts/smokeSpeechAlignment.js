/**
 * Real-stack check of speech alignment: Qwen3-TTS on the GPU, ffmpeg
 * post-processing, faster-whisper alignment and the MinIO Smart Cache. Nothing
 * is mocked, so it needs what a real job needs (TTS server, MinIO, MongoDB;
 * Redis when GPU_COORDINATOR=redis).
 *
 *   node scripts/smokeSpeechAlignment.js [--voice custom:Ryan] [--text "..."]
 *                                        [--out ./speech.wav] [--dump timeline.json] [--cleanup]
 *
 * What it proves, beyond "it ran":
 *  1. the canonical timeline is built from the real audio and satisfies every
 *     timing invariant;
 *  2. the timings are MEASURED, not spread evenly: every word and pause is
 *     cross-checked against ffmpeg's independent silence detection, and the same
 *     check is run on a naive "divide the duration by the word count" timeline
 *     to show it would be caught;
 *  3. the second run is served from the cache with NO TTS and NO alignment, and
 *     yields the identical timeline;
 *  4. cost: TTS time, alignment time, audio length and the alignment ratio.
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const mongoose = require('mongoose');
const config = require('../src/config');

// Must be set before the pipeline modules read it.
config.speech.alignmentEnabled = true;

const { planScene } = require('../src/services/audio/pipeline/segmentPlanner');
const { synthesizeScene } = require('../src/services/audio/pipeline/segmentSynthesis');
const { validateTimeline } = require('../src/services/audio/pipeline/speech/schemas');
const LocalAIService = require('../src/services/localAI');

const execFileAsync = promisify(execFile);

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const DEFAULT_TEXT = [
  `Speech check ${Date.now()}. Artificial intelligence is changing how we build software.`,
  'Teams ship faster, but only when the pipeline is reliable. Remember this: timing is everything.',
].join('\n\n');

/** Silence intervals [{start,end}] in seconds, from ffmpeg - independent of the aligner. */
async function detectSilence(file) {
  const { stderr } = await execFileAsync(config.audio.ffmpegPath, ['-hide_banner', '-i', file, '-af', 'silencedetect=noise=-35dB:d=0.12', '-f', 'null', '-'], { encoding: 'utf8' });
  const out = [];
  let start = null;
  for (const line of stderr.split('\n')) {
    const s = line.match(/silence_start:\s*([\d.]+)/);
    const e = line.match(/silence_end:\s*([\d.]+)/);
    if (s) start = parseFloat(s[1]);
    if (e && start !== null) { out.push({ start, end: parseFloat(e[1]) }); start = null; }
  }
  if (start !== null) out.push({ start, end: Infinity });
  return out;
}

const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/** Mean share of each word's duration that falls in detected silence (lower = better aligned). */
function silentShare(words, silences) {
  const shares = words.map((w) => {
    const silent = silences.reduce((sum, s) => sum + overlap(w.start, w.end, s.start, s.end), 0);
    return silent / (w.end - w.start);
  });
  return { mean: shares.reduce((a, b) => a + b, 0) / shares.length, worst: Math.max(...shares) };
}

async function main() {
  const text = arg('text', DEFAULT_TEXT);
  const voice = arg('voice', 'custom:Ryan');
  const out = path.resolve(arg('out', path.join(os.tmpdir(), `vireon-speech-${Date.now()}.wav`)));

  await mongoose.connect(config.mongodb.uri);
  console.log(`alignment: provider=${config.audio.alignment.provider} model=${config.audio.alignment.model}`);

  const run = async (label) => {
    const plan = await planScene({ text, sceneNumber: 1, voice, isFirstScene: true, isLastScene: true });
    console.log(`\n== ${label}: ${plan.segments.length} segment(s)`);
    const holder = { current: null };
    const stages = [];
    const startedAt = Date.now();
    try {
      const result = await LocalAIService.gpu.withGPU('tts', () =>
        synthesizeScene({
          jobId: 'smoke-speech', sceneNumber: 1, plan,
          workDir: path.join(os.tmpdir(), `vireon-speech-work-${Date.now()}`),
          outputPath: out, clientHolder: holder,
          onProgress: (e) => stages.push(e.stage),
        })
      );
      result.wallMs = Date.now() - startedAt;
      console.log('  stages:', [...new Set(stages)].join(' -> '));
      return { plan, result };
    } finally {
      if (holder.current) holder.current.close();
    }
  };

  const failures = [];
  const expect = (cond, msg) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures.push(msg); };

  const first = await run('run 1 (generate + align)');
  const t = first.result.speechTimeline;
  if (arg('dump')) {
    fs.writeFileSync(path.resolve(arg('dump')), JSON.stringify({ text, timeline: t, captionTimestamps: first.result.captionTimestamps }, null, 2));
    console.log(`timeline written to ${arg('dump')}`);
  }
  const { stats } = first.result;

  console.log(`\n-- timeline: ${t.alignmentStatus}, ${t.granularity}-level, ${t.words.length}/${t.stats.wordCount} words, ${t.phrases.length} phrases, ${t.pauses.length} pauses`);
  console.log('   words:', t.words.slice(0, 10).map((w) => `${w.text}@${w.start.toFixed(2)}-${w.end.toFixed(2)}`).join('  '));
  console.log('   phrases:', t.phrases.map((p) => `"${p.text}" ${p.start.toFixed(2)}-${p.end.toFixed(2)}`).join(' | '));
  console.log('   pauses:', t.pauses.map((p) => `${p.kind} ${p.start.toFixed(2)}-${p.end.toFixed(2)} (${p.duration}s)`).join(' | ') || 'none');
  if (t.fallbackReasons.length) console.log('   fallback reasons:', JSON.stringify(t.fallbackReasons));

  console.log('\n-- checks');
  expect(validateTimeline(t).length === 0, `timing invariants hold (${validateTimeline(t).join('; ') || 'no issues'})`);
  expect(t.alignmentStatus === 'complete', `alignment complete (got ${t.alignmentStatus})`);
  expect(t.words.length >= t.stats.wordCount * 0.9, `>= 90% of caption words measured (${t.words.length}/${t.stats.wordCount})`);
  expect(Math.abs(t.duration - first.result.durationMs / 1000) < 0.005, 'timeline duration equals the assembled audio duration');

  // Independent verification against ffmpeg silence detection.
  const silences = await detectSilence(out);
  const measured = silentShare(t.words, silences);
  const naiveWords = (() => {
    const speechStart = t.segments[0].start;
    const speechEnd = t.segments[t.segments.length - 1].end;
    const per = (speechEnd - speechStart) / t.words.length;
    return t.words.map((w, i) => ({ start: speechStart + i * per, end: speechStart + (i + 1) * per }));
  })();
  const naive = silentShare(naiveWords, silences);
  console.log(`   silence detected by ffmpeg: ${silences.length} interval(s)`);
  console.log(`   words in silence - measured: mean ${(measured.mean * 100).toFixed(1)}%  worst ${(measured.worst * 100).toFixed(0)}%   |   naive even split: mean ${(naive.mean * 100).toFixed(1)}%  worst ${(naive.worst * 100).toFixed(0)}%`);
  expect(measured.mean < 0.2, 'measured words sit on actual speech (mean < 20% silence)');
  expect(measured.mean < naive.mean || naive.mean < 0.05, 'measured timing beats an evenly divided timeline');

  for (const p of t.pauses) {
    const silent = silences.reduce((sum, s) => sum + overlap(p.start, p.end, s.start, s.end), 0);
    // Word end times from the recogniser are loose (typically within ~0.25s), so a pause edge can be early: require real overlap, not exactness.
    expect(silent / p.duration >= 0.25, `${p.kind} pause ${p.start.toFixed(2)}-${p.end.toFixed(2)}s is real silence (${Math.round((silent / p.duration) * 100)}% overlap)`);
  }

  console.log('\n-- cost');
  const ttsMs = stats.generationMs;
  console.log(`   TTS ${ttsMs}ms | processing ${stats.processingMs}ms | alignment ${stats.alignmentMs}ms | timeline ${stats.timelineMs}ms | audio ${first.result.durationMs}ms`);
  console.log(`   alignment ratio ${(stats.alignmentMs / first.result.durationMs).toFixed(2)}x audio duration (CPU, model=${config.audio.alignment.model}) | wall ${first.result.wallMs}ms`);

  const second = await run('run 2 (expect cache: no TTS, no alignment)');
  expect(second.result.stats.cacheMisses === 0, 'second run: every segment from cache');
  expect(second.result.stats.alignmentMs === 0 && second.result.stats.alignmentCacheHits === second.plan.segments.length, `second run: no alignment work (${second.result.stats.alignmentCacheHits} alignment cache hit(s))`);
  expect(JSON.stringify(second.result.speechTimeline.words) === JSON.stringify(t.words), 'second run: identical word timings');
  console.log(`   second run wall ${second.result.wallMs}ms`);

  if (flag('cleanup')) {
    const { getStorageProvider } = require('../src/services/storage/providers');
    const client = getStorageProvider().client;
    const keys = first.plan.segments.flatMap((s) => [
      `tts-seg/raw/${s.rawCacheKey}.wav`, `tts-seg/raw/${s.rawCacheKey}.json`,
      `tts-seg/processed/${s.processedCacheKey}.wav`, `tts-seg/processed/${s.processedCacheKey}.json`,
    ]);
    await client.removeObjects(config.minio.cacheBucket, keys);
    console.log(`cleaned ${keys.length} cache objects`);
    if (!flag('keep-output')) fs.rmSync(out, { force: true });
  } else {
    console.log(`final audio: ${out}`);
  }

  await mongoose.disconnect();
  console.log(failures.length ? `\nFAILED: ${failures.length} check(s)` : '\nALL CHECKS PASSED');
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error('speech smoke test failed:', err);
  process.exit(1);
});
