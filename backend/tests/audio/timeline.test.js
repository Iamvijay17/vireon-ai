const { buildSceneTimeline, buildDuckingEnvelope, volumeAt, estimateWords } = require('../../src/services/audio/pipeline/timeline');

const seg = (id, startMs, endMs, words) => ({
  id, startMs, endMs, internal: { wordMap: words.map((w, index) => ({ index, text: w })) },
});

describe('buildSceneTimeline', () => {
  it('offsets each segment words by its start in the scene track', () => {
    const segments = [seg('a', 0, 1000, ['Hi', 'there']), seg('b', 1500, 2500, ['Bye'])];
    const words = new Map([
      ['a', [{ word: 'Hi', start: 0, end: 0.4, confidence: 0.9, estimated: false }, { word: 'there', start: 0.5, end: 1, confidence: 0.9, estimated: false }]],
      ['b', [{ word: 'Bye', start: 0.1, end: 0.6, confidence: 0.8, estimated: false }]],
    ]);
    const t = buildSceneTimeline(segments, words);
    expect(t.captionTimestamps.map((w) => [w.word, w.start, w.end])).toEqual([['Hi', 0, 0.4], ['there', 0.5, 1], ['Bye', 1.6, 2.1]]);
    expect(t.speechRanges).toEqual([{ segmentId: 'a', startMs: 0, endMs: 1000 }, { segmentId: 'b', startMs: 1500, endMs: 2500 }]);
  });

  it('keeps timings inside each clip even if an aligner overshoots', () => {
    const segments = [seg('a', 0, 1000, ['x']), seg('b', 1200, 2000, ['y'])];
    const words = new Map([['a', [{ word: 'x', start: 0.5, end: 3, confidence: null, estimated: false }]], ['b', [{ word: 'y', start: 0, end: 0.5, confidence: null, estimated: false }]]]);
    const t = buildSceneTimeline(segments, words);
    expect(t.captionTimestamps[0].end).toBe(1);
    expect(t.captionTimestamps[1].start).toBeGreaterThanOrEqual(t.captionTimestamps[0].end);
  });

  it('is null when nothing was aligned - never an invented timeline', () => {
    expect(buildSceneTimeline([seg('a', 0, 1000, ['x'])], new Map()).captionTimestamps).toBeNull();
  });

  it('fills a missed segment with flagged estimates inside its own bounds', () => {
    const segments = [seg('a', 0, 1000, ['one']), seg('b', 1000, 2000, ['two', 'three'])];
    const words = new Map([['a', [{ word: 'one', start: 0, end: 0.9, confidence: 0.9, estimated: false }]]]);
    const t = buildSceneTimeline(segments, words);
    expect(t.captionTimestamps).toHaveLength(3);
    const filled = t.captionTimestamps.slice(1);
    expect(filled.every((w) => w.estimated && w.confidence === null)).toBe(true);
    expect(filled[0].start).toBeGreaterThanOrEqual(1);
    expect(filled[1].end).toBeLessThanOrEqual(2);
  });
});

describe('estimateWords', () => {
  it('splits time by word length', () => {
    const w = estimateWords(seg('a', 0, 1000, ['aa', 'bbbbbb']));
    expect(w[0].end).toBeCloseTo(0.25, 2);
    expect(w[1].end).toBe(1);
  });
});

describe('buildDuckingEnvelope', () => {
  const opts = { duckAmount: 0.6, attackMs: 100, releaseMs: 300 };

  it('dips for narration and recovers afterwards', () => {
    const env = buildDuckingEnvelope([{ startMs: 1000, endMs: 3000 }], opts);
    expect(volumeAt(env, 500)).toBe(1);
    expect(volumeAt(env, 2000)).toBeCloseTo(0.4);
    expect(volumeAt(env, 3300)).toBe(1);
  });

  it('ramps rather than jumping (attack before speech, release after)', () => {
    const env = buildDuckingEnvelope([{ startMs: 1000, endMs: 3000 }], opts);
    expect(volumeAt(env, 950)).toBeLessThan(1);
    expect(volumeAt(env, 950)).toBeGreaterThan(0.4);
    expect(volumeAt(env, 3150)).toBeGreaterThan(0.4);
    expect(volumeAt(env, 3150)).toBeLessThan(1);
  });

  it('keeps music ducked across short gaps between sentences instead of pumping', () => {
    const env = buildDuckingEnvelope([{ startMs: 1000, endMs: 2000 }, { startMs: 2200, endMs: 3000 }], opts);
    expect(volumeAt(env, 2100)).toBeCloseTo(0.4);
    // A long gap does let the music come back.
    const split = buildDuckingEnvelope([{ startMs: 1000, endMs: 2000 }, { startMs: 5000, endMs: 6000 }], opts);
    expect(volumeAt(split, 3500)).toBe(1);
  });

  it('handles speech starting at zero and an empty timeline', () => {
    const env = buildDuckingEnvelope([{ startMs: 0, endMs: 1000 }], opts);
    expect(volumeAt(env, 0)).toBeCloseTo(0.4);
    expect(volumeAt(buildDuckingEnvelope([], opts), 1234)).toBe(1);
  });

  it('keyframes are strictly ordered in time', () => {
    const env = buildDuckingEnvelope([{ startMs: 500, endMs: 900 }, { startMs: 2000, endMs: 4000 }], opts);
    for (let i = 1; i < env.length; i++) expect(env[i].ms).toBeGreaterThan(env[i - 1].ms);
  });
});
