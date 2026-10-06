/**
 * Course videos have the same automatic-retry state as video jobs, so they
 * need the same recovery when the delayed BullMQ job behind it goes missing.
 */
const mockQueue = { getJobs: jest.fn(), getJob: jest.fn(), add: jest.fn() };
jest.mock('../../src/queues/courseQueue', () => mockQueue);

const courseQueueJobs = require('../../src/services/course/courseQueueJobs');

const bullJob = (id, videoId, state) => ({ id, data: { videoId }, getState: jest.fn().mockResolvedValue(state), remove: jest.fn().mockResolvedValue() });
const stranded = (step) => ({
  _id: 'vid-1',
  status: 'Retry Scheduled',
  nextRetryAt: new Date('2026-09-20T10:00:00Z'),
  error: { step, retryCount: 2 },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockQueue.getJobs.mockResolvedValue([]);
  mockQueue.getJob.mockResolvedValue(null);
  mockQueue.add.mockResolvedValue();
});

describe('ensureScheduledRetry', () => {
  it.each([
    ['Script Generation', 'generate-script'],
    ['Audio Generation', 'generate-audio'],
    ['Rendering', 'render'],
  ])('re-queues a stranded %s retry as %s, due now', async (step, action) => {
    const video = stranded(step);
    expect(await courseQueueJobs.ensureScheduledRetry(video)).toBe(action);
    expect(mockQueue.add).toHaveBeenCalledWith(action, { videoId: 'vid-1', action }, {
      jobId: `vid-1:retry:2-${video.nextRetryAt.getTime()}`,
      delay: 0,
    });
  });

  it('leaves a video alone while its retry is still queued', async () => {
    mockQueue.getJobs.mockResolvedValue([bullJob('vid-1:retry:2-1', 'vid-1', 'delayed'), bullJob('x', 'vid-2', 'waiting')]);
    expect(await courseQueueJobs.ensureScheduledRetry(stranded('Rendering'))).toBeNull();
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it("does nothing for a step it can't map back to an action", async () => {
    expect(await courseQueueJobs.ensureScheduledRetry(stranded('Something else'))).toBeNull();
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('clears a finished record under the same id first', async () => {
    const video = stranded('Audio Generation');
    const old = bullJob(courseQueueJobs.scheduledRetryId(video), 'vid-1', 'completed');
    mockQueue.getJob.mockResolvedValue(old);
    await courseQueueJobs.ensureScheduledRetry(video);
    expect(old.remove).toHaveBeenCalled();
    expect(mockQueue.add).toHaveBeenCalled();
  });
});
