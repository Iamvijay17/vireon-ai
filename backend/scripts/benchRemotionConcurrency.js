/**
 * Measures Remotion render wall time and memory pressure at different `--concurrency`
 * values on a fixed 3-scene 1080p composition (self-contained: inline images, no network,
 * no GPU, no database). Writes only to the OS temp directory.
 *
 *   node scripts/benchRemotionConcurrency.js            # 6,3,9,12
 *   node scripts/benchRemotionConcurrency.js 4,8        # chosen levels
 *
 * The first render warms the bundle cache and is discarded. Use it before changing how many
 * Chrome tabs a render uses: it answers "does more concurrency make renders faster on THIS
 * machine, and what does it cost in RAM?" instead of guessing.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const REMOTION = path.resolve(__dirname, '../remotion');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'vireon-render-bench-'));

const svg = (a, b) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/><circle cx="800" cy="450" r="250" fill="rgba(255,255,255,0.3)"/></svg>`)}`;
const scene = (n, over) => ({
  sceneNumber: n, sceneId: `sce-bench${n}`, sceneType: 'content', title: `Scene ${n}`, duration: 7, transition: 'fade',
  cameraMotion: 'zoom-in', templateId: 'generative', layout: '', audio: { file: '', duration: 7 },
  theme: { type: 'educational', captionAnimation: 'fadeInUp' }, ...over,
});
const scenes = [
  scene(1, { elements: { title: 'Benchmark scene one', items: [{ text: 'First point about the subject.' }, { text: 'Second point, a little longer than the first.' }, { text: 'Third point.' }, { text: 'Fourth point to fill the layout.' }] } }),
  scene(2, { sceneType: 'contentwithimage', layout: 'split-image', composition: { background: 'aurora', decoration: 'orbit', textMotion: 'fadeSlideUp', imageMotion: 'slowZoom' }, elements: { title: 'With a picture', body: 'A paragraph beside a picture.', image: svg('#1b6ca8', '#f2a65a') } }),
  scene(3, { elements: { title: 'Last scene', items: [{ text: '87% of the benchmark is CPU' }] } }),
];
const propsPath = path.join(OUT, 'props.json');
fs.writeFileSync(propsPath, JSON.stringify({
  assets: { title: 'bench', description: '', resolution: '1920x1080', aspectRatio: '16:9', quality: 'standard', fontPairing: 'default', scenes, output: {} },
  jobId: 'bench',
}));

function once(concurrency) {
  return new Promise((resolve) => {
    const out = path.join(OUT, `bench-${concurrency}.mp4`);
    const args = [
      path.join(REMOTION, 'node_modules/@remotion/cli/remotion-cli.js'), 'render', 'VideoComposition', out,
      `--props=${propsPath}`, '--width', '1920', '--height', '1080', '--fps', '30', '--codec', 'h264', '--crf', '18',
      '--pixel-format', 'yuv420p', '--concurrency', String(concurrency), '--log', 'error',
    ];
    const startFree = os.freemem();
    let minFree = startFree;
    const sampler = setInterval(() => { minFree = Math.min(minFree, os.freemem()); }, 400);
    const started = Date.now();
    const child = spawn(process.execPath, args, { cwd: REMOTION, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      clearInterval(sampler);
      resolve({
        concurrency,
        ok: code === 0,
        seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
        peakExtraRamGb: Number(((startFree - minFree) / 2 ** 30).toFixed(2)),
        error: code ? err.slice(-200) : undefined,
      });
    });
  });
}

(async () => {
  const levels = (process.argv[2] || '6,3,9,12').split(',').map(Number).filter(Boolean);
  console.log(`cores=${os.cpus().length}  RAM free ${(os.freemem() / 2 ** 30).toFixed(1)} of ${(os.totalmem() / 2 ** 30).toFixed(1)} GB`);
  console.log('warm-up render (discarded)...');
  await once(6);
  for (const level of levels) console.log(JSON.stringify(await once(level)));
  fs.rmSync(OUT, { recursive: true, force: true });
})();
