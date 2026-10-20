/**
 * Does running TTS during a Remotion render actually save time on THIS machine?
 *
 * The pipeline runs one video at a time (VIDEO_WORKER_CONCURRENCY=1), so while a video renders
 * on the CPU the GPU sits idle even if another video is waiting. Overlapping them would only
 * help if TTS (GPU + some CPU) and Remotion (CPU) do not slow each other down by more than the
 * time saved. This measures exactly that, with the same fixed composition the render benchmark
 * uses and a fixed narration text:
 *
 *   1. TTS alone          N calls
 *   2. Render alone       one render (after a discarded warm-up)
 *   3. Both at once       a render with TTS calls back to back for as long as it runs
 *
 *   node scripts/benchOverlap.js            # needs the Qwen3-TTS server up (TTS_API_URL)
 *   node scripts/benchOverlap.js --tts-calls 3 --concurrency 6
 *
 * It does not touch the database, the job queue or any job's files (output goes to the OS temp
 * directory). Run it on an idle machine - no video job should be in flight - or the numbers
 * are not about overlap. Peak VRAM / RAM / CPU per phase come from the same sampler the
 * pipeline uses.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const config = require('../src/config');
const { createResourceSampler } = require('../src/services/pipeline/resourceSampler');
const { REMOTION, writeProps, renderArgs } = require('./lib/benchComposition');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const ttsCalls = Number(arg('tts-calls', '3'));
const concurrency = Number(arg('concurrency', '6'));

const TEXT = 'The committee reviews the proposal, debates amendments, and sends the revised version to the full chamber for a vote. '
  + 'If a majority agrees, the bill moves on to the other chamber, where the same steps are repeated before it reaches the president.';

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'vireon-overlap-bench-'));
const propsPath = writeProps(OUT);
const sec = (ms) => Number((ms / 1000).toFixed(1));

function render(label) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, renderArgs({ out: path.join(OUT, `${label}.mp4`), propsPath, concurrency }), { cwd: REMOTION, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => resolve({ ok: code === 0, startedAt: started, endedAt: Date.now(), ms: Date.now() - started, error: code ? err.slice(-200) : undefined }));
  });
}

async function main() {
  const { Client } = require('@gradio/client');
  const ttsClient = require('../src/services/audio/audioService/ttsClient');
  const { resolveVoice } = require('../src/services/audio/audioService/voiceCatalog');

  const base = config.tts.url.replace(/\/generate$/, '').replace(/\/$/, '');
  const client = await Client.connect(base);
  const voice = await resolveVoice('female-1');
  let seed = 4242;
  const speak = async () => {
    const startedAt = Date.now();
    await ttsClient.generate(client, voice, TEXT, seed, '', false, 'english'); // same seed: identical work every call
    return { startedAt, endedAt: Date.now(), ms: Date.now() - startedAt };
  };
  const phase = async (fn) => {
    const sampler = createResourceSampler({ intervalMs: 2000 });
    sampler.start();
    const result = await fn();
    return { result, resources: await sampler.stop() };
  };

  console.log(`machine: ${os.cpus().length} threads, ${(os.freemem() / 2 ** 30).toFixed(1)} of ${(os.totalmem() / 2 ** 30).toFixed(1)} GB RAM free; render --concurrency ${concurrency}`);
  console.log('warm-up: one TTS call and one render (discarded)...');
  await speak();
  await render('warmup');

  console.log(`1/3 TTS alone x${ttsCalls}...`);
  const ttsAlone = await phase(async () => {
    const calls = [];
    for (let i = 0; i < ttsCalls; i += 1) calls.push(await speak());
    return calls;
  });

  console.log('2/3 render alone...');
  const renderAlone = await phase(() => render('alone'));

  console.log('3/3 render + TTS together...');
  const both = await phase(async () => {
    const renderPromise = render('overlap');
    const calls = [];
    let renderDone = false;
    renderPromise.then(() => { renderDone = true; });
    // Keep the GPU busy for as long as the render runs; one call may finish after the render does.
    do { calls.push(await speak()); } while (!renderDone);
    const r = await renderPromise;
    return { r, calls };
  });

  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const aloneMean = mean(ttsAlone.result.map((c) => c.ms));
  const { r: overlapRender, calls: overlapCalls } = both.result;
  const insideWindow = overlapCalls.filter((c) => c.endedAt <= overlapRender.endedAt);
  const duringMean = insideWindow.length ? mean(insideWindow.map((c) => c.ms)) : null;
  const makespan = Math.max(overlapRender.endedAt, ...overlapCalls.map((c) => c.endedAt)) - overlapRender.startedAt;
  const sequential = overlapCalls.length * aloneMean + renderAlone.result.ms;

  const summary = {
    ttsAlone: { calls: ttsAlone.result.map((c) => sec(c.ms)), meanSec: sec(aloneMean), resources: ttsAlone.resources },
    renderAlone: { sec: sec(renderAlone.result.ms), ok: renderAlone.result.ok, resources: renderAlone.resources },
    overlapped: {
      renderSec: sec(overlapRender.ms), renderOk: overlapRender.ok,
      ttsCallsStarted: overlapCalls.length, ttsCallsFinishedInsideRender: insideWindow.length,
      ttsCallSec: overlapCalls.map((c) => sec(c.ms)),
      meanTtsInsideRenderSec: duringMean === null ? null : sec(duringMean),
      makespanSec: sec(makespan), resources: both.resources,
    },
    slowdown: {
      renderPct: Math.round(((overlapRender.ms - renderAlone.result.ms) / renderAlone.result.ms) * 1000) / 10,
      ttsPct: duringMean === null ? null : Math.round(((duringMean - aloneMean) / aloneMean) * 1000) / 10,
    },
    // The same work done one after the other vs. together. Positive = overlapping finished sooner.
    sequentialSec: sec(sequential),
    timeSavedPct: Math.round(((sequential - makespan) / sequential) * 1000) / 10,
    caveat: 'One measurement per phase on one afternoon: treat differences under ~5% as noise.',
  };
  console.log(JSON.stringify(summary, null, 2));
  fs.rmSync(OUT, { recursive: true, force: true });
  client.close?.();
}

main().catch((err) => {
  console.error('benchOverlap failed:', err.message);
  process.exit(1);
});
