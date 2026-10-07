jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), tts: jest.fn(),
}));
jest.mock('../../src/services/common/MetricsService', () => ({
  increment: jest.fn(), recordDuration: jest.fn(),
  getRate: jest.fn(async () => 42.5), getAverage: jest.fn(async () => 1234.56), getCount: jest.fn(async () => 8),
}));
jest.mock('../../src/services/common/CacheService', () => ({}));
jest.mock('../../src/services/storage/providers', () => ({ getStorageProvider: () => ({}) }));

const mockSynthesize = jest.fn();
jest.mock('../../src/services/audio/pipeline/segmentSynthesis', () => {
  class SceneAudioError extends Error {
    constructor(sceneNumber, segments) {
      super('failed');
      this.name = 'SceneAudioError';
      this.segments = segments;
    }
  }
  return { synthesizeScene: (...a) => mockSynthesize(...a), uploadSceneTrack: jest.fn(), SceneAudioError };
});
const mockWithGPU = jest.fn((_n, fn) => fn());
jest.mock('../../src/services/localAI', () => ({ gpu: { withGPU: (...a) => mockWithGPU(...a) } }));
jest.mock('../../src/services/audio/pipeline/ffmpeg', () => ({
  isAvailable: jest.fn(async () => false), getFfmpegStatus: jest.fn(async () => ({ available: false })), runFfmpeg: jest.fn(), hasFilter: jest.fn(),
}));

const fs = require('fs');
const { SchemaValidationError } = require('../../src/utils/errors');
const { buildWavBuffer } = require('../../src/utils/wavAudio');
const { generatePreview, MAX_PENDING } = require('../../src/services/audio/pipeline/preview');
const { SceneAudioError } = require('../../src/services/audio/pipeline/segmentSynthesis');
const TtsController = require('../../src/controllers/ttsController');

const fmt = { audioFormat: 1, channels: 1, sampleRate: 24000, byteRate: 48000, blockAlign: 2, bitsPerSample: 16 };
const WAV = buildWavBuffer(fmt, Buffer.alloc(4800));

/** A synthesizeScene stand-in that writes a tiny WAV where the caller asked for it. */
const fakeSynth = (stats = { cacheHits: 0, cacheMisses: 1 }) => async ({ outputPath, plan }) => {
  fs.writeFileSync(outputPath, WAV);
  return { path: outputPath, durationMs: 100, segments: plan.segments.map((s) => ({ ...s, status: 'completed' })), stats };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSynthesize.mockImplementation(fakeSynth());
});

const res = () => {
  const r = { headers: {}, statusCode: null, body: null };
  r.set = (h) => { Object.assign(r.headers, h); return r; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.send = (b) => { r.body = b; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};

describe('generatePreview', () => {
  it('runs the real planning pipeline and returns playable audio under the GPU lease', async () => {
    const out = await generatePreview({ text: 'React and Node.js are popular.', voiceProfile: 'educational-teacher', format: 'wav' });
    expect(mockWithGPU).toHaveBeenCalledWith('tts', expect.any(Function));
    expect(out.buffer.equals(WAV)).toBe(true);
    expect(out).toMatchObject({ contentType: 'audio/wav', format: 'wav', cache: 'miss', segments: 1, style: 'educational', voice: 'custom:Serena' });

    const call = mockSynthesize.mock.calls[0][0];
    expect(call.align).toBe(false); // nothing consumes word timings in a preview
    expect(call.plan.segments[0].spokenText).toContain('Node JS'); // pronunciation applied
    expect(call.plan.segments[0].sourceText).toContain('Node.js'); // original untouched
  });

  it('applies explicit voice/style/emotion/speed/pitch from the request', async () => {
    await generatePreview({ text: 'Hello there.', voice: 'custom:Ryan', style: 'calm', emotion: 'sad', speed: 1.1, pitch: 1, format: 'wav' });
    const { plan } = mockSynthesize.mock.calls[0][0];
    expect(plan.style).toBe('calm');
    expect(plan.segments[0].instruction).toMatchObject({ emotion: 'sad', speed: 1.1, pitch: 1 });
  });

  it('applies per-request pronunciations', async () => {
    await generatePreview({ text: 'Vireon is here.', voice: 'custom:Ryan', pronunciations: { Vireon: 'Veer ee on' }, format: 'wav' });
    expect(mockSynthesize.mock.calls[0][0].plan.segments[0].spokenText).toBe('Veer ee on is here.');
  });

  it('reports cache hit / mixed from the scene stats', async () => {
    mockSynthesize.mockImplementation(fakeSynth({ cacheHits: 1, cacheMisses: 0 }));
    expect((await generatePreview({ text: 'Hi.', voice: 'custom:Ryan', format: 'wav' })).cache).toBe('hit');
    mockSynthesize.mockImplementation(fakeSynth({ cacheHits: 1, cacheMisses: 1 }));
    expect((await generatePreview({ text: 'Hi.', voice: 'custom:Ryan', format: 'wav' })).cache).toBe('mixed');
  });

  it('falls back to wav with a note when mp3 is requested but ffmpeg is missing', async () => {
    const out = await generatePreview({ text: 'Hi.', voice: 'custom:Ryan', format: 'mp3' });
    expect(out.format).toBe('wav');
    expect(out.formatNote).toMatch(/ffmpeg is unavailable/);
  });

  it('rejects an unknown voice profile before any GPU work', async () => {
    await expect(generatePreview({ text: 'Hi.', voiceProfile: 'nope', format: 'wav' })).rejects.toMatchObject({ status: 400 });
    expect(mockWithGPU).not.toHaveBeenCalled();
  });

  it('turns away previews beyond the pending limit with a 429', async () => {
    const releases = [];
    mockSynthesize.mockImplementation(() => new Promise((resolve) => { releases.push(resolve); }));
    const inFlight = Array.from({ length: MAX_PENDING }, () => generatePreview({ text: 'Hi.', voice: 'custom:Ryan', format: 'wav' }).catch((e) => e));
    await new Promise((r) => setImmediate(r));
    await expect(generatePreview({ text: 'One too many.', voice: 'custom:Ryan', format: 'wav' })).rejects.toMatchObject({ status: 429 });

    // Let the pending ones finish so the counter is released for later tests.
    mockSynthesize.mockImplementation(fakeSynth());
    releases.forEach((release) => release({ path: '', durationMs: 1, segments: [], stats: { cacheHits: 0, cacheMisses: 0 } }));
    await Promise.allSettled(inFlight);
  });

  it('surfaces only the user-safe segment message when generation fails', async () => {
    mockSynthesize.mockRejectedValue(new SceneAudioError(0, [{ status: 'failed', error: { code: 'GPU_OOM', message: 'The GPU ran out of memory while generating this line.' } }]));
    await expect(generatePreview({ text: 'Hi.', voice: 'custom:Ryan', format: 'wav' })).rejects.toMatchObject({
      status: 502,
      message: 'The GPU ran out of memory while generating this line.',
    });
  });
});

describe('TtsController', () => {
  it('rejects invalid input before touching the TTS engine', async () => {
    for (const body of [
      { text: 'Hi', voice: 'custom:Ryan', speed: 3 },
      { text: 'Hi', voice: 'custom:Ryan', pitch: 50 },
      { text: 'Hi', voice: 'custom:Ryan', style: 'robotic' },
      { text: 'Hi', voice: 'custom:Ryan', emotion: 'furious' },
      { text: 'Hi', voice: 'custom:Ryan', language: 'klingon' },
      { text: 'Hi', voice: 'custom:Ryan', format: 'ogg' },
      { text: '', voice: 'custom:Ryan' },
      { text: 'Hi' },
    ]) {
      const next = jest.fn();
      await TtsController.preview({ body }, res(), next);
      expect(next).toHaveBeenCalledWith(expect.any(SchemaValidationError));
    }
    expect(mockWithGPU).not.toHaveBeenCalled();
  });

  it('streams audio with timing headers', async () => {
    const r = res();
    const next = jest.fn();
    await TtsController.preview({ body: { text: 'Hello.', voice: 'custom:Ryan' } }, r, next);
    expect(next).not.toHaveBeenCalled();
    expect(r.statusCode).toBe(200);
    expect(r.headers['Content-Type']).toBe('audio/wav');
    expect(r.headers['X-Tts-Duration-Ms']).toBe('100');
    expect(r.headers['X-Tts-Cache']).toBe('miss');
    expect(r.headers['Access-Control-Expose-Headers']).toContain('X-Tts-Cache');
    expect(Buffer.isBuffer(r.body)).toBe(true);
  });

  it('lists profiles with the exact ranges the server enforces', async () => {
    const r = res();
    await TtsController.voices({}, r, jest.fn());
    expect(r.body.profiles.length).toBeGreaterThan(3);
    expect(r.body.styles).toContain('documentary');
    expect(r.body.limits).toMatchObject({ speedMin: 0.85, speedMax: 1.2 });
    expect(r.body.versions.pronunciation).toBeGreaterThanOrEqual(1);
  });

  it('reports performance stats', async () => {
    const r = res();
    await TtsController.stats({}, r, jest.fn());
    expect(r.body).toMatchObject({
      cache: { processedHitRatePercent: 42.5, rawHitRatePercent: 42.5 },
      segmentsGenerated: 8,
      segmentFailures: 8,
      failureRatePercent: 50,
    });
    expect(r.body.averagesMs.ttsGenerationPerSegment).toBe(1234.6);
  });
});
