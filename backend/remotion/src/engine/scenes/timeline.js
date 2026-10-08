import { buildTitledStack } from './stackLayout';

export const id = 'timeline';

// Text starts 70px in from the margin; the two-digit badge (22px type + 12px margin) sits inline.
const TIMELINE_INDENT = 70;
const BADGE_INSET = 40;

export const build = (profile, _rng, ctx) => buildTitledStack(profile, ctx, {
  strategy: id,
  role: 'listItem', keepHeading: true,
  indent: TIMELINE_INDENT, inset: BADGE_INSET,
  titleMaxFont: 68, maxFont: 28, minFont: 18, lineHeight: 1.4,
  extra: (_item, index) => ({ numbered: true, index }),
});
