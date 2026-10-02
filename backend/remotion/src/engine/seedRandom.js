/**
 * Deterministic seeded randomness for the generative scene engine. Every
 * layer (layout, style, motion) derives its choices from a string seed
 * (the scene's stable `sceneId`, see GeneratedScene.jsx) via this module -
 * same seed always produces the same output, which is what lets a scene's
 * generated layout/style/motion be computed on demand (in preview AND in
 * the final render) instead of needing to be precomputed once and stored.
 */

// xmur3 string hash -> 32-bit seed, feeding mulberry32 below. Not
// cryptographic - just needs to spread similar seeds (e.g. "scene-1" vs
// "scene-2") across very different starting states.
const hashStringToSeed = (str) => {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
};

const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Creates a `() => number` RNG in [0, 1) from any seed input (string or
 * number). Callers append a suffix to the base seed (e.g. `${seed}-layout`
 * vs `${seed}-style`) so different engine layers don't accidentally draw
 * correlated values from the same stream.
 */
export const createSeededRng = (seedInput) => {
  const seedStr = String(seedInput ?? 'vireon');
  const hashFn = hashStringToSeed(seedStr);
  return mulberry32(hashFn());
};

export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

export const range = (rng, min, max) => min + rng() * (max - min);
