const { mapToOriginalWords, similarity } = require('../../src/services/audio/pipeline/alignment/mapWords');
const { processText, spokenTokens } = require('../../src/services/audio/pipeline/pronunciation');

const heard = (list) => list.map(([word, start, end, probability = 0.95]) => ({ word, start, end, probability }));

function run(original, heardWords) {
  const p = processText(original, { enabled: true });
  return mapToOriginalWords(heard(heardWords), spokenTokens(p.spokenText), p.wordMap);
}

describe('similarity', () => {
  it('scores exact, close and different words', () => {
    expect(similarity('Hello,', 'hello')).toBe(2);
    expect(similarity('colour', 'color')).toBe(1);
    expect(similarity('cat', 'dog')).toBe(-2);
    expect(similarity('', 'dog')).toBe(-2);
  });
});

describe('mapToOriginalWords', () => {
  it('returns one timed word per caption word when nothing was respelled', () => {
    const r = run('Hello brave world', [['Hello', 0, 0.4], ['brave', 0.5, 0.9], ['world.', 1.0, 1.5]]);
    expect(r.words.map((w) => [w.word, w.start, w.end])).toEqual([['Hello', 0, 0.4], ['brave', 0.5, 0.9], ['world', 1.0, 1.5]]);
    expect(r.words.every((w) => w.estimated === false)).toBe(true);
    expect(r.matchedRatio).toBe(1);
  });

  it('keeps later words in sync when a respelling adds spoken words', () => {
    // spoken: "Use Mongo D B today" - the aligner hears five words, the caption has three.
    const r = run('Use MongoDB today', [['Use', 0, 0.3], ['Mongo', 0.35, 0.7], ['D', 0.7, 0.85], ['B', 0.85, 1.0], ['today', 1.1, 1.6]]);
    expect(r.words.map((w) => w.word)).toEqual(['Use', 'MongoDB', 'today']);
    expect(r.words[1]).toMatchObject({ start: 0.35, end: 1.0 });
    expect(r.words[2]).toMatchObject({ start: 1.1, end: 1.6 });
  });

  it('survives the aligner fusing a respelling into one word', () => {
    const r = run('Use MongoDB today', [['Use', 0, 0.3], ['MongoDB', 0.35, 1.0], ['today', 1.1, 1.6]]);
    expect(r.words[2]).toMatchObject({ start: 1.1, end: 1.6 });
    expect(r.words[1].start).toBe(0.35);
  });

  it('interpolates a word the aligner missed and marks it estimated', () => {
    const r = run('one two three', [['one', 0, 0.5], ['three', 1.0, 1.5]]);
    expect(r.words[1].estimated).toBe(true);
    expect(r.words[1].start).toBeGreaterThanOrEqual(0.5);
    expect(r.words[1].end).toBeLessThanOrEqual(1.0);
    expect(r.words[0].estimated).toBe(false);
  });

  it('returns null rather than inventing timings when too little matched', () => {
    expect(run('alpha beta gamma delta', [['zzz', 0, 1], ['qqq', 1, 2]])).toBeNull();
    expect(run('alpha', [])).toBeNull();
  });

  it('never produces timings that go backwards', () => {
    const r = run('a b c d e', [['a', 0, 0.2], ['b', 0.2, 0.4], ['c', 0.4, 0.6], ['d', 0.6, 0.8], ['e', 0.8, 1.0]]);
    for (let i = 1; i < r.words.length; i++) expect(r.words[i].start).toBeGreaterThanOrEqual(r.words[i - 1].end - 1e-9);
  });

  it('carries the aligner confidence through', () => {
    const r = run('hi there', [['hi', 0, 0.3, 0.8], ['there', 0.4, 0.8, 0.6]]);
    expect(r.words.map((w) => w.confidence)).toEqual([0.8, 0.6]);
  });
});
