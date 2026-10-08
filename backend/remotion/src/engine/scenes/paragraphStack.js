import { buildTitledStack } from './stackLayout';

export const id = 'paragraph-stack';

export const build = (profile, _rng, ctx) => buildTitledStack(profile, ctx, {
  strategy: id,
  role: 'body',
  titleMaxFont: 68, maxFont: 34, minFont: 22, lineHeight: 1.5,
});
