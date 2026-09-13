export const id = 'typewriterReveal';

/**
 * Whole-slot left-to-right reveal via a growing clip window - a
 * per-character DOM split (animations/typewriter.js's approach) isn't
 * practical for an arbitrary slot of already-laid-out text, so this adapts
 * the same "reveal over time" idea to a single clipPath sweep, no fade
 * (unlike maskWipe, which fades nothing but also isn't meant to read as
 * "typing").
 */
export const compute = (frame, spec) => {
  const { delay = 0, duration = 20 } = spec || {};
  const relativeFrame = frame - delay;
  if (relativeFrame < 0) return { opacity: 0, clipPath: 'inset(0 100% 0 0)' };

  const progress = Math.min(relativeFrame / duration, 1);
  return { opacity: 1, clipPath: `inset(0 ${100 - progress * 100}% 0 0)` };
};
