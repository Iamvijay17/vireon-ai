const { IMAGE_STYLES, STYLE_KEYS, composePrompt } = require('../../src/services/image/styles');
const { createImageSchema } = require('../../src/validators');

describe('composePrompt', () => {
  it('leaves the prompt alone for no style', () => {
    expect(composePrompt('  a red fox  ', 'none')).toBe('a red fox');
    expect(composePrompt('a red fox')).toBe('a red fox');
  });

  it('appends the style phrase, without doubling trailing punctuation', () => {
    expect(composePrompt('a red fox.', 'cinematic')).toBe(`a red fox, ${IMAGE_STYLES.cinematic.suffix}`);
    expect(composePrompt('a red fox, ', 'photo')).toBe(`a red fox, ${IMAGE_STYLES.photo.suffix}`);
  });

  it('ignores an unknown style rather than breaking the prompt', () => {
    expect(composePrompt('a red fox', 'nope')).toBe('a red fox');
  });

  it('gives every non-"none" style a phrase', () => {
    for (const key of STYLE_KEYS.filter((k) => k !== 'none')) expect(IMAGE_STYLES[key].suffix.length).toBeGreaterThan(10);
  });
});

describe('createImageSchema', () => {
  const parse = (body) => createImageSchema.safeParse(body);

  it('defaults everything but the prompt', () => {
    expect(parse({ prompt: 'a red fox' }).data).toMatchObject({ aspectRatio: '16:9', quality: 'standard', style: 'none', count: 1 });
  });

  it('accepts all three quality levels and rejects others', () => {
    for (const quality of ['fast', 'standard', 'high']) expect(parse({ prompt: 'a red fox', quality }).success).toBe(true);
    expect(parse({ prompt: 'a red fox', quality: 'ultra' }).success).toBe(false);
  });

  it('accepts a style, a batch and a pinned seed on its own', () => {
    expect(parse({ prompt: 'a red fox', style: 'anime', count: 4 }).success).toBe(true);
    expect(parse({ prompt: 'a red fox', seed: 42 }).success).toBe(true);
  });

  it('rejects more than 4 images, an unknown style, and a bad seed', () => {
    expect(parse({ prompt: 'a red fox', count: 5 }).success).toBe(false);
    expect(parse({ prompt: 'a red fox', style: 'nope' }).success).toBe(false);
    expect(parse({ prompt: 'a red fox', seed: -1 }).success).toBe(false);
    expect(parse({ prompt: 'a red fox', seed: 1.5 }).success).toBe(false);
  });

  it('rejects a pinned seed with more than one image (they would all be identical)', () => {
    const result = parse({ prompt: 'a red fox', seed: 42, count: 2 });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toMatch(/identical/);
  });
});
