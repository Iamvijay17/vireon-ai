import { buildCardRows } from './stackLayout';

export const id = 'grid';

// Two columns on landscape; narrower canvases would squeeze cards to ~450px, so they stack.
export const build = (profile, _rng, ctx) => buildCardRows(profile, ctx, {
  strategy: id,
  cols: (orientation) => (orientation === 'landscape' ? 2 : 1),
  colGap: 32, titleMaxFont: 56, maxFont: 26, minFont: 17, minCardHeight: 110,
});
