jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), tts: jest.fn(), http: jest.fn(),
}));

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseWav } = require('../../src/utils/wavAudio');

// ---- in-memory stand-ins for the GPU, the cache and the aligner -------------
const mockCacheStore = new Map(); // `${kind}:${hash}` -> { bytes, meta }
const mockSynth = { calls: [], failIds: new Set() };
const mockAlignCalls = [];
const mockWordsById = new Map();

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
    synthesizeRaw: jest.fn(async ({ spokenText, outputPath, signal }) => {
      if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      const id = require('path').basename(outputPath).replace('.raw.wav', '');
      mockSynth.calls.push(id);
      if (mockSynth.failIds.has(id)) {
        const err = new Error('CUDA out of memory');
        err.attempts = 3;
        throw err;
      }
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
    mockAlignCalls.push(files.map((f) => require('path').basename(f)));
    return files.map((f) => mockWordsById.get(require('path').basename(f).replace('.wav', '')) || null);
  }),
  getProvider: () => ({ name: 'faster-whisper' }),
  getAlignmentVersion: () => 'mock-aligner:1',
}));

const { planScene } = require('../../src/services/audio/pipeline/segmentPlanner');
const { synthesizeScene, SceneAudioError } = require('../../src/services/audio/pipeline/segmentSynthesis');
const rawSynthesis = require('../../src/services/audio/pipeline/rawSynthesis');
const { captionTokens } = require('../../src/services/audio/pipeline/pronunciation');

const TEXT = [
  'We built the backend with Node.js and MongoDB for storage.',
  'Queues are handled by BullMQ, which keeps the work orderly.',
  'Finally, the whole pipeline is rendered with Remotion.',
].join('\n\n');

let dir;
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireon-seg-')); });
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  mockCacheStore.clear();
  mockSynth.calls.length = 0;
  mockSynth.failIds.clear();
  mockAlignCalls.length = 0;
  mockWordsById.clear();
  jest.clearAllMocks();
});

/** Plan the scene and prime the fake aligner with a perfect "hearing" of each segment's spoken text. */
async function plan(extra = {}) {
  const p = await planScene({ text: TEXT, sceneNumber: 2, voice: 'custom:Ryan', ...extra });
  p.segments.forEach((seg) => {
    let t = 0;
    mockWordsById.set(seg.id, seg.internal.spokenTokens.map((tok) => {
      const w = { word: tok.text, start: t, end: t + 0.04, probability: 0.9 };
      t += 0.05;
      return w;
    }));
  });
  return p;
}

const run = (p, extra = {}) => synthesizeScene({
  jobId: 'job-TEST', sceneNumber: 2, plan: p, workDir: path.join(dir, `w-${Math.random()}`), outputPath: path.join(dir, `scene-${Math.random()}.wav`), ...extra,
});

describe('segmented scene synthesis', () => {
  it('plans one segment per paragraph with original and spoken text kept apart', async () => {
    const p = await plan();
    expect(p.segments).toHaveLength(3);
    expect(p.segments[0].sourceText).toContain('Node.js and MongoDB');
    expect(p.segments[0].spokenText).toContain('Node JS and Mongo D B');
    expect(p.segments.map((s) => s.id)).toEqual(['s02-seg001', 's02-seg002', 's02-seg003']);
    expect(new Set(p.segments.map((s) => s.rawCacheKey)).size).toBe(3);
  });

  it('generates, processes, assembles, and reports timings that match the audio', async () => {
    const p = await plan();
    const events = [];
    const r = await run(p, { onProgress: (e) => events.push(e.stage) });

    expect(mockSynth.calls).toEqual(['s02-seg001', 's02-seg002', 's02-seg003']);
    expect(r.stats).toMatchObject({ cacheHits: 0, cacheMisses: 3 });
    expect(r.fromCache).toBe(false);

    // Timings are contiguous-with-gaps, ordered, and fit inside the track.
    for (let i = 0; i < r.segments.length; i++) {
      const s = r.segments[i];
      expect(s.status).toBe('completed');
      expect(s.endMs - s.startMs).toBe(s.durationMs);
      if (i > 0) expect(s.startMs).toBeGreaterThanOrEqual(r.segments[i - 1].endMs);
      expect(s.internal).toBeUndefined();
    }
    expect(r.segments[2].endMs).toBeLessThanOrEqual(r.durationMs);

    const { fmt, data } = parseWav(fs.readFileSync(r.path));
    expect(Math.abs(Math.round((data.length / fmt.byteRate) * 1000) - r.durationMs)).toBeLessThanOrEqual(2);

    expect(events).toEqual(expect.arrayContaining(['segmenting', 'tts-generating', 'tts-processing', 'audio-assembling', 'audio-complete']));
    expect(events).not.toContain('tts-cache-hit');
  });

  it('gives every original caption word a timestamp, in order, despite respelled words', async () => {
    const p = await plan();
    const r = await run(p);
    const original = captionTokens(TEXT.replace(/\n\n/g, ' ')).map((t) => t.text);
    expect(r.captionTimestamps.map((w) => w.word)).toEqual(original);
    for (let i = 1; i < r.captionTimestamps.length; i++) {
      expect(r.captionTimestamps[i].start).toBeGreaterThanOrEqual(r.captionTimestamps[i - 1].start);
    }
    // Segment 2's first word starts at (or after) segment 2's start in the scene track.
    const firstOfSeg2 = r.captionTimestamps[p.segments[0].internal.wordMap.length];
    expect(firstOfSeg2.start).toBeGreaterThanOrEqual(r.segments[1].startMs / 1000 - 0.001);
  });

  it('serves a repeat run entirely from cache: no GPU, no alignment, same duration', async () => {
    const first = await run(await plan());
    mockSynth.calls.length = 0;
    mockAlignCalls.length = 0;

    const events = [];
    const second = await run(await plan(), { onProgress: (e) => events.push(e.stage) });
    expect(mockSynth.calls).toEqual([]);
    expect(mockAlignCalls).toEqual([]);
    expect(second.stats).toMatchObject({ cacheHits: 3, cacheMisses: 0 });
    expect(second.fromCache).toBe(true);
    expect(second.durationMs).toBe(first.durationMs);
    expect(second.captionTimestamps).toEqual(first.captionTimestamps);
    expect(events.filter((e) => e === 'tts-cache-hit')).toHaveLength(3);
  });

  it('retries only the failed segment, never regenerating finished ones', async () => {
    mockSynth.failIds.add('s02-seg002');
    const failed = await run(await plan()).catch((e) => e);

    expect(failed).toBeInstanceOf(SceneAudioError);
    expect(failed.segments.map((s) => s.status)).toEqual(['completed', 'failed', 'completed']);
    expect(failed.segments[1].error).toMatchObject({ code: 'GPU_OOM', retryable: true });
    // User-safe: no stack, no raw exception text.
    expect(JSON.stringify(failed.segments[1].error)).not.toMatch(/CUDA out of memory|at .*\.js/);
    // Segments 1 and 3 still ran, so they are cached.
    expect(mockSynth.calls).toEqual(['s02-seg001', 's02-seg002', 's02-seg003']);

    mockSynth.failIds.clear();
    mockSynth.calls.length = 0;
    const retried = await run(await plan());
    expect(mockSynth.calls).toEqual(['s02-seg002']); // only the one that failed
    expect(retried.stats).toMatchObject({ cacheHits: 2, cacheMisses: 1 });
    expect(retried.segments.every((s) => s.status === 'completed')).toBe(true);
  });

  it('re-synthesizes exactly the forced segments even when cached', async () => {
    await run(await plan());
    mockSynth.calls.length = 0;
    await run(await plan(), { forceSegmentIds: ['s02-seg003'] });
    expect(mockSynth.calls).toEqual(['s02-seg003']);
  });

  it('skipCache regenerates everything', async () => {
    await run(await plan());
    mockSynth.calls.length = 0;
    await run(await plan(), { skipCache: true });
    expect(mockSynth.calls).toHaveLength(3);
  });

  it('returns null caption timings (not made-up ones) when nothing could be aligned', async () => {
    const p = await plan();
    mockWordsById.clear();
    const r = await run(p);
    expect(r.captionTimestamps).toBeNull();
    expect(r.speechRanges).toHaveLength(3);
  });

  it('flags words in a segment the aligner missed as estimated, keeping the rest measured', async () => {
    const p = await plan();
    mockWordsById.delete('s02-seg002');
    const r = await run(p);
    const total = r.captionTimestamps.length;
    const estimated = r.captionTimestamps.filter((w) => w.estimated).length;
    expect(estimated).toBe(p.segments[1].internal.wordMap.length);
    expect(estimated).toBeLessThan(total);
  });

  it('stops immediately when cancelled, before calling the TTS model', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(run(await plan(), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(rawSynthesis.synthesizeRaw).not.toHaveBeenCalled();
  });

  it('plans identically for identical input, so cache keys are stable across runs', async () => {
    const a = await plan();
    const b = await plan();
    expect(a.segments.map((s) => s.processedCacheKey)).toEqual(b.segments.map((s) => s.processedCacheKey));
    const other = await plan({ style: 'dramatic' });
    expect(other.segments[0].rawCacheKey).not.toBe(a.segments[0].rawCacheKey);
  });
});
