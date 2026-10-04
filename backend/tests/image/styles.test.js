const { IMAGE_STYLES, STYLE_KEYS, NO_TEXT, composePrompt, composeFinalPrompt, textLines } = require('../../src/services/image/styles');
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

  it('takes an optional "avoid" prompt, trimmed, defaulting to empty, capped at 500 characters', () => {
    expect(parse({ prompt: 'a red fox' }).data.negative).toBe('');
    expect(parse({ prompt: 'a red fox', negative: '  cars, text  ' }).data.negative).toBe('cars, text');
    expect(parse({ prompt: 'a red fox', negative: 'x'.repeat(501) }).success).toBe(false);
  });

  it('rejects a pinned seed with more than one image (they would all be identical)', () => {
    const result = parse({ prompt: 'a red fox', seed: 42, count: 2 });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toMatch(/identical/);
  });

  it('takes optional exact text: up to 3 lines of 80 characters, defaulting to empty', () => {
    expect(parse({ prompt: 'a red fox' }).data.text).toBe('');
    expect(parse({ prompt: 'a red fox', text: 'FUTURE OF AI\nBUILDING TOMORROW' }).success).toBe(true);
    expect(parse({ prompt: 'a red fox', text: 'a\nb\nc\nd' }).success).toBe(false);          // 4 lines
    expect(parse({ prompt: 'a red fox', text: 'x'.repeat(81) }).success).toBe(false);       // line too long
    expect(parse({ prompt: 'a red fox', text: 'a\n\n\nb' }).success).toBe(true);            // blanks don't count
  });
});

describe('textLines', () => {
  it('trims, drops blank lines, caps at three, and neutralises double quotes', () => {
    expect(textLines('  FUTURE OF AI \r\n\r\nSAY "HI"\nthree\nfour')).toEqual(['FUTURE OF AI', "SAY 'HI'", 'three']);
    expect(textLines('')).toEqual([]);
    expect(textLines(undefined)).toEqual([]);
  });
});

describe('composeFinalPrompt', () => {
  it('with exact text, describes it as the picture\'s text: large, centered, then smaller lines below', () => {
    const out = composeFinalPrompt('A conference poster, dark background', 'none', 'FUTURE OF AI\nBUILDING TOMORROW');
    expect(out).toBe(
      'A conference poster, dark background. The text reads exactly: "FUTURE OF AI" in very large bold sans-serif capital letters across the center, '
      + 'and below it "BUILDING TOMORROW" in smaller clean letters. Sharp, perfectly spelled, highly legible typography.'
    );
  });

  it('places a third line at the bottom', () => {
    expect(composeFinalPrompt('A poster', 'none', 'A\nB\nC')).toMatch(/and at the bottom "C" in small clean letters/);
  });

  it('keeps the style phrase before the text instructions', () => {
    const out = composeFinalPrompt('A poster', 'cinematic', 'HELLO');
    expect(out.indexOf(IMAGE_STYLES.cinematic.suffix)).toBeGreaterThan(-1);
    expect(out.indexOf(IMAGE_STYLES.cinematic.suffix)).toBeLessThan(out.indexOf('The text reads exactly'));
  });

  it('with no text and no quoted words, says plainly there is none (models invent labels otherwise)', () => {
    expect(composeFinalPrompt('A classroom with a screen and whiteboards', 'none', ''))
      .toBe(`A classroom with a screen and whiteboards. ${NO_TEXT}`);
    expect(composeFinalPrompt('A classroom.', 'none')).toBe(`A classroom. ${NO_TEXT}`);
    expect(NO_TEXT).toMatch(/unlabeled.*no words, letters, numbers/);
  });

  it('leaves a prompt that already quotes its own text alone', () => {
    expect(composeFinalPrompt('A shop sign that says "OPEN"', 'none', '')).toBe('A shop sign that says "OPEN"');
    expect(composeFinalPrompt('A sign that says “OPEN”', 'none', '')).toBe('A sign that says “OPEN”');
  });
});
