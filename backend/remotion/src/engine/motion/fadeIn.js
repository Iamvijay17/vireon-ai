import { interpolate } from 'remotion';
import { CLAMP } from './shared';

export const id = 'fadeIn';

/**
 * Plain opacity ramp - the fallback every other animation component falls
 * back to on an unrecognized `type`.
 */
export const compute = (frame, spec) => {
  const { delay = 0, duration = 20 } = spec || {};
  const opacity = interpolate(frame, [delay, delay + duration], [0, 1], CLAMP);
  return { opacity };
};
