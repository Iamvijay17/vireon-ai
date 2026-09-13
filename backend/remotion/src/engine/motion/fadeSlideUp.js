import { interpolate } from 'remotion';
import { CLAMP } from './shared';

export const id = 'fadeSlideUp';

export const compute = (frame, spec) => {
  const { delay = 0, duration = 20, distance = 24 } = spec || {};
  const opacity = interpolate(frame, [delay, delay + duration], [0, 1], CLAMP);
  const y = interpolate(frame, [delay, delay + duration], [distance, 0], CLAMP);
  return { opacity, transform: `translateY(${y}px)` };
};
