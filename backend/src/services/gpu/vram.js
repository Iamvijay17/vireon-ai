const { execFile } = require('child_process');

/**
 * VRAM knowledge for admission control, in two halves:
 *
 *   - `createVramProbe()` reads the card's real usage from nvidia-smi (null
 *     wherever that is not installed, so a CPU-only box or a non-NVIDIA GPU
 *     simply gets slot-based admission).
 *   - `budgetMb` / `fits` are pure arithmetic over *estimates*, so the
 *     scheduling rules are testable without a GPU.
 *
 * The estimates are configuration, not measurement (config.gpu.vram) - what
 * the live probe adds is a way to notice that something *else* is holding the
 * card, which no estimate can tell us.
 */

const QUERY = ['--query-gpu=name,memory.used,memory.total,memory.free', '--format=csv,noheader,nounits'];

const defaultExec = (cmd, args, opts) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });

/** Parse the first GPU row of nvidia-smi's csv output; null if it isn't one. */
function parseNvidiaSmi(stdout) {
  const row = String(stdout || '').trim().split('\n')[0];
  if (!row) return null;
  const [name, used, total, free] = row.split(',').map((s) => s.trim());
  const usedMb = Number(used);
  const totalMb = Number(total);
  const freeMb = Number(free);
  if (![usedMb, totalMb, freeMb].every(Number.isFinite) || totalMb <= 0) return null;
  return { name, usedMb, totalMb, freeMb };
}

/**
 * A cached nvidia-smi reader. Cached because admission re-checks while it
 * waits, and spawning a process several times a second to learn what changed
 * 200ms ago is wasted work. `exec` and `now` are injectable for tests.
 */
function createVramProbe({ cacheMs = 2000, timeoutMs = 3000, exec = defaultExec, now = Date.now } = {}) {
  let cached = null;
  let cachedAt = null;
  let inFlight = null;

  async function read({ fresh = false } = {}) {
    if (!fresh && cachedAt !== null && now() - cachedAt < cacheMs) return cached;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const stdout = await exec('nvidia-smi', QUERY, { timeout: timeoutMs, windowsHide: true });
        cached = parseNvidiaSmi(stdout);
      } catch {
        cached = null; // not installed / driver down: callers fall back to estimates
      }
      cachedAt = now();
      return cached;
    })().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return { read };
}

/** Usable VRAM for models: the card's total (probe wins over config) minus the reserve. */
function budgetMb({ totalMb, reserveMb }) {
  return Math.max(0, totalMb - reserveMb);
}

/**
 * Can `candidateMb` be resident alongside `residentMb` (each already-loaded
 * service's estimate) within `budget`?
 *
 * A candidate that cannot fit even alone is still admitted when nothing else
 * is resident - refusing it forever would wedge the pipeline over an estimate
 * that is probably just conservative. It simply gets the card to itself.
 */
function fits({ candidateMb, residentMb = [], budget }) {
  if (residentMb.length === 0) return true;
  const used = residentMb.reduce((sum, mb) => sum + mb, 0);
  return used + candidateMb <= budget;
}

module.exports = { createVramProbe, parseNvidiaSmi, budgetMb, fits };
