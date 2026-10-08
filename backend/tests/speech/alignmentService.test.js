jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), tts: jest.fn(), http: jest.fn(),
}));

const mockAlign = { heard: [], calls: [] };
jest.mock('../../src/services/audio/pipeline/alignment', () => ({
  alignBatch: jest.fn(async (files, opts) => {
    mockAlign.calls.push({ files, opts });
    return files.map((_, i) => mockAlign.heard[i] ?? null);
  }),
  getProvider: jest.fn(() => ({ name: 'faster-whisper' })),
  getAlignmentVersion: jest.fn(() => 'fake-aligner:1'),
}));

const config = require('../../src/config');
const alignment = require('../../src/services/audio/pipeline/alignment');
const { alignAudio, alignClips, normalizeAlignment, getAlignmentVersion, isCurrentAlignment, MAPPER_VERSION } = require('../../src/services/audio/pipeline/speech/alignmentService');
const { processText, spokenTokens } = require('../../src/services/audio/pipeline/pronunciation');

/**
 * The aligner is faked, but everything around it is real: the pronunciation
 * engine (so "Node.js" really is spoken as "Node JS"), the heard-words ->
 * caption-words mapper and the status rules. `hear()` plays a perfect
 * recogniser reading the spoken text back at a steady pace, optionally with
 * silences and missed words.
 */
function hear(spokenText, { wordMs = 300, gapMs = 40, silences = {}, drop = [] } = {}) {
  const tokens = spokenTokens(spokenText);
  let t = 0;
  const heard = [];
  tokens.forEach((tok, i) => {
    t += (silences[i] || 0) / 1000;
    const start = t;
    t += wordMs / 1000;
    if (!drop.includes(i)) heard.push({ word: tok.text.replace(/[.,!?;:]+$/, ''), start: +start.toFixed(3), end: +t.toFixed(3), probability: 0.93 });
    t += gapMs / 1000;
  });
  return { heard, durationSec: +t.toFixed(3) };
}

function clipFor(text, hearOptions) {
  const p = processText(text);
  const { heard, durationSec } = hear(p.spokenText, hearOptions);
  return { clip: { text, spokenText: p.spokenText, spokenTokens: spokenTokens(p.spokenText), wordMap: p.wordMap, durationSec }, heard };
}

function check(result) {
  // The invariants every consumer relies on.
  let prevStart = -1;
  for (const w of result.words) {
    expect(w.start).toBeLessThan(w.end);
    expect(w.start).toBeGreaterThanOrEqual(prevStart);
    prevStart = w.start;
  }
}

beforeEach(() => {
  mockAlign.heard = [];
  mockAlign.calls.length = 0;
  config.speech.completeRatio = 0.9;
});

describe('normalizeAlignment: real sentences', () => {
  it.each([
    ['a normal sentence', 'Artificial intelligence is changing the world.'],
    ['punctuation', 'Wait, what? Yes — really! (Seriously.)'],
    ['a short sentence', 'Hello.'],
    ['a single word with no punctuation', 'Stop'],
    ['repeated words', 'Go go go, and then go again and again.'],
    ['a long sentence', 'When the pipeline finishes each stage in order the renderer receives one description of the narration and every caption, animation and transition reads that same description so nothing can drift apart.'],
  ])('times every caption word of %s', (_name, text) => {
    const { clip, heard } = clipFor(text);
    const r = normalizeAlignment(heard, clip);
    expect(r.status).toBe('complete');
    expect(r.alignedWords).toBeGreaterThanOrEqual(r.totalWords - 1);
    // A bare "—" has no spoken form: it gets no timing and does not count against completeness.
    expect(r.words.map((w) => w.text)).toEqual(text.match(/\S+/g).filter((t) => /[\p{L}\p{N}]/u.test(t)));
    expect(r.reason).toBeNull();
    check(r);
  });

  it('keeps the caption words (not the respelled spoken ones) for technical terms and abbreviations', () => {
    const text = 'We built the API with Node.js and MongoDB, e.g. for the CLI.';
    const p = processText(text);
    expect(p.spokenText).not.toBe(text); // the pronunciation engine really rewrote something
    const { clip, heard } = clipFor(text);
    const r = normalizeAlignment(heard, clip);
    expect(r.status).toBe('complete');
    expect(r.words.map((w) => w.text)).toEqual(text.match(/\S+/g));
    check(r);
  });

  it('handles numbers that are spoken as several words', () => {
    const text = 'Version 3.5 shipped in 2024 for 1,000 users.';
    const { clip, heard } = clipFor(text);
    const r = normalizeAlignment(heard, clip);
    expect(r.totalWords).toBe(8);
    expect(r.alignedWords).toBeGreaterThanOrEqual(7);
    expect(['complete', 'partial']).toContain(r.status);
    check(r);
  });

  it('preserves real silences: a pause before a word shows up as a gap between its neighbours', () => {
    const text = 'First point and then the second point.';
    const { clip, heard } = clipFor(text, { silences: { 4: 700 } });
    const r = normalizeAlignment(heard, clip);
    const gaps = r.words.slice(1).map((w, i) => w.start - r.words[i].end);
    expect(Math.max(...gaps)).toBeGreaterThanOrEqual(0.69);
    expect(gaps.filter((g) => g > 0.5)).toHaveLength(1);
  });

  it('reports confidence from the aligner, never invents one', () => {
    const { clip, heard } = clipFor('One two three.');
    const withConfidence = normalizeAlignment(heard, clip);
    expect(withConfidence.words.every((w) => w.confidence === 0.93)).toBe(true);
    const withoutConfidence = normalizeAlignment(heard.map(({ probability: _probability, ...w }) => w), clip);
    expect(withoutConfidence.words.every((w) => w.confidence === null)).toBe(true);
  });
});

describe('normalizeAlignment: never fakes a timestamp', () => {
  it('is "partial" when the aligner missed words, and omits those words instead of estimating them', () => {
    const text = 'The quick brown fox jumps over the lazy dog today.';
    const { clip, heard } = clipFor(text, { drop: [3, 4, 5] });
    const r = normalizeAlignment(heard, clip);
    expect(r.status).toBe('partial');
    expect(r.alignedWords).toBeLessThan(r.totalWords);
    expect(r.words.map((w) => w.text)).not.toContain('fox');
    expect(r.words.map((w) => w.text)).not.toContain('jumps');
    expect(r.reason).toBe('partial-match');
    // The legacy caption shape still flags the words it had to interpolate.
    expect(r.captionWords.filter((w) => w.estimated).length).toBeGreaterThan(0);
    check(r);
  });

  it('is "failed" with a reason when the aligner returns nothing', () => {
    const { clip } = clipFor('Nothing was heard here.');
    for (const none of [null, []]) {
      const r = normalizeAlignment(none, clip);
      expect(r.status).toBe('failed');
      expect(r.words).toEqual([]);
      expect(r.reason).toBe('no-timings-from-provider');
    }
  });

  it('is "failed" when too little of the audio matches the text to trust any of it', () => {
    const { clip } = clipFor('Completely different words were actually spoken here.');
    const wrong = [{ word: 'banana', start: 0, end: 0.4, probability: 0.9 }, { word: 'orange', start: 0.5, end: 0.9, probability: 0.9 }];
    const r = normalizeAlignment(wrong, clip);
    expect(r.status).toBe('failed');
    expect(r.reason).toBe('low-match');
    expect(r.words).toEqual([]);
  });

  it('never divides the duration evenly across words: unmeasured words get no time at all', () => {
    const { clip, heard } = clipFor('Alpha beta gamma delta epsilon zeta eta theta iota kappa.', { drop: [4, 5, 6] });
    const r = normalizeAlignment(heard, clip);
    expect(r.words).toHaveLength(7);
    // Measured words keep the aligner's own durations, not an average.
    r.words.forEach((w) => expect(w.end - w.start).toBeCloseTo(0.3, 2));
  });

  it('drops timings that are impossible instead of repairing them', () => {
    const { clip, heard } = clipFor('One two three four.');
    const broken = heard.map((w, i) => (i === 1 ? { ...w, end: w.start } : w)); // zero-length word
    const r = normalizeAlignment(broken, clip);
    expect(r.words.map((w) => w.text)).not.toContain('two');
    check(r);
  });

  it('keeps every timestamp inside the audio, dropping a word that starts after the clip ends', () => {
    const { clip, heard } = clipFor('One two three four five six.');
    const r = normalizeAlignment(heard, { ...clip, durationSec: 1.0 });
    for (const w of r.words) {
      expect(w.start).toBeGreaterThanOrEqual(0);
      expect(w.end).toBeLessThanOrEqual(1.0);
    }
    expect(r.words.length).toBeLessThan(6);
  });

  it('applies the configured completeness threshold', () => {
    const { clip, heard } = clipFor('One two three four five six seven eight nine ten.', { drop: [9] });
    config.speech.completeRatio = 0.9;
    expect(normalizeAlignment(heard, clip).status).toBe('complete');
    config.speech.completeRatio = 1;
    expect(normalizeAlignment(heard, clip).status).toBe('partial');
  });

  it('reports a clip with no words as failed', () => {
    expect(normalizeAlignment([{ word: 'x', start: 0, end: 1 }], { text: '', wordMap: [] }).status).toBe('failed');
  });
});

describe('SpeechAlignmentService', () => {
  it('aligns a clip through the provider, passing language and a vocabulary hint', async () => {
    const { clip, heard } = clipFor('Kubernetes schedules containers.');
    mockAlign.heard = [heard];
    const r = await alignAudio({ audioPath: 'a.wav', text: clip.text, language: 'english', options: { spokenText: clip.spokenText, spokenTokens: clip.spokenTokens, wordMap: clip.wordMap, durationSec: clip.durationSec } });
    expect(r.status).toBe('complete');
    expect(r.provider).toBe('faster-whisper');
    expect(r.version).toBe(`fake-aligner:1/m${MAPPER_VERSION}`);
    expect(mockAlign.calls[0].files).toEqual(['a.wav']);
    expect(mockAlign.calls[0].opts.languages).toEqual(['english']);
    expect(mockAlign.calls[0].opts.prompts).toEqual(['Kubernetes schedules containers.']);
  });

  it('aligns several clips in ONE provider call (the model loads once), results in order', async () => {
    const a = clipFor('First clip here.');
    const b = clipFor('Second clip, a bit longer than that.');
    mockAlign.heard = [a.heard, b.heard];
    const results = await alignClips([{ audioPath: 'a.wav', ...a.clip }, { audioPath: 'b.wav', ...b.clip }]);
    expect(mockAlign.calls).toHaveLength(1);
    expect(results.map((r) => r.totalWords)).toEqual([3, 7]);
    expect(results.every((r) => r.status === 'complete')).toBe(true);
  });

  it('a clip the provider could not time fails alone, without failing its neighbours', async () => {
    const a = clipFor('This one works fine.');
    const b = clipFor('This one does not.');
    mockAlign.heard = [a.heard, null];
    const [ra, rb] = await alignClips([{ audioPath: 'a.wav', ...a.clip }, { audioPath: 'b.wav', ...b.clip }]);
    expect(ra.status).toBe('complete');
    expect(rb.status).toBe('failed');
  });

  it('plain text works without any pronunciation data (identity word map)', async () => {
    const heard = hear('Just plain words').heard;
    mockAlign.heard = [heard];
    const r = await alignAudio({ audioPath: 'a.wav', text: 'Just plain words', language: 'auto' });
    expect(r.status).toBe('complete');
    expect(r.words).toHaveLength(3);
  });

  it('with provider "none" nothing is invented: every clip fails with an explicit reason', async () => {
    alignment.getProvider.mockReturnValue({ name: 'none' });
    try {
      const [r] = await alignClips([{ audioPath: 'a.wav', text: 'Some text here.' }]);
      expect(r.status).toBe('failed');
      expect(r.reason).toBe('alignment-disabled');
      expect(r.words).toEqual([]);
      expect(alignment.alignBatch).not.toHaveBeenCalled();
    } finally {
      alignment.getProvider.mockReturnValue({ name: 'faster-whisper' });
    }
  });

  it('propagates cancellation (an abort is not an alignment failure)', async () => {
    alignment.alignBatch.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    await expect(alignClips([{ audioPath: 'a.wav', text: 'x y' }])).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('versions: stored alignment is current only if provider+model+mapper version match and it carries timings', () => {
    expect(getAlignmentVersion()).toBe(`fake-aligner:1/m${MAPPER_VERSION}`);
    const ok = { version: getAlignmentVersion(), status: 'complete' };
    expect(isCurrentAlignment(ok)).toBe(true);
    expect(isCurrentAlignment({ ...ok, status: 'partial' })).toBe(true);
    expect(isCurrentAlignment({ ...ok, status: 'failed' })).toBe(false);
    expect(isCurrentAlignment({ ...ok, version: 'old-aligner:0/m1' })).toBe(false);
    expect(isCurrentAlignment({ status: 'complete' })).toBe(false);
    expect(isCurrentAlignment(null)).toBe(false);
  });
});
