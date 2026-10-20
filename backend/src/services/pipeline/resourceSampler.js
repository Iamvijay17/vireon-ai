const os = require('os');
const { createVramProbe } = require('../gpu/vram');

/**
 * Peak resource use over one pipeline stage, measured rather than estimated.
 *
 * Samples the WHOLE MACHINE every `intervalMs` (default 3s) while a stage runs:
 *
 *   vram  nvidia-smi: used / free / total. The card is shared with the desktop
 *         (~0.7 GB idle on the dev box) and with any other process, so read
 *         `startUsedMb` as the baseline and the peak as "what the machine held
 *         while this stage ran" - not "what this stage alone needed".
 *   ram   os.totalmem / os.freemem (system-wide, not per process: the models
 *         run in child processes and Remotion's Chrome tabs, so the worker's
 *         own RSS would say almost nothing).
 *   cpu   utilisation derived from os.cpus() tick deltas between samples.
 *
 * "Not measured" is never reported as zero: `vram` is null when nvidia-smi
 * is missing or failed on every sample, and `cpu` is null when fewer than two
 * samples exist (a delta needs two). The sampler never throws into the stage
 * it observes, never overlaps its own reads (the next read is scheduled only
 * after the previous one finishes) and its timer never keeps a process alive.
 *
 * Cost: one nvidia-smi spawn per sample, measured ~50ms on the dev box, i.e.
 * under 2% of one core at the default interval. `readVram`, `readMemory`,
 * `readCpuTicks` and `now` are injectable for tests.
 */

const MB = 1024 * 1024;

const defaultReadMemory = () => ({ totalMb: os.totalmem() / MB, freeMb: os.freemem() / MB });

function defaultReadCpuTicks() {
  let idle = 0;
  let total = 0;
  for (const { times } of os.cpus()) {
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.irq + times.idle;
  }
  return { idle, total };
}

const round = (n, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

function createResourceSampler({
  intervalMs = 3000,
  readVram = createVramProbe({ cacheMs: 0 }).read,
  readMemory = defaultReadMemory,
  readCpuTicks = defaultReadCpuTicks,
  now = Date.now,
} = {}) {
  let startedAt = null;
  let timer = null;
  let running = false;
  let current = null; // the sample in flight, so stop() can wait for it
  let stopped = null; // memoised summary: stop() is idempotent

  let sampleCount = 0;
  let vramReads = 0;
  let vram = null; // { startUsedMb, peakUsedMb, minFreeMb, totalMb }
  let ramPeakUsedMb = null;
  let ramMinFreeMb = null;
  let ramTotalMb = null;
  let lastTicks = null;
  const cpuReadings = [];

  async function sampleOnce() {
    try {
      const mem = readMemory();
      ramTotalMb = mem.totalMb;
      const used = mem.totalMb - mem.freeMb;
      ramPeakUsedMb = ramPeakUsedMb === null ? used : Math.max(ramPeakUsedMb, used);
      ramMinFreeMb = ramMinFreeMb === null ? mem.freeMb : Math.min(ramMinFreeMb, mem.freeMb);

      const ticks = readCpuTicks();
      if (lastTicks && ticks.total > lastTicks.total) {
        cpuReadings.push((1 - (ticks.idle - lastTicks.idle) / (ticks.total - lastTicks.total)) * 100);
      }
      lastTicks = ticks;

      const gpu = await readVram({ fresh: true });
      if (gpu) {
        vramReads += 1;
        vram = vram
          ? { ...vram, peakUsedMb: Math.max(vram.peakUsedMb, gpu.usedMb), minFreeMb: Math.min(vram.minFreeMb, gpu.freeMb), totalMb: gpu.totalMb }
          : { startUsedMb: gpu.usedMb, peakUsedMb: gpu.usedMb, minFreeMb: gpu.freeMb, totalMb: gpu.totalMb };
      }
      sampleCount += 1;
    } catch {
      // Observability must never fail the stage it describes.
    }
  }

  function loop() {
    current = sampleOnce().finally(() => {
      current = null;
      if (running) {
        timer = setTimeout(loop, intervalMs);
        timer.unref?.();
      }
    });
  }

  function start() {
    if (running || stopped) return;
    running = true;
    startedAt = now();
    loop();
  }

  /** Stop sampling and return the summary (same object on repeat calls). */
  async function stop() {
    if (stopped) return stopped;
    const wasRunning = running;
    running = false;
    clearTimeout(timer);
    if (current) await current; // let the in-flight read land
    if (wasRunning) await sampleOnce(); // closing sample, so even a short stage has two

    const durationMs = startedAt === null ? 0 : now() - startedAt;
    stopped = {
      sampleCount,
      intervalMs,
      durationMs,
      vram: vram && {
        startUsedMb: round(vram.startUsedMb),
        peakUsedMb: round(vram.peakUsedMb),
        minFreeMb: round(vram.minFreeMb),
        totalMb: round(vram.totalMb),
        reads: vramReads,
      },
      ram: ramPeakUsedMb === null ? null : {
        peakUsedMb: round(ramPeakUsedMb),
        minFreeMb: round(ramMinFreeMb),
        totalMb: round(ramTotalMb),
      },
      cpu: cpuReadings.length === 0 ? null : {
        peakPct: round(Math.max(...cpuReadings), 1),
        avgPct: round(cpuReadings.reduce((a, b) => a + b, 0) / cpuReadings.length, 1),
        intervals: cpuReadings.length,
      },
    };
    return stopped;
  }

  return { start, stop };
}

module.exports = { createResourceSampler };
