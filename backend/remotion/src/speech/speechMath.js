/**
 * Pure envelopes behind the speech-aware animation primitives. Kept free of
 * React / Remotion so they are unit-testable and so every primitive uses the
 * same, deliberately gentle, curves.
 *
 * Time is SECONDS (frame / fps); every function returns a plain number or
 * small object. Defaults are subtle on purpose: a word should be noticeable,
 * never bouncy.
 */

export const clamp01 = (n) => Math.min(1, Math.max(0, n));

/** Smoothstep: 0 -> 1 with zero slope at both ends. */
export const ease = (x) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};

/**
 * 0 -> 1 -> 0 envelope around an interval: rises over `attack` seconds from
 * `start`, holds while the interval is active, falls over `release` seconds
 * after `end`.
 */
export const pulseEnvelope = (t, start, end, { attack = 0.12, release = 0.2 } = {}) => {
  if (t < start || t >= end + release) return 0;
  const rise = attack > 0 ? ease((t - start) / attack) : 1;
  const fall = t < end ? 1 : release > 0 ? 1 - ease((t - end) / release) : 0;
  return Math.min(rise, fall);
};

/** Scale for a "grow while spoken" effect: 1 -> peak -> 1 (peak 1.08 = +8%). */
export const scaleFromEnvelope = (envelope, peak = 1.08) => 1 + (peak - 1) * envelope;

/** 0 -> 1 eased progress `duration` seconds after `start` (0 before, 1 after). */
export const revealProgress = (t, start, { duration = 0.45 } = {}) => (duration > 0 ? ease((t - start) / duration) : t >= start ? 1 : 0);

/**
 * A single quick "pop" beginning at `start`: scale settles 0.94 -> ~1.03 -> 1
 * and opacity eases in. Returns { scale, opacity }; before `start` the element
 * rests at its hidden pose (scale 0.94, opacity 0).
 */
export const popState = (t, start, { duration = 0.32, overshoot = 0.03 } = {}) => {
  const x = duration > 0 ? clamp01((t - start) / duration) : t >= start ? 1 : 0;
  if (x <= 0) return { scale: 0.94, opacity: 0 };
  const base = 0.94 + 0.06 * ease(x);
  const bump = overshoot * Math.sin(Math.PI * x) * (1 - x);
  return { scale: base + bump, opacity: ease(Math.min(1, x * 2)) };
};

/**
 * Phrase-driven transition state. The phrase being spoken (or, in a gap, the
 * last one that was) is `phrase`; `enter` eases 0 -> 1 over `inDuration` from
 * its start and stays 1 afterwards, so the content holds until the next
 * phrase begins - then `phrase` changes and a new enter begins.
 *
 *   state: 'idle' (nothing spoken yet) | 'entering' | 'active' | 'holding'
 */
export const phraseTransitionState = (phrases, t, { inDuration = 0.25 } = {}) => {
  let current = null;
  for (let i = 0; i < phrases.length && phrases[i].start <= t; i++) current = phrases[i];
  if (!current) return { phrase: null, enter: 0, state: 'idle' };
  const enter = ease((t - current.start) / inDuration);
  const state = t >= current.end ? 'holding' : enter < 1 ? 'entering' : 'active';
  return { phrase: current, enter, state };
};
