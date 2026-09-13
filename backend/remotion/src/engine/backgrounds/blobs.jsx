import React from 'react';
import { createSeededRng, range, pick } from '../seedRandom';
import { layerStyle, clampIntensity } from './shared';

export const id = 'blobs';

const BLOB_COUNT = 3; // kept low - one blur() filter over a few divs stays cheap

/**
 * Large abstract soft-edged blobs (CSS border-radius + blur, no SVG/canvas
 * needed) that drift, scale and rotate slowly. Deterministic per-seed
 * placement so the same scene always renders the same blob layout.
 */
export const render = ({ frame = 0, palette, intensity = 0.3, seed = 'blobs' } = {}) => {
  const rng = createSeededRng(`${seed}-blobs`);
  const opacity = clampIntensity(intensity, 0.06, 0.45);
  const colors = [palette?.accent || '#6c63ff', palette?.textMuted || palette?.bg || '#333333'];

  const blobs = Array.from({ length: BLOB_COUNT }, (_, i) => {
    const x = range(rng, 15, 85);
    const y = range(rng, 15, 85);
    const size = range(rng, 32, 55);
    const speed = range(rng, 0.08, 0.18);
    const phase = range(rng, 0, Math.PI * 2);
    const rotationSpeed = range(rng, -0.4, 0.4);
    const color = pick(rng, colors);
    const dx = Math.sin(frame * 0.008 * speed + phase) * 6;
    const dy = Math.cos(frame * 0.006 * speed + phase) * 6;
    const rotate = frame * rotationSpeed * 0.05;
    const scale = 1 + 0.05 * Math.sin(frame * 0.01 * speed + phase);
    return { key: i, x: x + dx, y: y + dy, size, color, rotate, scale };
  });

  return (
    <div style={layerStyle({ filter: 'blur(40px)' })}>
      {blobs.map((b) => (
        <div
          key={b.key}
          style={{
            position: 'absolute',
            left: `${b.x}%`,
            top: `${b.y}%`,
            width: `${b.size}%`,
            aspectRatio: '1 / 1',
            borderRadius: '42% 58% 65% 35% / 45% 40% 60% 55%',
            backgroundColor: b.color,
            opacity,
            transform: `translate(-50%, -50%) rotate(${b.rotate}deg) scale(${b.scale})`,
          }}
        />
      ))}
    </div>
  );
};
