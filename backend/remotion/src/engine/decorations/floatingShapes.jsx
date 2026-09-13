import React from 'react';
import { createSeededRng, range, pick } from '../seedRandom';
import { layerStyle, clampIntensity } from './shared';

export const id = 'floatingShapes';

const SHAPE_TYPES = ['circle', 'square', 'roundedRect'];
const DEFAULT_COUNT = 6;

const shapeStyle = (type, size, color) => {
  if (type === 'circle') return { borderRadius: '50%', backgroundColor: color };
  if (type === 'roundedRect') return { borderRadius: size * 0.25, backgroundColor: color };
  return { borderRadius: 4, backgroundColor: color };
};

/**
 * Circles/squares/rounded rects that float, rotate and fade very gently.
 * Deterministic seeded placement; count stays low per the performance
 * brief. Fully click-through, so it never interferes with content on top.
 */
export const render = ({ frame = 0, palette, intensity = 0.25, seed = 'floatingShapes', count = DEFAULT_COUNT } = {}) => {
  const rng = createSeededRng(`${seed}-floatingShapes`);
  const opacity = clampIntensity(intensity);
  const color = palette?.accent || '#ffffff';

  const shapes = Array.from({ length: count }, (_, i) => {
    const type = pick(rng, SHAPE_TYPES);
    const x = range(rng, 4, 96);
    const y = range(rng, 4, 96);
    const size = range(rng, 18, 46);
    const speed = range(rng, 0.1, 0.25);
    const phase = range(rng, 0, Math.PI * 2);
    const rotationSpeed = range(rng, -0.3, 0.3);
    const drift = range(rng, 3, 8);
    const dx = Math.sin(frame * 0.01 * speed + phase) * drift;
    const dy = Math.cos(frame * 0.008 * speed + phase) * drift;
    const rotate = frame * rotationSpeed * 0.1;
    const fade = 0.6 + 0.4 * Math.sin(frame * 0.015 * speed + phase);
    return { key: i, type, x: x + dx, y: y + dy, size, rotate, fade: Math.max(0, fade) };
  });

  return (
    <div style={layerStyle()}>
      {shapes.map((s) => (
        <div
          key={s.key}
          style={{
            position: 'absolute',
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            opacity: opacity * s.fade,
            transform: `translate(-50%, -50%) rotate(${s.rotate}deg)`,
            ...shapeStyle(s.type, s.size, color),
          }}
        />
      ))}
    </div>
  );
};
