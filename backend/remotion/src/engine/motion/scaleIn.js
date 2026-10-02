import { interpolate } from 'remotion';
import { CLAMP } from './shared';

export const id = 'scaleIn';

export const compute = (frame, spec) => {
  const { delay = 0, duration = 20, from = 0.92, to = 1 } = spec || {};
  const opacity = interpolate(frame, [delay, delay + duration], [0, 1], CLAMP);
  const s = interpolate(frame, [delay, delay + duration], [from, to], CLAMP);
  return { opacity, transform: `scale(${s})` };
};
