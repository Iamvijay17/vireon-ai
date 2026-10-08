jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), tts: jest.fn(), http: jest.fn(),
}));

const fs = require('fs');
const os = require('os');
const path = require('path');

// ---- in-memory stand-ins for the GPU, the cache and the aligner -------------
const mockCacheStore = new Map(); // `${kind}:${hash}` -> { bytes, meta }
const mockSynth = { calls: [] };
const mockAlign = { calls: [], words: new Map(), version: 'fake-aligner:1' };

jest.mock('../../src/services/common/CacheService', () => {
  const fsMod = require('fs');
  return {
    getSegmentAudio: jest.fn(async (kind, hash, dest) => {
      const hit = mockCacheStore.get(`${kind}:${hash}`);
      if (!hit) return null;
      fsMod.writeFileSync(dest, hit.bytes);
      return JSON.parse(JSON.stringify(hit.meta));
    }),
    putSegmentAudio: jest.fn(async (kind, hash, file, meta) => {
      mockCacheStore.set(`${kind}:${hash}`, { bytes: fsMod.readFileSync(file), meta: JSON.parse(JSON.stringify(meta)) });
      return true;
    }),
    putSegmentMeta: jest.fn(async (kind, hash, meta) => {
      const hit = mockCacheStore.get(`${kind}:${hash}`);
      if (hit) hit.meta = JSON.parse(JSON.stringify(meta));
      return true;
    }),
  };
});
jest.mock('../../src/services/common/MetricsService', () => ({ increment: jest.fn(), recordDuration: jest.fn() }));
jest.mock('../../src/services/storage/providers', () => ({ getStorageProvider: () => ({ uploadFile: jest.fn(async () => 'http://storage/x') }) }));
jest.mock('../../src/services/audio/pipeline/rawSynthesis', () => {
  const fsMod = require('fs');
  const { buildWavBuffer: build } = require('../../src/utils/wavAudio');
  return {
    synthesizeRaw: jest.fn(async ({ spokenText, outputPath }) => {
      mockSynth.calls.push(require('path').basename(outputPath).replace('.raw.wav', ''));
      const ms = 400 + spokenText.length * 10;
      const samples = Math.round((24000 * ms) / 1000);
      const data = Buffer.alloc(samples * 2);
      for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(6000 * Math.sin((2 * Math.PI * 200 * i) / 24000)), i * 2);
      fsMod.writeFileSync(outputPath, build({ audioFormat: 1, channels: 1, sampleRate: 24000, byteRate: 48000, blockAlign: 2, bitsPerSample: 16 }, data));
      return { path: outputPath, attempts: 1, generationMs: 5 };
    }),
  };
});
jest.mock('../../src/services/audio/pipeline/alignment', () => ({
  alignBatch: jest.fn(async (files) => {
    mockAlign.calls.push(files.map((f) => require('path').basename(f)));
    return files.map((f) => mockAlign.words.get(require('path').basename(f).replace('.wav', '')) || null);
  }),
  getProvider: () => ({ name: 'faster-whisper' }),
  getAlignmentVersion: () => mockAlign.version,
}));

const config = require('../../src/config');
const { planScene } = require('../../src/services/audio/pipeline/segmentPlanner');
const { synthesizeScene } = require('../../src/services/audio/pipeline/segmentSynthesis');
const { assertAlignmentSatisfied, SpeechAlignmentRequiredError } = require('../../src/services/audio/pipeline/batch');
const { MAPPER_VERSION } = require('../../src/services/audio/pipeline/speech/alignmentService');
const { validateTimeline, audioTimelineSchema } = require('../../src/services/audio/pipeline/speech/schemas');
const { toRenderSpeech, toRenderSpeechTiming } = require('../../src/services/audio/pipeline/speech/renderProps');

const TEXT = [
  'We built the backend with Node.js and MongoDB for storage.',
  'Queues are handled by BullMQ, which keeps the work orderly.',
  'Finally, the whole pipeline is rendered with Remotion.',
].join('\n\n');

let dir;
let flags;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireon-speech-'));
  flags = { ...config.speech };
});
afterAll(() => {
  Object.assign(config.speech, flags);
  fs.rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  mockCacheStore.clear();
  mockSynth.calls.length = 0;
  mockAlign.calls.length = 0;
  mockAlign.words.clear();
  mockAlign.version = 'fake-aligner:1';
  Object.assign(config.speech, flags, { alignmentEnabled: true });
  jest.clearAllMocks();
});

/** Plan the scene and prime the fake aligner with a perfect "hearing" of each segment's spoken text. */
async function plan({ skipAlign = [] } = {}) {
  const p = await planScene({ text: TEXT, sceneNumber: 2, voice: 'custom:Ryan' });
  p.segments.forEach((seg) => {
    if (skipAlign.includes(seg.id)) return;
    let t = 0.05;
    mockAlign.words.set(seg.id, seg.internal.spokenTokens.map((tok) => {
      const w = { word: tok.text.replace(/[.,]+$/, ''), start: +t.toFixed(3), end: +(t + 0.05).toFixed(3), probability: 0.9 };
      t += 0.07;
      return w;
    }));
  });
  return p;
}

const run = (p, extra = {}) => synthesizeScene({
  jobId: 'job-TEST', sceneNumber: 2, plan: p, workDir: path.join(dir, `w-${Math.random()}`), outputPath: path.join(dir, `scene-${Math.random()}.wav`), ...extra,
});

describe('speech timeline from the segmented pipeline', () => {
  it('builds a valid canonical timeline from real segment bounds and measured words', async () => {
    const r = await run(await plan());
    const t = r.speechTimeline;
    expect(() => audioTimelineSchema.parse(t)).not.toThrow();
    expect(validateTimeline(t)).toEqual([]);
    expect(t).toMatchObject({ alignmentStatus: 'complete', granularity: 'word', alignmentProvider: 'faster-whisper', alignmentVersion: `fake-aligner:1/m${MAPPER_VERSION}`, sceneNumber: 2 });
    expect(t.segments).toHaveLength(3);
    // Segment bounds are the assembled clip bounds - the same numbers the pipeline reports.
    r.segments.forEach((s, i) => {
      expect(t.segments[i].start).toBeCloseTo(s.startMs / 1000, 3);
      expect(t.segments[i].end).toBeCloseTo(s.endMs / 1000, 3);
    });
    expect(t.duration).toBeCloseTo(r.durationMs / 1000, 3);
    // Every caption word of the original text has a timestamp, in order.
    expect(t.words.map((w) => w.text)).toEqual(TEXT.match(/\S+/g));
    expect(t.words.map((w) => w.captionIndex)).toEqual(t.words.map((_, i) => i));
    expect(t.phrases.length).toBeGreaterThan(3);
    expect(t.pauses.some((p) => p.kind === 'segment')).toBe(true);
  });

  it('uses the same word timings for the legacy captionTimestamps (one timing source)', async () => {
    const r = await run(await plan());
    const fromTimeline = r.speechTimeline.words.map((w) => [w.text, w.start, w.end]);
    const fromCaptions = r.captionTimestamps.map((w) => [w.word, w.start, w.end]);
    expect(fromTimeline).toEqual(fromCaptions);
  });

  it('is not built when speech alignment is off: Vireon behaves exactly as before', async () => {
    config.speech.alignmentEnabled = false;
    const r = await run(await plan());
    expect(r.speechTimeline).toBeNull();
    expect(r.captionTimestamps).toHaveLength(TEXT.match(/\S+/g).length); // legacy captions still work
  });

  it('reuses cached alignment: a repeat run neither synthesizes nor aligns, and yields identical word timings', async () => {
    const first = await run(await plan());
    expect(mockAlign.calls).toHaveLength(1);
    mockAlign.calls.length = 0;
    mockSynth.calls.length = 0;

    const second = await run(await plan());
    expect(mockSynth.calls).toEqual([]);
    expect(mockAlign.calls).toEqual([]);
    expect(second.stats.alignmentCacheHits).toBe(3);
    expect(second.speechTimeline.words).toEqual(first.speechTimeline.words);
    expect(second.speechTimeline.phrases).toEqual(first.speechTimeline.phrases);
  });

  it('a new alignment version invalidates stored alignment, but not the audio', async () => {
    await run(await plan());
    mockAlign.calls.length = 0;
    mockSynth.calls.length = 0;

    mockAlign.version = 'fake-aligner:2'; // e.g. a different model or driver
    const r = await run(await plan());
    expect(mockSynth.calls).toEqual([]); // audio untouched
    expect(mockAlign.calls).toHaveLength(1); // alignment redone, one batch
    expect(mockAlign.calls[0]).toHaveLength(3);
    expect(r.stats.alignmentCacheHits).toBe(0);
    expect(r.speechTimeline.alignmentVersion).toBe(`fake-aligner:2/m${MAPPER_VERSION}`);

    // ...and the cache entry was upgraded in place, so the next run is cached again.
    mockAlign.calls.length = 0;
    const again = await run(await plan());
    expect(mockAlign.calls).toEqual([]);
    expect(again.stats.alignmentCacheHits).toBe(3);
  });

  it('cache entries written before alignment versioning are re-aligned, not trusted', async () => {
    await run(await plan());
    for (const entry of mockCacheStore.values()) {
      if (entry.meta.alignment) delete entry.meta.alignment; // as an old cache entry would look
    }
    mockAlign.calls.length = 0;
    const r = await run(await plan());
    expect(mockAlign.calls).toHaveLength(1);
    expect(r.speechTimeline.alignmentStatus).toBe('complete');
  });

  it('only the clips that lack current alignment are re-aligned', async () => {
    const p1 = await plan();
    await run(p1);
    const victim = [...mockCacheStore.values()].find((e) => e.meta.alignment);
    delete victim.meta.alignment;
    mockAlign.calls.length = 0;
    await run(await plan());
    expect(mockAlign.calls[0]).toHaveLength(1);
  });

  describe('fallback when alignment fails', () => {
    it('the audio stays valid and the scene falls back to segment-level timing', async () => {
      const r = await run(await plan({ skipAlign: ['s02-seg001', 's02-seg002', 's02-seg003'] }));
      expect(r.durationMs).toBeGreaterThan(0);
      expect(fs.existsSync(r.path)).toBe(true);
      const t = r.speechTimeline;
      expect(t).toMatchObject({ alignmentStatus: 'failed', granularity: 'segment', words: [], phrases: [] });
      expect(t.segments).toHaveLength(3);
      expect(t.segments.every((s) => s.granularity === 'segment' && s.end > s.start)).toBe(true);
      expect(t.fallbackReasons).toHaveLength(3);
      expect(r.captionTimestamps).toBeNull(); // captions use their estimated pace, as before
      expect(validateTimeline(t)).toEqual([]);
    });

    it('a single failed segment degrades only that segment', async () => {
      const r = await run(await plan({ skipAlign: ['s02-seg002'] }));
      const t = r.speechTimeline;
      expect(t.alignmentStatus).toBe('partial');
      expect(t.granularity).toBe('mixed');
      expect(t.segments.map((s) => s.granularity)).toEqual(['word', 'segment', 'word']);
      expect(t.words.some((w) => w.segmentId === 's02-seg002')).toBe(false);
      expect(t.fallbackReasons).toEqual([{ segmentId: 's02-seg002', reason: expect.any(String) }]);
      // The caption word indexes of the third segment still line up with the transcript.
      const third = t.words.find((w) => w.segmentId === 's02-seg003');
      const firstOfThird = t.segments[0].wordCount + t.segments[1].wordCount;
      expect(third.captionIndex).toBe(firstOfThird);
    });

    it('a failed alignment is not cached, so the next run tries again', async () => {
      await run(await plan({ skipAlign: ['s02-seg002'] }));
      mockAlign.calls.length = 0;
      const r = await run(await plan());
      expect(mockAlign.calls[0]).toEqual(['s02-seg002.wav']);
      expect(r.speechTimeline.alignmentStatus).toBe('complete');
    });
  });

  it('records alignment cost for analytics', async () => {
    const r = await run(await plan());
    expect(r.stats.alignmentMs).toBeGreaterThanOrEqual(0);
    expect(r.stats.timelineMs).toBeGreaterThanOrEqual(0);
  });
});

describe('alignment required mode', () => {
  const timeline = (alignmentStatus) => ({ alignmentStatus, fallbackReasons: [{ segmentId: 's', reason: 'low-match' }] });

  it('is lenient by default: a weak alignment never fails the scene', () => {
    config.speech.alignmentRequired = false;
    expect(() => assertAlignmentSatisfied(1, timeline('failed'))).not.toThrow();
    expect(() => assertAlignmentSatisfied(1, timeline('partial'))).not.toThrow();
  });

  it('fails the scene only when required and not fully aligned', () => {
    config.speech.alignmentRequired = true;
    expect(() => assertAlignmentSatisfied(4, timeline('complete'))).not.toThrow();
    expect(() => assertAlignmentSatisfied(4, null)).not.toThrow(); // alignment not attempted (flag off)
    expect(() => assertAlignmentSatisfied(4, timeline('partial'))).toThrow(SpeechAlignmentRequiredError);
    expect(() => assertAlignmentSatisfied(4, timeline('failed'))).toThrow(/scene 4.*low-match/);
  });
});

describe('render props follow the feature flags', () => {
  const stored = {
    speechTimeline: {
      version: 1, alignmentStatus: 'complete', granularity: 'word', duration: 4, createdAt: 'x', stats: {}, fallbackReasons: [],
      segments: [{ segmentId: 's1', start: 0, end: 4 }], words: [{ wordId: 'w1', start: 0, end: 1, text: 'hi' }], phrases: [], pauses: [],
    },
  };

  it('off: nothing is handed to the renderer, so render props are unchanged', () => {
    config.speech.drivenAnimationEnabled = false;
    expect(toRenderSpeech(stored)).toBeNull();
    expect(toRenderSpeechTiming({ speechTiming: { timingMode: 'speech', trigger: 'speechStart' } })).toBeNull();
  });

  it('on: the compact canonical timeline goes to Remotion, without bookkeeping fields', () => {
    config.speech.drivenAnimationEnabled = true;
    const speech = toRenderSpeech(stored);
    expect(speech.words).toHaveLength(1);
    expect(speech).not.toHaveProperty('createdAt');
    expect(speech).not.toHaveProperty('stats');
    expect(speech).not.toHaveProperty('fallbackReasons');
  });

  it('on, but a scene without a timeline (legacy audio) gets nothing', () => {
    config.speech.drivenAnimationEnabled = true;
    expect(toRenderSpeech({})).toBeNull();
    expect(toRenderSpeech({ speechTimeline: { segments: [] } })).toBeNull();
    expect(toRenderSpeech(undefined)).toBeNull();
  });

  it('validates a scene speech timing config; unknown or invalid configs are ignored, never rendered', () => {
    config.speech.drivenAnimationEnabled = true;
    const ok = toRenderSpeechTiming({ speechTiming: { timingMode: 'speech', trigger: 'phrase', phrase: 'artificial intelligence', animation: 'scaleIn' } });
    expect(ok).toMatchObject({ timingMode: 'speech', trigger: 'phrase', phrase: 'artificial intelligence', animation: 'scaleIn', target: 'title', offset: 0 });
    expect(toRenderSpeechTiming({ speechTiming: { timingMode: 'speech', trigger: 'teleport' } })).toBeNull();
    expect(toRenderSpeechTiming({ speechTiming: { timingMode: 'speech', surprise: true } })).toBeNull();
    expect(toRenderSpeechTiming({ speechTiming: 'fast' })).toBeNull();
    expect(toRenderSpeechTiming({})).toBeNull();
    // The existing modes are accepted as-is and are no-ops in the renderer.
    for (const timingMode of ['fixed', 'duration', 'manual']) {
      expect(toRenderSpeechTiming({ speechTiming: { timingMode } })).toMatchObject({ timingMode });
    }
  });
});
