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

const { REMOTION, writeProps, renderArgs } = require('./lib/benchComposition');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'vireon-render-bench-'));

const propsPath = writeProps(OUT);

function once(concurrency) {
  return new Promise((resolve) => {
    const out = path.join(OUT, `bench-${concurrency}.mp4`);
    const args = renderArgs({ out, propsPath, concurrency });
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
