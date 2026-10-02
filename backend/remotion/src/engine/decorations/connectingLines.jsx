import React from 'react';
import { createSeededRng, range } from '../seedRandom';
import { clampIntensity } from './shared';

export const id = 'connectingLines';

const NODE_COUNT = 5;

/**
 * A small ring of SVG nodes joined by dashed lines with a slowly moving
 * dash-offset ("data flow" look) - suited to technology/process/workflow
 * content per the design brief. A handful of elements, no per-frame
 * geometry recomputation beyond the dash offset.
 */
export const render = ({ frame = 0, palette, intensity = 0.25, seed = 'connectingLines' } = {}) => {
  const rng = createSeededRng(`${seed}-connectingLines`);
  const opacity = clampIntensity(intensity);
  const color = palette?.accent || '#ffffff';

  const nodes = Array.from({ length: NODE_COUNT }, () => ({
    x: range(rng, 8, 92),
    y: range(rng, 8, 92),
  }));

  const dashOffset = -(frame * 0.6) % 40;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      {nodes.map((node, i) => {
        const next = nodes[(i + 1) % nodes.length];
        return (
          <line
            key={`line-${i}`}
            x1={node.x} y1={node.y} x2={next.x} y2={next.y}
            stroke={color} strokeWidth="0.15"
            strokeDasharray="2 2" strokeDashoffset={dashOffset}
            opacity={opacity}
          />
        );
      })}
      {nodes.map((node, i) => (
        <circle key={`node-${i}`} cx={node.x} cy={node.y} r="0.6" fill={color} opacity={Math.min(0.8, opacity * 1.4)} />
      ))}
    </svg>
  );
};
