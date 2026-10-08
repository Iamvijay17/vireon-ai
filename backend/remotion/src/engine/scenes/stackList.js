import { buildTitledStack } from './stackLayout';

export const id = 'stack-list';

// Bullet dot (8px) + its 12px margin sit inline ahead of the text.
const BULLET_INSET = 20;

export const build = (profile, _rng, ctx) => buildTitledStack(profile, ctx, {
  strategy: id,
  role: 'listItem', keepHeading: true,
  widthRatio: 0.88, inset: BULLET_INSET,
  titleMaxFont: 68, maxFont: 32, minFont: 20, lineHeight: 1.4,
  extra: () => ({ bullet: true }),
});
