const { segmentText, splitSentences } = require('../../src/services/audio/pipeline/segmenter');

const opts = { maxChars: 120, minChars: 30 };

describe('splitSentences', () => {
  it('splits on sentence ends but not abbreviations, initials or decimals', () => {
    expect(splitSentences('Dr. Smith met J. K. Rowling. They talked about v3.5 for hours!')).toEqual([
      'Dr. Smith met J. K. Rowling.',
      'They talked about v3.5 for hours!',
    ]);
    expect(splitSentences('Use e.g. Redis. It is fast.')).toEqual(['Use e.g. Redis.', 'It is fast.']);
  });

  it('keeps closing quotes with their sentence', () => {
    expect(splitSentences('He said "stop." Then he left.')).toEqual(['He said "stop."', 'Then he left.']);
  });
});

describe('segmentText', () => {
  it('keeps short narration as a single segment', () => {
    const segs = segmentText('Databases store data. Indexes make queries faster.', opts);
    expect(segs).toHaveLength(1);
    expect(segs[0].text).toBe('Databases store data. Indexes make queries faster.');
  });

  it('returns nothing for empty text', () => {
    expect(segmentText('   \n\n  ', opts)).toEqual([]);
  });

  it('packs whole sentences up to the limit and never cuts a sentence mid-way', () => {
    const s = 'This is a reasonably long sentence about databases and queries.';
    const segs = segmentText(`${s} ${s} ${s} ${s}`, opts);
    expect(segs.length).toBeGreaterThan(1);
    for (const seg of segs) {
      expect(seg.text.length).toBeLessThanOrEqual(120);
      expect(seg.text.endsWith('.')).toBe(true);
    }
    expect(segs.map((x) => x.text).join(' ')).toBe(`${s} ${s} ${s} ${s}`);
  });

  it('splits an over-long sentence at clause breaks, then words', () => {
    const long = 'First we collect the data, then we clean it carefully, and after that we train the model on the result, which takes a while';
    const segs = segmentText(long, { maxChars: 60, minChars: 10 });
    expect(segs.length).toBeGreaterThan(1);
    segs.forEach((x) => expect(x.text.length).toBeLessThanOrEqual(60));
    expect(segs.map((x) => x.text).join(' ')).toBe(long);

    const noSpaces = 'x'.repeat(250);
    const hard = segmentText(noSpaces, { maxChars: 100, minChars: 10 });
    expect(hard.map((x) => x.text).join('')).toBe(noSpaces);
    hard.forEach((x) => expect(x.text.length).toBeLessThanOrEqual(100));
  });

  it('marks paragraph breaks and never merges across them', () => {
    const segs = segmentText('One short line here.\n\nAnother short line there.', { maxChars: 200, minChars: 5 });
    expect(segs.map((s) => s.paragraphBreakBefore)).toEqual([false, true]);
  });

  it('folds a tiny trailing sentence into its neighbour', () => {
    const segs = segmentText('This sentence is long enough to stand alone for sure. Yes.', { maxChars: 80, minChars: 20 });
    expect(segs).toHaveLength(1);
  });

  it('preserves wording exactly (whitespace-normalised)', () => {
    const segs = segmentText('Node.js   is\nfast. MongoDB too.', opts);
    expect(segs[0].text).toBe('Node.js is fast. MongoDB too.');
  });
});
