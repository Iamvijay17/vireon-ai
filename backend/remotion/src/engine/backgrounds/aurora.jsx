import React from 'react';
import { createSeededRng, range } from '../seedRandom';
import { layerStyle, clampIntensity } from './shared';

export const id = 'aurora';

const BAND_COUNT = 3;

/**
 * Soft layered gradient bands drifting slowly, like a distant aurora.
 * Cheap: a handful of blurred, skewed divs rather than any particle system.
 */
export const render = ({ frame = 0, palette, intensity = 0.3, seed = 'aurora' } = {}) => {
  const rng = createSeededRng(`${seed}-aurora`);
  const opacity = clampIntensity(intensity, 0.1, 0.55);
  const accent = palette?.accent || '#6c63ff';
  const bg = palette?.bg || '#111111';

  const bands = Array.from({ length: BAND_COUNT }, (_, i) => {
    const top = range(rng, -10, 55);
    const speed = range(rng, 0.05, 0.12);
    const phase = range(rng, 0, Math.PI * 2);
    const skew = range(rng, -8, 8);
    const height = range(rng, 30, 55);
    const shift = Math.sin(frame * 0.006 * speed + phase) * 12;
    return { key: i, top: top + shift, skew, height };
  });

  return (
    <div style={layerStyle({ filter: 'blur(60px)', backgroundColor: bg })}>
      {bands.map((band) => (
        <div
          key={band.key}
          style={{
            position: 'absolute',
            left: '-10%',
            right: '-10%',
            top: `${band.top}%`,
            height: `${band.height}%`,
            background: `linear-gradient(90deg, transparent 0%, ${accent} 45%, transparent 100%)`,
            opacity,
            transform: `skewY(${band.skew}deg)`,
          }}
        />
      ))}
    </div>
  );
};
