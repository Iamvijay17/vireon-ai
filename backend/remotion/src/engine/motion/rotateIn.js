import { interpolate } from 'remotion';

export const id = 'rotateIn';

/**
 * Ported from animations/rotate.js's `useRotate` hook, with a subtler
 * default sweep (-20deg instead of the hook's -180deg default) - that
 * default suits a standalone element entrance, but a full half-turn reads
 * as broken on a layout slot's title/body text. Still fully overridable via
 * `spec.from`/`spec.to` for a caller that wants the dramatic version.
 */
export const compute = (frame, spec) => {
  const { delay = 0, duration = 20, from = -20, to = 0 } = spec || {};
  const relativeFrame = frame - delay;
  if (relativeFrame < 0) return { opacity: 0, transform: `rotate(${from}deg)` };

  const progress = Math.min(relativeFrame / duration, 1);
  const rotation = interpolate(progress, [0, 1], [from, to]);

  return { transform: `rotate(${rotation}deg)`, opacity: progress };
};
