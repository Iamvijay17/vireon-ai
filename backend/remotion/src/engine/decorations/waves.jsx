import React from 'react';
import { clampIntensity } from './shared';

export const id = 'waves';

const buildWavePath = (amplitude, frequency, phase, baseline) => {
  const points = [];
  for (let x = 0; x <= 100; x += 5) {
    const y = baseline + Math.sin((x / 100) * Math.PI * 2 * frequency + phase) * amplitude;
    points.push(`${x},${y.toFixed(2)}`);
  }
  return `M0,100 L${points.join(' L')} L100,100 Z`;
};

/**
 * Two stacked SVG wave bands near the bottom edge, amplitude/phase eased
 * off the current frame. Path is recomputed per frame but only from ~20
 * points, cheap even at 30fps.
 */
export const render = ({ frame = 0, palette, intensity = 0.25 } = {}) => {
  const opacity = clampIntensity(intensity);
  const color = palette?.accent || '#6c63ff';
  const phase = frame * 0.02;
  const amplitude = 4 + Math.sin(frame * 0.01) * 1.5;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <path d={buildWavePath(amplitude, 1.5, phase, 88)} fill={color} opacity={opacity} />
      <path d={buildWavePath(amplitude * 0.8, 1.2, phase + 1.5, 93)} fill={color} opacity={opacity * 0.7} />
    </svg>
  );
};
