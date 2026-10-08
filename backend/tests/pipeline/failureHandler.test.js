jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../src/services/common/ActivityLogService', () => ({ add: jest.fn().mockResolvedValue() }));
jest.mock('../../src/services/common/SocketService', () => ({ emitJobFailed: jest.fn() }));
jest.mock('../../src/services/video/VideoService', () => ({ fail: jest.fn() }));
jest.mock('../../src/services/pipeline/stageTracker', () => ({ markInterrupted: jest.fn() }));
jest.mock('../../src/models/VideoJob', () => ({ findById: jest.fn() }));

const VideoJob = require('../../src/models/VideoJob');
const VideoService = require('../../src/services/video/VideoService');
const SocketService = require('../../src/services/common/SocketService');
const stageTracker = require('../../src/services/pipeline/stageTracker');
const { recordUnhandledFailure } = require('../../src/workers/videoWorker/failureHandler');
const { JOB_STATUS } = require('../../src/constants');

const stored = (job) => VideoJob.findById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(job) }) });

beforeEach(() => {
  jest.clearAllMocks();
  VideoService.fail.mockResolvedValue({ _id: 'j1', status: JOB_STATUS.FAILED });
  stageTracker.markInterrupted.mockResolvedValue('audio');
});

describe('recordUnhandledFailure', () => {
  it('marks a stalled job that is still in flight as FAILED with a retryable JOB_STALLED error', async () => {
    stored({ _id: 'j1', status: JOB_STATUS.GENERATING_AUDIO, error: null });

    await recordUnhandledFailure({ data: { jobId: 'j1' } }, new Error('job stalled more than allowable limit'));

    expect(stageTracker.markInterrupted).toHaveBeenCalled();
    expect(VideoService.fail).toHaveBeenCalledWith(
      'j1',
      expect.stringMatching(/stopped responding/i),
      JOB_STATUS.GENERATING_AUDIO,
      expect.objectContaining({ structured: expect.objectContaining({ code: 'JOB_STALLED', retryable: true, stage: 'audio' }) })
    );
    expect(SocketService.emitJobFailed).toHaveBeenCalled();
  });

  it('does nothing for a job the processor already recorded as FAILED', async () => {
    stored({ _id: 'j1', status: JOB_STATUS.FAILED });
    expect(await recordUnhandledFailure({ data: { jobId: 'j1' } }, new Error('boom'))).toBeNull();
    expect(VideoService.fail).not.toHaveBeenCalled();
  });

  it('leaves a scheduled retry and a cancelled job alone', async () => {
    for (const status of [JOB_STATUS.RETRY_SCHEDULED, JOB_STATUS.CANCELLED, JOB_STATUS.COMPLETED, JOB_STATUS.AWAITING_APPROVAL]) {
      stored({ _id: 'j1', status });
      expect(await recordUnhandledFailure({ data: { jobId: 'j1' } }, new Error('boom'))).toBeNull();
    }
    expect(VideoService.fail).not.toHaveBeenCalled();
  });

  it('ignores a BullMQ job with no jobId and a job that no longer exists', async () => {
    expect(await recordUnhandledFailure({ data: {} }, new Error('x'))).toBeNull();
    stored(null);
    expect(await recordUnhandledFailure({ data: { jobId: 'gone' } }, new Error('x'))).toBeNull();
    expect(VideoService.fail).not.toHaveBeenCalled();
  });

  it('never throws, even if the database does', async () => {
    VideoJob.findById.mockImplementation(() => { throw new Error('mongo down'); });
    await expect(recordUnhandledFailure({ data: { jobId: 'j1' } }, new Error('x'))).resolves.toBeNull();
  });
});
