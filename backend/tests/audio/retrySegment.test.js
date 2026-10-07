jest.mock('../../src/services/common/LoggerService', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../src/services/common/ActivityLogService', () => ({ add: jest.fn() }));
jest.mock('../../src/services/common/SocketService', () => ({ emitSceneAudioReady: jest.fn() }));

const mockFindById = jest.fn();
jest.mock('../../src/models/VideoJob', () => ({ findById: (...a) => mockFindById(...a) }));
const mockGenerateSceneAudio = jest.fn();
jest.mock('../../src/services/audio/audioService', () => ({ generateSceneAudio: (...a) => mockGenerateSceneAudio(...a) }));
const mockUpdateSceneAudio = jest.fn();
jest.mock('../../src/services/video/videoService/statusUpdates', () => ({ updateSceneAudio: (...a) => mockUpdateSceneAudio(...a) }));

const config = require('../../src/config');
const SocketService = require('../../src/services/common/SocketService');
const { retrySceneSegment, regenerateSceneAudio } = require('../../src/services/video/videoService/scenePipeline');

const job = (over = {}) => ({
  type: 'educational',
  voice: 'custom:Ryan',
  fastAudio: false,
  voiceStyle: 'documentary',
  voiceProfile: '',
  script: {
    scenes: [
      { sceneNumber: 1, audio: { text: 'One.' } },
      { sceneNumber: 2, audio: { text: 'Two.', segments: [{ id: 's02-seg001' }, { id: 's02-seg002' }] } },
    ],
  },
  ...over,
});

const original = config.audio.segmentedTts;
beforeEach(() => {
  jest.clearAllMocks();
  config.audio.segmentedTts = true;
  mockFindById.mockResolvedValue(job());
  mockGenerateSceneAudio.mockResolvedValue({ file: 'scene2.mp3', duration: 5, segments: [{ id: 's02-seg002', status: 'completed' }] });
});
afterAll(() => { config.audio.segmentedTts = original; });

describe('retrySceneSegment', () => {
  it('re-synthesizes only the named segment, planning the scene like the original run', async () => {
    const out = await retrySceneSegment('job-1', 2, 's02-seg002');

    const [jobId, scene, voice, fast, skipCache, options] = mockGenerateSceneAudio.mock.calls[0];
    expect([jobId, scene.sceneNumber, voice, fast, skipCache]).toEqual(['job-1', 2, 'custom:Ryan', false, false]);
    expect(options).toMatchObject({ forceSegmentIds: ['s02-seg002'], totalScenes: 2, videoType: 'educational', style: 'documentary' });

    expect(mockUpdateSceneAudio).toHaveBeenCalledWith('job-1', 2, expect.objectContaining({ file: 'scene2.mp3' }));
    expect(SocketService.emitSceneAudioReady).toHaveBeenCalled();
    expect(out).toMatchObject({ sceneNumber: 2, segmentId: 's02-seg002' });
  });

  it('needs the segmented pipeline', async () => {
    config.audio.segmentedTts = false;
    await expect(retrySceneSegment('job-1', 2, 's02-seg002')).rejects.toMatchObject({ status: 409 });
    expect(mockGenerateSceneAudio).not.toHaveBeenCalled();
  });

  it('404s on an unknown job, scene or segment, and 400s on a malformed id', async () => {
    mockFindById.mockResolvedValueOnce(null);
    await expect(retrySceneSegment('nope', 2, 's02-seg001')).rejects.toMatchObject({ status: 404 });
    await expect(retrySceneSegment('job-1', 9, 's09-seg001')).rejects.toMatchObject({ status: 404 });
    await expect(retrySceneSegment('job-1', 2, 's02-seg009')).rejects.toMatchObject({ status: 404 });
    mockFindById.mockResolvedValueOnce(job({ script: { scenes: [{ sceneNumber: 2, audio: { text: 'Two.' } }] } }));
    await expect(retrySceneSegment('job-1', 2, '../../etc/passwd')).rejects.toMatchObject({ status: 400 });
    expect(mockGenerateSceneAudio).not.toHaveBeenCalled();
  });
});

describe('regenerateSceneAudio', () => {
  it('passes the script context so a regenerated scene is planned like the original', async () => {
    mockGenerateSceneAudio.mockResolvedValue({ file: 'scene2.mp3', duration: 5 });
    await regenerateSceneAudio('job-1', 2);
    const [, , , , skipCache, options] = mockGenerateSceneAudio.mock.calls[0];
    expect(skipCache).toBe(true);
    expect(options).toMatchObject({ totalScenes: 2, videoType: 'educational', style: 'documentary' });
  });
});
