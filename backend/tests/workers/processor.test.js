/**
 * The video worker's processor is the one place that decides step order, where
 * the pipeline pauses, and what happens when something throws. Every step module
 * is mocked here, so these tests pin the orchestration itself.
 */
jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), border: jest.fn(),
}));
jest.mock('../../src/services/common/ActivityLogService', () => ({ add: jest.fn().mockResolvedValue() }));
jest.mock('../../src/services/common/MetricsService', () => ({ recordDuration: jest.fn(), increment: jest.fn() }));
jest.mock('../../src/services/common/SocketService', () => ({ emitJobProgress: jest.fn(), emitJobFailed: jest.fn() }));
jest.mock('../../src/services/common/cancellationBus', () => ({
  register: jest.fn(() => jest.fn()),
  listenForCancellation: jest.fn(),
}));
jest.mock('../../src/queues/videoQueue', () => ({ add: jest.fn().mockResolvedValue() }));
jest.mock('../../src/services/video/VideoService', () => ({
  getById: jest.fn(),
  updateStatus: jest.fn(),
  scheduleRetry: jest.fn(),
  fail: jest.fn(),
}));
jest.mock('../../src/workers/videoWorker/scriptStep', () => ({ run: jest.fn() }));
jest.mock('../../src/workers/videoWorker/audioStep', () => ({ run: jest.fn() }));
jest.mock('../../src/workers/videoWorker/avatarStep', () => ({ run: jest.fn() }));
jest.mock('../../src/workers/videoWorker/imageStep', () => ({ run: jest.fn() }));
jest.mock('../../src/workers/videoWorker/renderStep', () => ({ prepareAssets: jest.fn(), render: jest.fn() }));
jest.mock('../../src/workers/videoWorker/uploadStep', () => ({ run: jest.fn() }));

const VideoService = require('../../src/services/video/VideoService');
const SocketService = require('../../src/services/common/SocketService');
const ActivityLogService = require('../../src/services/common/ActivityLogService');
const videoQueue = require('../../src/queues/videoQueue');
const scriptStep = require('../../src/workers/videoWorker/scriptStep');
const audioStep = require('../../src/workers/videoWorker/audioStep');
const avatarStep = require('../../src/workers/videoWorker/avatarStep');
const imageStep = require('../../src/workers/videoWorker/imageStep');
const renderStep = require('../../src/workers/videoWorker/renderStep');
const uploadStep = require('../../src/workers/videoWorker/uploadStep');
const { JobCancelledError } = require('../../src/workers/videoWorker/shared');
const { processVideoJob } = require('../../src/workers/videoWorker/processor');
const { JOB_STATUS } = require('../../src/constants');

const scriptBeforeImages = { scenes: [{ sceneNumber: 1, imageUrl: '' }] };
const scriptAfterImages = { scenes: [{ sceneNumber: 1, imageUrl: 'http://x/img.png' }] };

const job = (over = {}) => ({
  _id: 'job-1',
  status: JOB_STATUS.QUEUED,
  fastGeneration: true,
  createdAt: new Date(),
  maxRetries: 3,
  error: null,
  script: scriptBeforeImages,
  ...over,
});

const calls = [];
const track = (name, impl) => (...args) => { calls.push(name); return impl ? impl(...args) : undefined; };

beforeEach(() => {
  jest.clearAllMocks();
  calls.length = 0;

  VideoService.getById.mockResolvedValue(job());
  VideoService.updateStatus.mockImplementation(async (_id, status) => job({ status }));
  VideoService.scheduleRetry.mockResolvedValue(job({ status: JOB_STATUS.RETRY_SCHEDULED }));
  VideoService.fail.mockResolvedValue(job({ status: JOB_STATUS.FAILED }));

  scriptStep.run.mockImplementation(track('script'));
  audioStep.run.mockImplementation(track('audio'));
  avatarStep.run.mockImplementation(track('avatar', () => 'http://x/avatar.mp4'));
  imageStep.run.mockImplementation(track('images'));
  renderStep.prepareAssets.mockImplementation(track('assets', () => ({ scenes: [] })));
  renderStep.render.mockImplementation(track('render'));
  uploadStep.run.mockImplementation(track('upload', () => ({ success: true, jobId: 'job-1' })));
});

describe('the happy path', () => {
  it('runs every step in order', async () => {
    const result = await processVideoJob({ data: { jobId: 'job-1' } });
    expect(calls).toEqual(['script', 'audio', 'avatar', 'images', 'assets', 'render', 'upload']);
    expect(result).toEqual({ success: true, jobId: 'job-1' });
  });

  it('renders from the script as it is AFTER the image step, not the pre-image copy', async () => {
    // getById is also called by every cancellation checkpoint, so the mock follows
    // pipeline state rather than call count: once the image step has run, the
    // stored script is the one with images in it.
    VideoService.getById.mockImplementation(async () =>
      job({ script: calls.includes('images') ? scriptAfterImages : scriptBeforeImages })
    );

    await processVideoJob({ data: { jobId: 'job-1' } });

    expect(renderStep.prepareAssets.mock.calls[0][2]).toBe(scriptAfterImages);
    expect(renderStep.render.mock.calls[0][3]).toBe(scriptAfterImages);
    expect(uploadStep.run.mock.calls[0][1]).toBe(scriptAfterImages);
  });

  it('marks audio complete at 50% before moving on', async () => {
    await processVideoJob({ data: { jobId: 'job-1' } });
    expect(VideoService.updateStatus).toHaveBeenCalledWith('job-1', JOB_STATUS.AUDIO_COMPLETED, { progress: 50 });
    expect(SocketService.emitJobProgress).toHaveBeenCalledWith(expect.objectContaining({ status: JOB_STATUS.AUDIO_COMPLETED, progress: 50 }));
  });

  it('hands the avatar URL to asset preparation', async () => {
    await processVideoJob({ data: { jobId: 'job-1' } });
    expect(renderStep.prepareAssets.mock.calls[0][3]).toBe('http://x/avatar.mp4');
  });
});

describe('pauses', () => {
  it('stops after script generation when the script step asks for approval', async () => {
    scriptStep.run.mockImplementation(track('script', () => ({ success: true, jobId: 'job-1', awaitingApproval: true })));
    const result = await processVideoJob({ data: { jobId: 'job-1' } });
    expect(result).toMatchObject({ awaitingApproval: true });
    expect(calls).toEqual(['script']);
  });

  it('pauses after audio in manual mode, before spending image/render time', async () => {
    VideoService.getById.mockResolvedValue(job({ fastGeneration: false, status: JOB_STATUS.GENERATING_AUDIO }));
    const result = await processVideoJob({ data: { jobId: 'job-1' } });
    expect(result).toMatchObject({ awaitingRender: true });
    expect(calls).toEqual(['script', 'audio']);
  });

  it('continues into images and render once manual mode is triggered (status already past audio)', async () => {
    VideoService.getById.mockResolvedValue(job({ fastGeneration: false, status: JOB_STATUS.AUDIO_COMPLETED }));
    await processVideoJob({ data: { jobId: 'job-1' } });
    expect(calls).toEqual(['script', 'audio', 'avatar', 'images', 'assets', 'render', 'upload']);
  });
});

describe('cancellation', () => {
  it('returns a cancelled result without marking the job failed or scheduling a retry', async () => {
    renderStep.render.mockImplementation(async () => { throw new JobCancelledError('job-1'); });
    const result = await processVideoJob({ data: { jobId: 'job-1' } });

    expect(result).toEqual({ success: false, jobId: 'job-1', cancelled: true });
    expect(VideoService.fail).not.toHaveBeenCalled();
    expect(VideoService.scheduleRetry).not.toHaveBeenCalled();
    expect(uploadStep.run).not.toHaveBeenCalled();
  });

  it('treats a cancel raised in the image step the same way', async () => {
    imageStep.run.mockImplementation(async () => { throw new JobCancelledError('job-1'); });
    expect(await processVideoJob({ data: { jobId: 'job-1' } })).toMatchObject({ cancelled: true });
    expect(renderStep.prepareAssets).not.toHaveBeenCalled();
  });
});

describe('failures', () => {
  it('schedules an automatic retry (as a new delayed job) while the budget lasts', async () => {
    renderStep.render.mockImplementation(async () => { throw new Error('Remotion rendering failed: exit code 1'); });
    const result = await processVideoJob({ data: { jobId: 'job-1' } });

    expect(result).toMatchObject({ success: false, retryScheduled: true, attempt: 1 });
    expect(VideoService.scheduleRetry).toHaveBeenCalledWith('job-1', expect.objectContaining({ retryCount: 1 }));
    const [name, data, opts] = videoQueue.add.mock.calls[0];
    expect(name).toBe('render-video');
    expect(data).toEqual({ jobId: 'job-1' });
    expect(opts.delay).toBeGreaterThan(0);
    expect(opts.jobId).not.toBe('job-1'); // distinct id so it cannot collide with this attempt's record
    expect(VideoService.fail).not.toHaveBeenCalled();
  });

  it('records which step the failure happened in', async () => {
    imageStep.run.mockImplementation(async (_id, ctx) => { ctx.currentStep = JOB_STATUS.GENERATING_IMAGES; throw new Error('ComfyUI is down'); });
    await processVideoJob({ data: { jobId: 'job-1' } });
    expect(VideoService.scheduleRetry).toHaveBeenCalledWith('job-1', expect.objectContaining({ step: JOB_STATUS.GENERATING_IMAGES }));
  });

  it('fails the job for good, and rethrows, once retries are exhausted', async () => {
    VideoService.getById.mockResolvedValue(job({ error: { retryCount: 3 }, maxRetries: 3 }));
    renderStep.render.mockImplementation(async () => { throw new Error('boom'); });

    await expect(processVideoJob({ data: { jobId: 'job-1' } })).rejects.toThrow('boom');
    expect(VideoService.fail).toHaveBeenCalledWith('job-1', expect.any(String), expect.any(String), expect.objectContaining({ retryCount: 4 }));
    expect(SocketService.emitJobFailed).toHaveBeenCalled();
    expect(videoQueue.add).not.toHaveBeenCalled();
    expect(ActivityLogService.add).toHaveBeenCalledWith('job-1', expect.stringMatching(/failed|giving up|exhaust/i));
  });
});

describe('resuming an automatic retry', () => {
  it('resolves the real resume step from RETRY_SCHEDULED before running anything', async () => {
    VideoService.getById.mockResolvedValue(job({
      status: JOB_STATUS.RETRY_SCHEDULED,
      error: { step: JOB_STATUS.GENERATING_IMAGES },
      script: scriptBeforeImages,
    }));
    await processVideoJob({ data: { jobId: 'job-1' } });
    expect(VideoService.updateStatus).toHaveBeenCalledWith('job-1', JOB_STATUS.GENERATING_IMAGES, { progress: 56 });
  });
});
