jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn(), debug: jest.fn(),
}));

const mockJobs = [];
jest.mock('../../src/models/VideoJob', () => ({ find: jest.fn(async () => mockJobs) }));
jest.mock('../../src/queues/videoQueue', () => ({ getJob: jest.fn(async () => null) }));
jest.mock('../../src/services/video/videoQueueJobs', () => ({
  findLiveJobs: jest.fn(async () => []),
  ensureScheduledRetry: jest.fn(async () => true),
}));
jest.mock('../../src/services/video/VideoService', () => ({
  scheduleRetry: jest.fn(),
  fail: jest.fn(async (id) => ({ _id: id, error: { message: 'failed' } })),
}));
jest.mock('../../src/services/common/SocketService', () => ({ emitJobProgress: jest.fn(), emitJobFailed: jest.fn() }));
jest.mock('../../src/services/common/ActivityLogService', () => ({ add: jest.fn(async () => {}) }));
jest.mock('../../src/services/pipeline/stageTracker', () => ({ markInterrupted: jest.fn(async () => 'audio') }));

const config = require('../../src/config');
const VideoService = require('../../src/services/video/VideoService');
const videoQueueJobs = require('../../src/services/video/videoQueueJobs');
const ActivityLogService = require('../../src/services/common/ActivityLogService');
const { reapStuckVideoJobs } = require('../../src/startup/recovery');

const stuckJob = (over = {}) => ({ _id: 'job1', status: 'GENERATING_AUDIO', maxRetries: 3, error: null, ...over });

beforeEach(() => {
  mockJobs.length = 0;
  VideoService.scheduleRetry.mockImplementation(async (id, opts) => ({
    _id: id, status: 'RETRY_SCHEDULED', nextRetryAt: opts.nextRetryAt, error: { retryCount: opts.retryCount },
  }));
});

describe('boot sweep: interrupted video jobs', () => {
  it('resumes an interrupted job on its own instead of parking it as failed', async () => {
    mockJobs.push(stuckJob());
    await reapStuckVideoJobs();

    expect(VideoService.scheduleRetry).toHaveBeenCalledWith('job1', expect.objectContaining({
      step: 'GENERATING_AUDIO',
      retryCount: 1,
      fromStatus: 'GENERATING_AUDIO',
      structured: expect.objectContaining({ code: 'JOB_STALLED', stage: 'audio', retryable: true }),
    }));
    expect(videoQueueJobs.ensureScheduledRetry).toHaveBeenCalledTimes(1);
    expect(VideoService.fail).not.toHaveBeenCalled();
    expect(ActivityLogService.add).toHaveBeenCalledWith('job1', expect.stringMatching(/retrying in \d+s/));
  });

  it('spends a retry from the budget each time, so a crash loop terminates', async () => {
    mockJobs.push(stuckJob({ error: { retryCount: 3 }, maxRetries: 3 }));
    await reapStuckVideoJobs();

    expect(VideoService.scheduleRetry).not.toHaveBeenCalled();
    expect(VideoService.fail).toHaveBeenCalledWith('job1', expect.stringMatching(/Click Restart Job/), 'GENERATING_AUDIO', expect.anything());
  });

  it('continues the attempt count from earlier retries', async () => {
    mockJobs.push(stuckJob({ error: { retryCount: 1 } }));
    await reapStuckVideoJobs();
    expect(VideoService.scheduleRetry).toHaveBeenCalledWith('job1', expect.objectContaining({ retryCount: 2 }));
  });

  it('leaves a job alone when another process has already scheduled it', async () => {
    VideoService.scheduleRetry.mockResolvedValue(null); // lost the conditional update
    mockJobs.push(stuckJob());
    await reapStuckVideoJobs();

    expect(VideoService.fail).not.toHaveBeenCalled();
    expect(videoQueueJobs.ensureScheduledRetry).not.toHaveBeenCalled();
  });

  it('falls back to failing the job if it cannot be re-queued', async () => {
    videoQueueJobs.ensureScheduledRetry.mockRejectedValueOnce(new Error('redis down'));
    mockJobs.push(stuckJob());
    await reapStuckVideoJobs();
    expect(VideoService.fail).toHaveBeenCalledTimes(1);
  });

  it('does not touch a job a live queue entry still backs', async () => {
    videoQueueJobs.findLiveJobs.mockResolvedValueOnce([{ id: 'live' }]);
    mockJobs.push(stuckJob());
    await reapStuckVideoJobs();
    expect(VideoService.scheduleRetry).not.toHaveBeenCalled();
    expect(VideoService.fail).not.toHaveBeenCalled();
  });

  describe('AUTO_RESUME_INTERRUPTED_JOBS=false', () => {
    const original = config.recovery.autoResumeInterrupted;
    beforeAll(() => { config.recovery.autoResumeInterrupted = false; });
    afterAll(() => { config.recovery.autoResumeInterrupted = original; });

    it('restores the old behaviour: fail and wait for a manual Restart', async () => {
      mockJobs.push(stuckJob());
      await reapStuckVideoJobs();
      expect(VideoService.scheduleRetry).not.toHaveBeenCalled();
      expect(VideoService.fail).toHaveBeenCalledTimes(1);
    });
  });
});
