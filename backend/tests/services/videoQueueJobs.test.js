/**
 * Live-job lookups for a video job must see its automatic retries, which run
 * under their own `:retry:` BullMQ id rather than the video job's id.
 */
const mockQueue = { getJobs: jest.fn(), getJob: jest.fn(), add: jest.fn() };
jest.mock('../../src/queues/videoQueue', () => mockQueue);

const videoQueueJobs = require('../../src/services/video/videoQueueJobs');

const bullJob = (id, jobId, state) => ({
  id,
  data: { jobId },
  getState: jest.fn().mockResolvedValue(state),
  remove: jest.fn().mockResolvedValue(),
});

beforeEach(() => {
  jest.clearAllMocks();
  mockQueue.getJobs.mockResolvedValue([]);
  mockQueue.getJob.mockResolvedValue(null);
  mockQueue.add.mockResolvedValue();
});

describe('findLiveJobs / isActive', () => {
  it('finds a running retry by the video job it points at, not by its own id', async () => {
    const retry = bullJob('job-1:retry:2-123', 'job-1', 'active');
    mockQueue.getJobs.mockResolvedValue([retry, bullJob('job-2', 'job-2', 'waiting')]);

    expect(await videoQueueJobs.findLiveJobs('job-1')).toEqual([retry]);
    expect(await videoQueueJobs.isActive('job-1')).toBe(true);
    expect(await videoQueueJobs.isActive('job-3')).toBe(false);
  });
});

describe('removePending', () => {
  it('removes a delayed retry but never the attempt a worker is running', async () => {
    const running = bullJob('job-1', 'job-1', 'active');
    const delayed = bullJob('job-1:retry:1-5', 'job-1', 'delayed');
    mockQueue.getJobs.mockResolvedValue([running, delayed]);

    expect(await videoQueueJobs.removePending('job-1')).toBe(1);
    expect(delayed.remove).toHaveBeenCalled();
    expect(running.remove).not.toHaveBeenCalled();
  });
});

describe('ensureScheduledRetry', () => {
  const stranded = {
    _id: 'job-1',
    nextRetryAt: new Date('2026-09-13T21:03:10.515Z'),
    error: { retryCount: 1 },
  };

  it('re-queues an overdue retry that is missing from the queue, to run now', async () => {
    expect(await videoQueueJobs.ensureScheduledRetry(stranded)).toBe(true);

    const [name, data, opts] = mockQueue.add.mock.calls[0];
    expect(name).toBe('render-video');
    expect(data).toEqual({ jobId: 'job-1' });
    expect(opts).toEqual({ jobId: `job-1:retry:1-${stranded.nextRetryAt.getTime()}`, delay: 0 });
  });

  it('leaves a job alone when its retry is still queued', async () => {
    mockQueue.getJobs.mockResolvedValue([bullJob('job-1:retry:1-9', 'job-1', 'delayed')]);
    expect(await videoQueueJobs.ensureScheduledRetry(stranded)).toBe(false);
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('clears a finished record under the same id so the add is not a silent no-op', async () => {
    const old = bullJob(videoQueueJobs.scheduledRetryId(stranded), 'job-1', 'completed');
    mockQueue.getJob.mockResolvedValue(old);

    await videoQueueJobs.ensureScheduledRetry(stranded);
    expect(old.remove).toHaveBeenCalled();
    expect(mockQueue.add).toHaveBeenCalled();
  });

  it('computes the same id the worker used, so two processes cannot both queue it', () => {
    // processor.js: retryJobId(jobId, attempt, retry.nextRetryAt.getTime())
    const { retryJobId } = require('../../src/services/common/retryPolicy');
    expect(videoQueueJobs.scheduledRetryId(stranded)).toBe(retryJobId('job-1', 1, stranded.nextRetryAt.getTime()));
  });
});
