import { buildCardRows } from './stackLayout';

export const id = 'comparison-split';

/**
 * Two-column side-by-side comparison for exactly 2 non-paragraph items -
 * each column rendered as a `card` slot (the same chrome buildGrid already
 * uses) so the two sides read as visually distinct without needing a new
 * divider-line rendering primitive. Portrait/square canvases stack the two
 * cards instead of squeezing them side by side. Cards are as tall as their
 * text needs, not as tall as the space below the title.
 */
export const build = (profile, _rng, ctx) => buildCardRows(profile, ctx, {
  strategy: id,
  cols: (orientation) => (orientation === 'landscape' ? 2 : 1),
  colGap: 48, titleMaxFont: 56, maxFont: 28, minFont: 18, minCardHeight: 180,
  decorate: (item, index) => ({ ...item, heading: item.heading || (index === 0 ? 'A' : 'B') }),
});
