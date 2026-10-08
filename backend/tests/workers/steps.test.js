jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), border: jest.fn(),
}));
jest.mock('../../src/services/common/ActivityLogService', () => ({ add: jest.fn().mockResolvedValue() }));
jest.mock('../../src/services/common/SocketService', () => ({ emitJobProgress: jest.fn() }));
jest.mock('../../src/services/video/VideoService', () => ({
  getById: jest.fn(),
  updateStatus: jest.fn().mockResolvedValue({}),
  updateScript: jest.fn().mockResolvedValue({}),
  updateSceneImages: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../src/services/localAI', () => ({ gpu: { withGPU: jest.fn((_name, fn) => fn()) } }));
jest.mock('../../src/services/director/AIDirectorService', () => ({ direct: jest.fn() }));
jest.mock('../../src/services/video/ScriptParserService', () => ({ validate: jest.fn(), saveScript: jest.fn().mockResolvedValue() }));
jest.mock('../../src/services/video/sceneGraphCheck', () => ({ checkSceneGraph: jest.fn().mockResolvedValue(null) }));
jest.mock('../../src/services/image/sceneImages', () => ({ ensureSceneImages: jest.fn(), needsImage: jest.fn((s) => Boolean(s.imagePrompt) && !s.imageUrl) }));

const config = require('../../src/config');
const VideoService = require('../../src/services/video/VideoService');
const SocketService = require('../../src/services/common/SocketService');
const ActivityLogService = require('../../src/services/common/ActivityLogService');
const LocalAIService = require('../../src/services/localAI');
const AIDirectorService = require('../../src/services/director/AIDirectorService');
const ScriptParserService = require('../../src/services/video/ScriptParserService');
const { checkSceneGraph } = require('../../src/services/video/sceneGraphCheck');
const { ensureSceneImages } = require('../../src/services/image/sceneImages');
const scriptStep = require('../../src/workers/videoWorker/scriptStep');
const imageStep = require('../../src/workers/videoWorker/imageStep');
const { JobCancelledError } = require('../../src/workers/videoWorker/shared');
const { JOB_STATUS } = require('../../src/constants');

const original = { ...config.imageGen };
afterAll(() => Object.assign(config.imageGen, original));

describe('scriptStep', () => {
  const videoJob = (over = {}) => ({
    _id: 'job-1', topic: 'tides', type: 'educational', language: 'english', duration: 5,
    hostName: '', guestName: '', hostVoice: '', guestVoice: '', resolution: '1920x1080', script: { scenes: [] }, ...over,
  });
  const directed = { title: 'Tides', brief: { beats: [] }, scenes: [{ sceneNumber: 1 }] };
  const validated = { title: 'Tides', scenes: [{ sceneNumber: 1 }] };
  const ctx = () => ({ currentStep: null });

  beforeEach(() => {
    jest.clearAllMocks();
    VideoService.getById.mockResolvedValue({ status: JOB_STATUS.SCRIPT_GENERATION });
    AIDirectorService.direct.mockResolvedValue(directed);
    ScriptParserService.validate.mockReturnValue(validated);
  });

  it('reuses an existing script instead of generating a new one', async () => {
    const job = videoJob({ script: { title: 'Existing', scenes: [{ sceneNumber: 1 }] } });
    expect(await scriptStep.run('job-1', job, JOB_STATUS.AUDIO_COMPLETED, ctx())).toBeNull();
    expect(AIDirectorService.direct).not.toHaveBeenCalled();
  });

  it('regenerates from QUEUED even when a script exists (restart from the start)', async () => {
    const job = videoJob({ script: { title: 'Old', scenes: [{ sceneNumber: 1 }] } });
    await scriptStep.run('job-1', job, JOB_STATUS.QUEUED, ctx());
    expect(AIDirectorService.direct).toHaveBeenCalled();
  });

  it('sizes the script from the requested duration and holds the LLM slot for the whole Director run', async () => {
    await scriptStep.run('job-1', videoJob({ duration: 5 }), JOB_STATUS.QUEUED, ctx());

    expect(LocalAIService.gpu.withGPU).toHaveBeenCalledWith('llm', expect.any(Function));
    expect(AIDirectorService.direct).toHaveBeenCalledWith(expect.objectContaining({
      videoType: 'educational', topic: 'tides', sceneCount: 10, wordCount: 975, wordsPerScene: 98, durationMinutes: 5, jobId: 'job-1',
    }));
  });

  it('validates, checks the scene graph before any TTS spend, saves, and pauses for approval', async () => {
    const result = await scriptStep.run('job-1', videoJob(), JOB_STATUS.QUEUED, ctx());

    expect(ScriptParserService.validate).toHaveBeenCalledWith(directed, 'educational', expect.objectContaining({ seed: 'job-1' }));
    expect(checkSceneGraph).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-1', script: validated, stage: 'script' }));
    expect(ScriptParserService.saveScript).toHaveBeenCalledWith('job-1', validated);
    expect(VideoService.updateScript).toHaveBeenCalledWith('job-1', validated);
    expect(VideoService.updateStatus).toHaveBeenLastCalledWith('job-1', JOB_STATUS.AWAITING_APPROVAL, { progress: 20 });
    expect(result).toEqual({ success: true, jobId: 'job-1', awaitingApproval: true });
  });

  it('falls straight through to audio when a fast job is set to auto-approve', async () => {
    const result = await scriptStep.run('job-1', videoJob({ fastGeneration: true, autoApprove: true }), JOB_STATUS.QUEUED, ctx());

    expect(VideoService.updateScript).toHaveBeenCalledWith('job-1', validated);
    expect(VideoService.updateStatus).not.toHaveBeenCalledWith('job-1', JOB_STATUS.AWAITING_APPROVAL, expect.anything());
    expect(result).toBeNull();
  });

  it('still pauses for approval when auto-approve is set on a manual (non-fast) job', async () => {
    const result = await scriptStep.run('job-1', videoJob({ fastGeneration: false, autoApprove: true }), JOB_STATUS.QUEUED, ctx());
    expect(result).toEqual({ success: true, jobId: 'job-1', awaitingApproval: true });
  });

  it('does not persist a script that fails scene-graph checking (authoritative IR mode)', async () => {
    checkSceneGraph.mockRejectedValueOnce(new Error('SceneGraph compile failed'));
    await expect(scriptStep.run('job-1', videoJob(), JOB_STATUS.QUEUED, ctx())).rejects.toThrow(/SceneGraph/);
    expect(VideoService.updateScript).not.toHaveBeenCalled();
  });

  it('does not overwrite a stop request that arrived while the model was running', async () => {
    VideoService.getById.mockResolvedValue({ status: JOB_STATUS.CANCELLED });
    await expect(scriptStep.run('job-1', videoJob(), JOB_STATUS.QUEUED, ctx())).rejects.toBeInstanceOf(JobCancelledError);
    expect(VideoService.updateStatus).not.toHaveBeenCalledWith('job-1', JOB_STATUS.AWAITING_APPROVAL, expect.anything());
  });

  it('records the step for failure reporting', async () => {
    const context = ctx();
    await scriptStep.run('job-1', videoJob(), JOB_STATUS.QUEUED, context);
    expect(context.currentStep).toBe(JOB_STATUS.SCRIPT_GENERATION);
  });
});

describe('imageStep', () => {
  const scene = (n, over = {}) => ({ sceneNumber: n, imagePrompt: `prompt ${n}`, imageUrl: '', ...over });
  const jobWith = (scenes, over = {}) => ({ _id: 'job-1', resolution: '1920x1080', script: { scenes }, ...over });
  const result = (over = {}) => ({ scenes: [], total: 1, generated: 1, cached: 0, degraded: [], reasons: [], ...over });
  const ctx = () => ({ currentStep: null, signal: new AbortController().signal });

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(config.imageGen, original, { enabled: true });
    ensureSceneImages.mockResolvedValue(result());
    LocalAIService.gpu.withGPU.mockImplementation((_name, fn) => fn());
  });

  it('does nothing - no status change, no GPU - when no scene needs an image', async () => {
    VideoService.getById.mockResolvedValue(jobWith([scene(1, { imagePrompt: '' }), scene(2, { imageUrl: 'http://x/a.png' })]));
    await imageStep.run('job-1', ctx());

    expect(VideoService.updateStatus).not.toHaveBeenCalled();
    expect(LocalAIService.gpu.withGPU).not.toHaveBeenCalled();
    expect(ensureSceneImages).not.toHaveBeenCalled();
  });

  it('generates under the ComfyUI GPU slot and walks GENERATING_IMAGES -> IMAGE_COMPLETED', async () => {
    VideoService.getById.mockResolvedValue(jobWith([scene(1), scene(2)]));
    const context = ctx();
    await imageStep.run('job-1', context);

    expect(context.currentStep).toBe(JOB_STATUS.GENERATING_IMAGES);
    expect(LocalAIService.gpu.withGPU).toHaveBeenCalledWith('comfyui', expect.any(Function));
    expect(VideoService.updateStatus.mock.calls.map((c) => c[1])).toEqual([JOB_STATUS.GENERATING_IMAGES, JOB_STATUS.IMAGE_COMPLETED]);
    expect(SocketService.emitJobProgress).toHaveBeenLastCalledWith(expect.objectContaining({ status: JOB_STATUS.IMAGE_COMPLETED, progress: 60 }));
  });

  it('passes the right aspect ratio, the abort signal, and a persist callback that saves scenes as they land', async () => {
    VideoService.getById.mockResolvedValue(jobWith([scene(1)], { resolution: '1080x1920' }));
    const context = ctx();
    await imageStep.run('job-1', context);

    const opts = ensureSceneImages.mock.calls[0][0];
    expect(opts).toMatchObject({ id: 'job-1', aspectRatio: '9:16', signal: context.signal });
    await opts.persist([{ sceneNumber: 1, imageUrl: 'http://x/1.png' }]);
    expect(VideoService.updateSceneImages).toHaveBeenCalledWith('job-1', [{ sceneNumber: 1, imageUrl: 'http://x/1.png' }]);
  });

  it('does not take the GPU when image generation is off (it only rewrites scenes to text)', async () => {
    config.imageGen.enabled = false;
    VideoService.getById.mockResolvedValue(jobWith([scene(1)]));
    ensureSceneImages.mockResolvedValue(result({ generated: 0, total: 1, degraded: [1], reasons: ['Image generation is not enabled'] }));
    await imageStep.run('job-1', ctx());

    expect(LocalAIService.gpu.withGPU).not.toHaveBeenCalled();
    expect(ensureSceneImages).toHaveBeenCalled();
  });

  it('tells the activity log what happened, including scenes that fell back to text', async () => {
    VideoService.getById.mockResolvedValue(jobWith([scene(1), scene(2)]));
    ensureSceneImages.mockResolvedValue(result({ generated: 1, cached: 1, degraded: [2], reasons: ['model not found'] }));
    await imageStep.run('job-1', ctx());

    const messages = ActivityLogService.add.mock.calls.map((c) => c[1]);
    expect(messages).toEqual(expect.arrayContaining([
      expect.stringContaining('Image generation started (2 images)'),
      expect.stringContaining('1 generated, 1 from cache'),
      expect.stringContaining('1 scene(s) rendered as text instead of an image (model not found)'),
    ]));
  });

  it('counts a shared prompt once (podcast cover)', async () => {
    VideoService.getById.mockResolvedValue(jobWith([scene(1, { imagePrompt: 'same' }), scene(2, { imagePrompt: 'same' }), scene(3, { imagePrompt: 'same' })]));
    await imageStep.run('job-1', ctx());
    expect(ActivityLogService.add).toHaveBeenCalledWith('job-1', 'Image generation started (1 image)');
  });

  it('turns an abort (Stop) into a job cancellation instead of a failure', async () => {
    VideoService.getById.mockResolvedValue(jobWith([scene(1)]));
    ensureSceneImages.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    await expect(imageStep.run('job-1', ctx())).rejects.toBeInstanceOf(JobCancelledError);
    expect(VideoService.updateStatus).not.toHaveBeenCalledWith('job-1', JOB_STATUS.IMAGE_COMPLETED, expect.anything());
  });

  it('lets a real failure (IMAGE_GEN_REQUIRED) propagate so the job retries', async () => {
    VideoService.getById.mockResolvedValue(jobWith([scene(1)]));
    ensureSceneImages.mockRejectedValue(new Error('ComfyUI is down'));
    await expect(imageStep.run('job-1', ctx())).rejects.toThrow('ComfyUI is down');
  });
});
