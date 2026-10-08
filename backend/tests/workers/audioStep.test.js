/**
 * The audio step is what makes scene-level voice regeneration cheap: it records only
 * the scenes that have no audio, so clearing ONE scene's narration re-records that
 * scene and nothing else. These tests pin that, and the cache bypass for a fresh take.
 */
jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), border: jest.fn(),
}));
jest.mock('../../src/services/common/ActivityLogService', () => ({ add: jest.fn().mockResolvedValue() }));
jest.mock('../../src/services/common/SocketService', () => ({ emitJobProgress: jest.fn(), emitSceneAudioReady: jest.fn() }));
jest.mock('../../src/services/common/MetricsService', () => ({ recordDuration: jest.fn(), increment: jest.fn() }));
jest.mock('../../src/services/video/VideoService', () => ({
  updateStatus: jest.fn().mockResolvedValue({}),
  updateSceneAudio: jest.fn().mockResolvedValue({}),
  updateSceneSegments: jest.fn().mockResolvedValue({}),
  getById: jest.fn().mockResolvedValue({ status: 'GENERATING_AUDIO' }),
}));
jest.mock('../../src/services/localAI', () => ({ gpu: { withGPU: jest.fn((_name, fn) => fn()) } }));
jest.mock('../../src/services/audio/audioService', () => ({ generateAllAudio: jest.fn() }));
jest.mock('../../src/services/audio/pipeline/speech/events', () => ({
  SPEECH_EVENTS: {}, emitSpeechStage: jest.fn(), speechEventsEnabled: () => false,
}));

const AudioService = require('../../src/services/audio/audioService');
const audioStep = require('../../src/workers/videoWorker/audioStep');

const scene = (n, file = `scene${n}.mp3`, over = {}) => ({ sceneNumber: n, audio: { text: `Narration ${n}.`, voice: 'female-1', file, ...over } });
const job = { type: 'educational', voice: 'female-1', fastAudio: false, voiceStyle: '', voiceProfile: '' };
const ctx = () => ({ currentStep: null, signal: undefined, reused: false });

beforeEach(() => {
  jest.clearAllMocks();
  AudioService.generateAllAudio.mockResolvedValue();
});

describe('audioStep', () => {
  it('records only the scene whose narration was cleared - the others are not touched', async () => {
    const scenes = [scene(1), scene(2, ''), scene(3)];
    await audioStep.run('job-1', job, { scenes }, ctx());

    const processed = AudioService.generateAllAudio.mock.calls[0][1];
    expect(processed.map((s) => s.sceneNumber)).toEqual([2]);
  });

  it('does nothing at all (and says it reused everything) when every scene already has audio', async () => {
    const c = ctx();
    await audioStep.run('job-1', job, { scenes: [scene(1), scene(2)] }, c);
    expect(AudioService.generateAllAudio).not.toHaveBeenCalled();
    expect(c.reused).toBe(true);
  });

  it('serves a scene from the TTS cache normally (skipCache off)', async () => {
    await audioStep.run('job-1', job, { scenes: [scene(1), scene(2, '')] }, ctx());
    expect(AudioService.generateAllAudio.mock.calls[0][6]).toBe(false);
  });

  it('bypasses the cache for a scene a person asked to have recorded again', async () => {
    await audioStep.run('job-1', job, { scenes: [scene(1), scene(2, '', { fresh: true })] }, ctx());
    expect(AudioService.generateAllAudio.mock.calls[0][6]).toBe(true);
  });

  it('a fresh marker on a scene that is not being processed does not force a bypass', async () => {
    // scene 1 still has its audio; its stale marker is irrelevant
    await audioStep.run('job-1', job, { scenes: [scene(1, 'scene1.mp3', { fresh: true }), scene(2, '')] }, ctx());
    expect(AudioService.generateAllAudio.mock.calls[0][6]).toBe(false);
  });
});
