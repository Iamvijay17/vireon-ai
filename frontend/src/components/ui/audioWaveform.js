// Waveform helpers for AudioPlayer. Kept out of the component file so they can
// be unit tested and so the component file only exports a component.

// Bar geometry (px). The bar count is derived from the available width so the
// waveform always spans the whole track; a fixed count of fixed-width bars
// left most of a wide pill empty.
export const BAR_WIDTH = 3;
export const BAR_GAP = 2;
export const MIN_BARS = 8;
export const MAX_BARS = 160;
// Shape pool the visible bars are sampled from, so a resize rescales the same
// waveform instead of generating a different one.
const POOL_SIZE = MAX_BARS;

/** How many bars fit in `widthPx`, clamped to a sensible range. */
export const barCountFor = (widthPx) => {
  if (!Number.isFinite(widthPx) || widthPx <= 0) return 46; // first paint, before measuring
  const fit = Math.floor((widthPx + BAR_GAP) / (BAR_WIDTH + BAR_GAP));
  return Math.min(MAX_BARS, Math.max(MIN_BARS, fit));
};

/** `count` bars evenly sampled from the full-resolution pool. */
export const resampleBars = (pool, count) =>
  Array.from({ length: count }, (_, i) => pool[Math.min(pool.length - 1, Math.floor((i * pool.length) / count))]);

// Deterministic pseudo-random bar heights seeded by the src URL, so the same
// file always renders the same waveform shape. This is a visual stand-in,
// not real decoded audio data.
//
// Uses Math.imul for the 32-bit multiplications (mulberry32, seeded via a
// simple string hash) rather than plain `*` - a bare `h * <32-bit multiplier>`
// exceeds Number.MAX_SAFE_INTEGER for most `h` values, silently losing
// precision before the `>>> 0` truncation, which degrades the sequence's
// randomness (some seeds produced runs of visually flat/near-empty bars).
export const seededBars = (seed, count) => {
  const str = seed || 'audio';
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = (() => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  })();

  const bars = [];
  for (let i = 0; i < count; i++) {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const rand = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    bars.push(0.3 + rand * 0.7);
  }
  return bars;
};

export const barPool = (seed) => seededBars(seed, POOL_SIZE);
