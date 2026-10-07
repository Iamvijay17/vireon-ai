jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), tts: jest.fn(),
}));
jest.mock('../../src/services/common/MetricsService', () => ({ increment: jest.fn(), recordDuration: jest.fn() }));
jest.mock('../../src/services/common/CacheService', () => ({}));
jest.mock('../../src/services/storage/providers', () => ({ getStorageProvider: () => ({}) }));

const mockSynthesize = jest.fn();
const mockUpload = jest.fn(async () => 'http://storage/audio');
jest.mock('../../src/services/audio/pipeline/segmentSynthesis', () => {
  class SceneAudioError extends Error {
    constructor(sceneNumber, segments) {
      super(`TTS failed for scene ${sceneNumber}`);
      this.name = 'SceneAudioError';
      this.segments = segments;
    }
  }
  return { synthesizeScene: (...a) => mockSynthesize(...a), uploadSceneTrack: (...a) => mockUpload(...a), SceneAudioError };
});

const mockWithGPU = jest.fn((_name, fn) => fn());
jest.mock('../../src/services/localAI', () => ({ gpu: { withGPU: (...a) => mockWithGPU(...a) } }));

const { generateAllAudioSegmented, generateSceneAudioSegmented } = require('../../src/services/audio/pipeline/batch');
const { SceneAudioError } = require('../../src/services/audio/pipeline/segmentSynthesis');
const config = require('../../src/config');

const scene = (n, text = `Scene ${n} narration goes here.`, extra = {}) => ({ sceneNumber: n, sceneType: 'content', audio: { text }, ...extra });

const synthesized = (n) => ({
  path: `/tmp/scene${n}.mp3`,
  durationMs: 4200,
  segments: [{ id: `s0${n}-seg001`, voiceProfile: null, status: 'completed', startMs: 0, endMs: 4000, durationMs: 4000 }],
  captionTimestamps: [{ word: 'Scene', start: 0, end: 0.3 }],
  speechRanges: [],
  fromCache: false,
  stats: { cacheHits: 0, cacheMisses: 1, generationMs: 10, processingMs: 5, alignmentMs: 3, assemblyMs: 1, degraded: false },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSynthesize.mockImplementation(async ({ sceneNumber }) => synthesized(sceneNumber));
});

describe('generateAllAudioSegmented', () => {
  it('returns the legacy result shape plus segments and tts metadata', async () => {
    const done = [];
    const results = await generateAllAudioSegmented('job-1', [scene(1), scene(2)], 'custom:Ryan', async (n, r) => done.push([n, r.file]), null, false, false, null, { totalScenes: 2 });

    expect(done).toEqual([[1, 'scene1.mp3'], [2, 'scene2.mp3']]);
    expect(results[0]).toMatchObject({ file: 'scene1.mp3', duration: 4.2, fromCache: false });
    expect(results[0].captionTimestamps).toEqual([{ word: 'Scene', start: 0, end: 0.3 }]);
    expect(results[0].segments).toHaveLength(1);
    expect(results[0].ttsMeta).toMatchObject({ segmentCount: 1, cacheMisses: 1, ttsGenerationMs: 10, audioDurationMs: 4200 });
    expect(mockUpload).toHaveBeenCalledTimes(2);
  });

  it('plans first/last-scene cues from the scene position in the whole script, not the batch', async () => {
    // Resuming at scene 3 of 5: it is neither the first nor the last scene.
    await generateAllAudioSegmented('job-1', [scene(3)], 'custom:Ryan', null, null, false, false, null, { totalScenes: 5 });
    const { plan } = mockSynthesize.mock.calls[0][0];
    // The middle of the video: no closing slow-down applied.
    await generateAllAudioSegmented('job-1', [scene(5)], 'custom:Ryan', null, null, false, false, null, { totalScenes: 5 });
    const last = mockSynthesize.mock.calls[1][0].plan.segments[0].instruction.speed;
    expect(last).toBeLessThan(plan.segments[0].instruction.speed);
  });

  it('announces the voice-director stage with the planned segment count before synthesis', async () => {
    const stages = [];
    mockSynthesize.mockImplementation(async ({ sceneNumber }) => {
      stages.push('synthesize');
      return synthesized(sceneNumber);
    });
    await generateAllAudioSegmented('job-1', [scene(1)], 'custom:Ryan', null, null, false, false, null, {
      onProgress: (e) => stages.push(`${e.stage}:${e.total}`),
    });
    expect(stages).toEqual(['voice-director:1', 'synthesize']);
  });

  it('skips scenes without narration text', async () => {
    const results = await generateAllAudioSegmented('job-1', [scene(1, '   '), scene(2)], 'custom:Ryan', null, null);
    expect(results.map((r) => r.file)).toEqual(['scene2.mp3']);
    expect(mockSynthesize).toHaveBeenCalledTimes(1);
  });

  it('checks for cancellation before every scene', async () => {
    const check = jest.fn().mockResolvedValueOnce().mockRejectedValueOnce(new Error('cancelled'));
    await expect(generateAllAudioSegmented('job-1', [scene(1), scene(2)], 'custom:Ryan', null, check)).rejects.toThrow('cancelled');
    expect(mockSynthesize).toHaveBeenCalledTimes(1);
  });

  it('reports failed segments to the caller before rethrowing', async () => {
    const failedSegments = [{ id: 's01-seg001', status: 'failed' }];
    mockSynthesize.mockRejectedValueOnce(new SceneAudioError(1, failedSegments));
    const onSceneFailed = jest.fn();
    await expect(generateAllAudioSegmented('job-1', [scene(1)], 'custom:Ryan', null, null, false, false, null, { onSceneFailed })).rejects.toThrow(/TTS failed for scene 1/);
    expect(onSceneFailed).toHaveBeenCalledWith(1, failedSegments);
  });

  it('uses the per-scene voice when no job voice is given (podcast turns)', async () => {
    await generateAllAudioSegmented('job-1', [scene(1, 'Hello there everyone.', { speaker: 'host', audio: { text: 'Hello there everyone.', voice: 'custom:Serena' } })], undefined, null, null);
    const { plan } = mockSynthesize.mock.calls[0][0];
    expect(plan.voice).toBe('custom:Serena');
    expect(plan.segments[0].speaker).toBe('host');
    expect(plan.segments[0].internal.instruct).toMatch(/podcast host/);
  });

  it('hands scene-level delivery notes to the Voice Director', async () => {
    await generateAllAudioSegmented('job-1', [scene(1, 'Hello.', { audio: { text: 'Hello.', emotion: 'quietly excited' } })], 'custom:Ryan', null, null);
    const seg = mockSynthesize.mock.calls[0][0].plan.segments[0];
    expect(seg.instruction.note).toBe('quietly excited');
    expect(seg.internal.instruct).toContain('quietly excited');
  });
});

describe('generateSceneAudioSegmented', () => {
  it('takes the GPU lease itself and forwards forced segment ids', async () => {
    const result = await generateSceneAudioSegmented('job-1', scene(2), 'custom:Ryan', false, false, { forceSegmentIds: ['s02-seg001'], totalScenes: 4 });
    expect(mockWithGPU).toHaveBeenCalledWith('tts', expect.any(Function));
    expect(mockSynthesize.mock.calls[0][0].forceSegmentIds).toEqual(['s02-seg001']);
    expect(result.file).toBe('scene2.mp3');
  });
});

describe('TTS_SEGMENTED flag routing in AudioService', () => {
  const original = config.audio.segmentedTts;
  afterEach(() => { config.audio.segmentedTts = original; });

  it('delegates generateAllAudio to the segmented pipeline when enabled, with the same arguments', async () => {
    config.audio.segmentedTts = true;
    const { generateAllAudio } = require('../../src/services/audio/audioService/sceneSynthesis');
    const results = await generateAllAudio('job-1', [scene(1)], 'custom:Ryan', null, null, false, false, null, { totalScenes: 1 });
    expect(results).toHaveLength(1);
    expect(mockSynthesize).toHaveBeenCalledTimes(1);
  });
});
