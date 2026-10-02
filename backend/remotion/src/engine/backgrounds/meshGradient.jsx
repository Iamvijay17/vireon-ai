import React from 'react';
import { createSeededRng, range } from '../seedRandom';
import { layerStyle, clampIntensity } from './shared';

export const id = 'meshGradient';

const POINT_COUNT = 4;

/**
 * Lightweight multi-point gradient effect - layered radial gradients on one
 * div instead of a canvas/WebGL mesh library, per the performance brief.
 * Point positions are seeded (deterministic per scene) and drift gently via
 * sine, so no Math.random() runs during render.
 */
export const render = ({ frame = 0, palette, intensity = 0.3, seed = 'mesh' } = {}) => {
  const rng = createSeededRng(`${seed}-meshGradient`);
  const bg = palette?.bg || '#111111';
  const accent = palette?.accent || '#6c63ff';
  const colors = [accent, palette?.textMuted || bg];

  const layers = Array.from({ length: POINT_COUNT }, (_, i) => {
    const baseX = range(rng, 10, 90);
    const baseY = range(rng, 10, 90);
    const speed = range(rng, 0.15, 0.35);
    const phase = range(rng, 0, Math.PI * 2);
    const drift = 8;
    const x = baseX + Math.sin(frame * 0.01 * speed + phase) * drift;
    const y = baseY + Math.cos(frame * 0.01 * speed + phase) * drift;
    const color = colors[i % colors.length];
    return `radial-gradient(circle at ${x.toFixed(1)}% ${y.toFixed(1)}% , ${color}59 0%, transparent 55%)`;
  });

  return (
    <div
      style={layerStyle({
        backgroundColor: bg,
        backgroundImage: layers.join(', '),
        opacity: clampIntensity(intensity, 0.15, 0.75),
      })}
    />
  );
};
