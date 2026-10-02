import React from 'react';
import { createSeededRng, range } from '../seedRandom';
import { layerStyle, clampIntensity } from './shared';

export const id = 'glow';

/**
 * A single slowly-orbiting, pulsing radial light source. Deterministic
 * origin (seeded) with a small orbit radius so it reads as "alive" without
 * ever sweeping across the whole frame.
 */
export const render = ({ frame = 0, palette, intensity = 0.3, seed = 'glow' } = {}) => {
  const rng = createSeededRng(`${seed}-glow`);
  const opacity = clampIntensity(intensity, 0.1, 0.65);
  const color = palette?.accent || '#6c63ff';
  const baseX = range(rng, 25, 75);
  const baseY = range(rng, 20, 70);
  const orbitRadius = range(rng, 6, 14);
  const speed = range(rng, 0.15, 0.3);

  const x = baseX + Math.sin(frame * 0.01 * speed) * orbitRadius;
  const y = baseY + Math.cos(frame * 0.008 * speed) * orbitRadius;
  const pulse = 0.85 + 0.15 * Math.sin(frame * 0.02);
  const scale = 1 + 0.08 * Math.sin(frame * 0.015);

  return (
    <div
      style={layerStyle({
        background: `radial-gradient(circle at ${x.toFixed(1)}% ${y.toFixed(1)}%, ${color}66 0%, transparent 55%)`,
        opacity: opacity * pulse,
        transform: `scale(${scale})`,
      })}
    />
  );
};
