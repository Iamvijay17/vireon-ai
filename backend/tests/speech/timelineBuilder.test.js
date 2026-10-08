jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), tts: jest.fn(), http: jest.fn(),
}));

const config = require('../../src/config');
const { buildAudioTimeline, buildPhrases, importanceOf, emphasisIndexes } = require('../../src/services/audio/pipeline/speech/timelineBuilder');
const { audioTimelineSchema, validateTimeline } = require('../../src/services/audio/pipeline/speech/schemas');

const FIXED = '2026-10-08T00:00:00.000Z';

const seg = (id, index, startMs, endMs, sourceText, extra = {}) => ({
  id, index, sourceText, startMs, endMs, speaker: 'narrator', voice: 'custom:Ryan', voiceProfile: null,
  instruction: { emotion: 'neutral', energy: 0.6, speed: 1, emphasis: [] }, pauseBeforeMs: 0, ...extra,
});

/** A measured-words alignment result: words spaced evenly inside the clip (seconds from the clip start). */
const aligned = (texts, { start = 0, wordSec = 0.3, gapSec = 0.05, status = 'complete', indexes } = {}) => {
  let t = start;
  const words = texts.map((text, i) => {
    const w = { index: indexes ? indexes[i] : i, text, start: +t.toFixed(3), end: +(t + wordSec).toFixed(3), confidence: 0.9 };
    t += wordSec + gapSec;
    return w;
  });
  return { status, provider: 'faster-whisper', version: 'v1', totalWords: texts.length, alignedWords: texts.length, matchedRatio: 1, words, reason: status === 'complete' ? null : 'partial-match' };
};

const build = (segments, alignments, durationMs = 10000) => buildAudioTimeline({
  sceneNumber: 3, segments, alignments: new Map(alignments), durationMs, provider: 'faster-whisper', version: 'v1', createdAt: FIXED,
});

const A = seg('s03-seg001', 0, 0, 2400, 'Artificial intelligence is changing the world.');
const B = seg('s03-seg002', 1, 3000, 5000, 'It starts now, truly.');
const alignA = () => aligned(['Artificial', 'intelligence', 'is', 'changing', 'the', 'world.'], { wordSec: 0.35 });
const alignB = () => aligned(['It', 'starts', 'now,', 'truly.'], { wordSec: 0.3 });

describe('buildAudioTimeline', () => {
  it('produces a schema-valid timeline in seconds, scene-relative', () => {
    const t = build([A, B], [[A.id, alignA()], [B.id, alignB()]]);
    expect(() => audioTimelineSchema.parse(t)).not.toThrow();
    expect(t).toMatchObject({ version: 1, sceneNumber: 3, alignmentStatus: 'complete', granularity: 'word', alignmentProvider: 'faster-whisper', alignmentVersion: 'v1', duration: 10, createdAt: FIXED });
    // The second segment's words are shifted by where its clip starts in the scene.
    const it = t.words.find((w) => w.text === 'It');
    expect(it.start).toBe(3);
    expect(it.wordId).toBe('s03-seg002-w001');
    expect(it.segmentId).toBe('s03-seg002');
    expect(validateTimeline(t)).toEqual([]);
  });

  it('gives every word the index CaptionRenderer uses (scene-wide caption index)', () => {
    const t = build([A, B], [[A.id, alignA()], [B.id, alignB()]]);
    expect(t.words.map((w) => w.captionIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(t.segments.map((s) => s.wordCount)).toEqual([6, 4]);
    expect(t.stats).toMatchObject({ wordCount: 10, alignedWordCount: 10, alignedRatio: 1 });
  });

  it('keeps segment fields: speaker, voice, confidence, direction (Voice Director metadata)', () => {
    const directed = seg('s03-seg001', 0, 0, 2400, A.sourceText, {
      speaker: 'host', voiceProfile: 'warm-guide',
      instruction: { emotion: 'excited', energy: 0.85, speed: 1.05, emphasis: ['intelligence'] },
    });
    const t = build([directed], [[directed.id, alignA()]]);
    expect(t.segments[0]).toMatchObject({
      speaker: 'host', voice: 'custom:Ryan', voiceProfile: 'warm-guide', confidence: 0.9, alignmentStatus: 'complete', granularity: 'word',
      direction: { emotion: 'excited', energy: 0.85, speed: 1.05, emphasis: ['intelligence'], importance: 'high' },
    });
  });

  it('flags emphasised words and phrases from the director, and carries importance to the phrase', () => {
    const directed = seg('s03-seg001', 0, 0, 2400, A.sourceText, { instruction: { energy: 0.5, emphasis: ['artificial intelligence'] } });
    const t = build([directed], [[directed.id, alignA()]]);
    expect(t.words.filter((w) => w.emphasis).map((w) => w.text)).toEqual(['Artificial', 'intelligence']);
    const emphasised = t.phrases.filter((p) => p.emphasis);
    expect(emphasised).toHaveLength(1);
    expect(emphasised[0].importance).toBe('high');
    expect(t.phrases.filter((p) => !p.emphasis).every((p) => p.importance === 'normal')).toBe(true);
  });

  describe('honesty: nothing is ever invented', () => {
    it('a segment the aligner failed on is timed by its real clip bounds only - no words', () => {
      const t = build([A, B], [[A.id, alignA()], [B.id, { status: 'failed', reason: 'no-timings-from-provider', words: [], totalWords: 4 }]]);
      const second = t.segments[1];
      expect(second).toMatchObject({ start: 3, end: 5, granularity: 'segment', alignmentStatus: 'failed', confidence: null });
      expect(t.words.filter((w) => w.segmentId === B.id)).toEqual([]);
      expect(t.phrases.filter((p) => p.segmentId === B.id)).toEqual([]);
      expect(t.alignmentStatus).toBe('partial');
      expect(t.granularity).toBe('mixed');
      expect(t.fallbackReasons).toEqual([{ segmentId: B.id, reason: 'no-timings-from-provider' }]);
      expect(validateTimeline(t)).toEqual([]);
    });

    it('nothing aligned at all -> status failed, segment-level only, still a usable timeline', () => {
      const t = build([A, B], []);
      expect(t.alignmentStatus).toBe('failed');
      expect(t.granularity).toBe('segment');
      expect(t.words).toEqual([]);
      expect(t.segments.map((s) => [s.start, s.end])).toEqual([[0, 2.4], [3, 5]]);
      expect(t.fallbackReasons.map((r) => r.reason)).toEqual(['not-aligned', 'not-aligned']);
      expect(t.stats.alignedRatio).toBe(0);
      expect(t.pauses.map((p) => p.kind)).toEqual(['segment']);
    });

    it('a partially aligned segment keeps only its measured words and says so', () => {
      const partial = aligned(['Artificial', 'is', 'the'], { indexes: [0, 2, 4], status: 'partial' });
      partial.totalWords = 6;
      const t = build([A], [[A.id, partial]]);
      expect(t.words.map((w) => w.text)).toEqual(['Artificial', 'is', 'the']);
      expect(t.words.map((w) => w.captionIndex)).toEqual([0, 2, 4]);
      expect(t.segments[0]).toMatchObject({ alignmentStatus: 'partial', granularity: 'word' });
      expect(t.alignmentStatus).toBe('partial');
      expect(t.stats).toMatchObject({ wordCount: 6, alignedWordCount: 3, alignedRatio: 0.5 });
    });

    it('does not report silence next to a word that was not measured as a pause', () => {
      // "is" (index 2) and "the" (index 4) are 1.5s apart, but "changing" (index 3) sits between them unmeasured.
      const sparse = aligned(['is', 'the'], { indexes: [2, 4], status: 'partial' });
      sparse.words[1] = { ...sparse.words[1], start: 1.8, end: 2.1 };
      const t = build([A], [[A.id, sparse]]);
      expect(t.pauses.filter((p) => p.kind === 'word')).toEqual([]);
    });
  });

  describe('timing invariants', () => {
    it('start < end, duration = end - start, everything inside the audio', () => {
      const t = build([A, B], [[A.id, alignA()], [B.id, alignB()]]);
      for (const item of [...t.words, ...t.phrases, ...t.pauses]) {
        expect(item.start).toBeLessThan(item.end);
        expect(item.duration).toBeCloseTo(item.end - item.start, 3);
        expect(item.start).toBeGreaterThanOrEqual(0);
        expect(item.end).toBeLessThanOrEqual(t.duration);
      }
      for (const s of t.segments) expect(s.duration).toBeCloseTo(s.end - s.start, 3);
    });

    it('clamps an aligner that overshoots its clip, dropping words that fall entirely outside it', () => {
      const overshoot = aligned(['one', 'two', 'three'], { wordSec: 1 }); // 0-1, 1.05-2.05, 2.1-3.1 but the clip is 2s long
      const clip = seg('s03-seg001', 0, 0, 2000, 'one two three');
      const t = build([clip], [[clip.id, overshoot]]);
      expect(t.words.every((w) => w.end <= 2)).toBe(true);
      expect(t.words.map((w) => w.text)).toEqual(['one', 'two']);
      expect(validateTimeline(t)).toEqual([]);
    });

    it('clamps to the audio duration even if a segment claims to run past it', () => {
      const clip = seg('s03-seg001', 0, 0, 4000, 'one two');
      const t = build([clip], [[clip.id, aligned(['one', 'two'], { wordSec: 1.4 })]], 2000);
      expect(t.duration).toBe(2);
      expect(validateTimeline(t)).toEqual([]);
    });

    it('drops a word that starts before the previous one rather than reordering', () => {
      const a = aligned(['one', 'two', 'three']);
      a.words[2] = { ...a.words[2], start: 0.1, end: 0.2 };
      const t = build([seg('s03-seg001', 0, 0, 3000, 'one two three')], [['s03-seg001', a]]);
      expect(t.words.map((w) => w.text)).toEqual(['one', 'two']);
      expect(validateTimeline(t)).toEqual([]);
    });

    it('validateTimeline catches a corrupt timeline', () => {
      const t = build([A], [[A.id, alignA()]]);
      const broken = JSON.parse(JSON.stringify(t));
      broken.words[1].end = broken.words[1].start; // zero length
      broken.words[2].duration = 9; // wrong duration
      broken.words[3].end = 99; // outside the audio
      const issues = validateTimeline(broken);
      expect(issues.length).toBeGreaterThanOrEqual(3);
      expect(issues.join('\n')).toMatch(/not before end/);
      expect(issues.join('\n')).toMatch(/duration/);
      expect(issues.join('\n')).toMatch(/outside the audio/);
    });
  });

  describe('pauses', () => {
    it('reports the silence between segments and long gaps inside a segment, with durations', () => {
      const withGap = aligned(['It', 'starts', 'now,', 'truly.'], { wordSec: 0.3, gapSec: 0.05 });
      withGap.words[3] = { ...withGap.words[3], start: 1.4, end: 1.8 }; // 0.4s of silence before "truly."
      const t = build([A, B], [[A.id, alignA()], [B.id, withGap]]);
      expect(t.pauses).toHaveLength(2);
      expect(t.pauses[0]).toMatchObject({ pauseId: 'pause-001', kind: 'segment', start: 2.4, end: 3, duration: 0.6, afterId: A.id, beforeId: B.id });
      expect(t.pauses[1]).toMatchObject({ pauseId: 'pause-002', kind: 'word', start: 4, end: 4.4, duration: 0.4 });
      expect(t.pauses[1].afterId).toBe('s03-seg002-w003');
      expect(t.pauses[1].beforeId).toBe('s03-seg002-w004');
    });

    it('ignores gaps shorter than the configured minimum (a comma is not a pause)', () => {
      const t = build([A], [[A.id, alignA()]]);
      expect(t.pauses).toEqual([]); // 50ms gaps between words
      const old = config.speech.minPauseMs;
      config.speech.minPauseMs = 40;
      try {
        expect(build([A], [[A.id, alignA()]]).pauses.length).toBeGreaterThan(0);
      } finally {
        config.speech.minPauseMs = old;
      }
    });

    it('orders pauses by time and numbers them', () => {
      const words = aligned(['one', 'two', 'three'], { wordSec: 0.2, gapSec: 0.6 });
      const t = build([seg('s03-seg001', 0, 0, 2400, 'one two three'), seg('s03-seg002', 1, 3000, 4000, 'x')], [['s03-seg001', words]]);
      const starts = t.pauses.map((p) => p.start);
      expect([...starts].sort((a, b) => a - b)).toEqual(starts);
      expect(t.pauses.map((p) => p.pauseId)).toEqual(starts.map((_, i) => `pause-${String(i + 1).padStart(3, '0')}`));
    });
  });

  describe('phrases', () => {
    it('splits at punctuation', () => {
      const t = build([B], [[B.id, alignB()]]);
      expect(t.phrases.map((p) => p.text)).toEqual(['It starts now,', 'truly.']);
    });

    it('splits at a real silence inside a sentence', () => {
      const a = aligned(['alpha', 'beta', 'gamma', 'delta']);
      a.words[2] = { ...a.words[2], start: a.words[1].end + 0.3, end: a.words[1].end + 0.6 };
      a.words[3] = { ...a.words[3], start: a.words[2].end + 0.05, end: a.words[2].end + 0.35 };
      const t = build([seg('s03-seg001', 0, 0, 4000, 'alpha beta gamma delta')], [['s03-seg001', a]]);
      expect(t.phrases.map((p) => p.text)).toEqual(['alpha beta', 'gamma delta']);
    });

    it('caps phrase length', () => {
      const texts = Array.from({ length: 20 }, (_, i) => `w${i}`);
      const t = build([seg('s03-seg001', 0, 0, 10000, texts.join(' '))], [['s03-seg001', aligned(texts, { wordSec: 0.2, gapSec: 0.02 })]]);
      expect(Math.max(...t.phrases.map((p) => p.wordCount))).toBeLessThanOrEqual(config.speech.maxPhraseWords);
      expect(t.phrases.reduce((n, p) => n + p.wordCount, 0)).toBe(20);
    });

    it('phrases tile the words exactly, in order, with ids', () => {
      const t = build([A, B], [[A.id, alignA()], [B.id, alignB()]]);
      const fromPhrases = t.phrases.flatMap((p) => {
        const from = t.words.findIndex((w) => w.wordId === p.firstWordId);
        const to = t.words.findIndex((w) => w.wordId === p.lastWordId);
        return t.words.slice(from, to + 1).map((w) => w.wordId);
      });
      expect(fromPhrases).toEqual(t.words.map((w) => w.wordId));
      expect(new Set(t.phrases.map((p) => p.phraseId)).size).toBe(t.phrases.length);
    });

    it('buildPhrases is empty for no words', () => {
      expect(buildPhrases('s', [], { phraseGapSec: 0.2, maxPhraseWords: 8, importance: 'normal' })).toEqual([]);
    });
  });

  describe('Voice Director metadata', () => {
    it('importance: emphasis, high energy, or a deliberate beat before the line', () => {
      expect(importanceOf({ instruction: { energy: 0.5, emphasis: [] }, pauseBeforeMs: 0 })).toBe('normal');
      expect(importanceOf({ instruction: { energy: 0.5, emphasis: ['word'] }, pauseBeforeMs: 0 })).toBe('high');
      expect(importanceOf({ instruction: { energy: 0.9, emphasis: [] }, pauseBeforeMs: 0 })).toBe('high');
      expect(importanceOf({ instruction: { energy: 0.5, emphasis: [] }, pauseBeforeMs: config.audio.pauses.sentence * 1.6 })).toBe('high');
      expect(importanceOf({})).toBe('normal');
    });

    it('emphasis terms match whole words and multi-word terms, ignoring case and punctuation', () => {
      const words = ['The', 'Real', 'secret,', 'really.'].map((text, index) => ({ index, text }));
      expect([...emphasisIndexes(words, ['real'])]).toEqual([1]);
      expect([...emphasisIndexes(words, ['real secret'])].sort()).toEqual([1, 2]);
      expect([...emphasisIndexes(words, ['rea'])]).toEqual([]);
      expect([...emphasisIndexes(words, [])]).toEqual([]);
    });
  });
});
