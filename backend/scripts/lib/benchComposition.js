/**
 * The fixed 3-scene 1080p composition the render benchmarks share (self-contained: inline
 * images, no network, no GPU, no database), so scripts/benchRemotionConcurrency.js and
 * scripts/benchOverlap.js render identical work and their numbers can be compared.
 */
const fs = require('fs');
const path = require('path');

const REMOTION = path.resolve(__dirname, '../../remotion');

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

/** Write props.json for the composition into `dir`; returns its path. */
function writeProps(dir) {
  const propsPath = path.join(dir, 'props.json');
  fs.writeFileSync(propsPath, JSON.stringify({
    assets: { title: 'bench', description: '', resolution: '1920x1080', aspectRatio: '16:9', quality: 'standard', fontPairing: 'default', scenes, output: {} },
    jobId: 'bench',
  }));
  return propsPath;
}

/** CLI args for one render of the composition. */
function renderArgs({ out, propsPath, concurrency }) {
  return [
    path.join(REMOTION, 'node_modules/@remotion/cli/remotion-cli.js'), 'render', 'VideoComposition', out,
    `--props=${propsPath}`, '--width', '1920', '--height', '1080', '--fps', '30', '--codec', 'h264', '--crf', '18',
    '--pixel-format', 'yuv420p', '--concurrency', String(concurrency), '--log', 'error',
  ];
}

module.exports = { REMOTION, writeProps, renderArgs };
