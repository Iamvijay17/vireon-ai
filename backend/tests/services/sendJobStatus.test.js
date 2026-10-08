/**
 * sendJobStatus builds the authoritative snapshot a (re)connecting client
 * applies. It must be resilient to transient store failures, must not treat
 * "not a video job" as an error, and must stamp enough identity (seq,
 * eventId, timestamp) for the client to ignore a stale or repeated snapshot.
 */
jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../src/utils/backoff', () => ({ computeBackoffMs: () => 1 }));
jest.mock('../../src/queues/courseQueue', () => ({ getWorkers: jest.fn().mockResolvedValue([]) }));
jest.mock('../../src/services/video/VideoService', () => ({ getById: jest.fn() }));
jest.mock('../../src/services/common/JobEventService', () => ({ latestSeq: jest.fn(), since: jest.fn() }));

const LoggerService = require('../../src/services/common/LoggerService');
const VideoService = require('../../src/services/video/VideoService');
const JobEventService = require('../../src/services/common/JobEventService');
const { NotFoundError } = require('../../src/utils/errors');
const { sendJobStatus } = require('../../src/services/common/socketService/connection');

const job = {
  _id: 'job-abc12345',
  status: 'GENERATING_AUDIO',
  progress: 42,
  currentStep: 'GENERATING_AUDIO',
  currentScene: 2,
  videoUrl: '',
  thumbnailUrl: '',
  updatedAt: new Date('2026-10-08T05:00:00.000Z'),
};

const makeSocket = () => ({ emit: jest.fn() });

beforeEach(() => {
  jest.clearAllMocks();
  JobEventService.latestSeq.mockResolvedValue(7);
});

describe('sendJobStatus', () => {
  it('emits the job snapshot with seq, eventId and timestamp', async () => {
    VideoService.getById.mockResolvedValue(job);
    const socket = makeSocket();

    await expect(sendJobStatus(job._id, socket)).resolves.toBe(true);

    const [event, payload] = socket.emit.mock.calls[0];
    expect(event).toBe('jobStatus');
    expect(payload).toMatchObject({ jobId: job._id, status: 'GENERATING_AUDIO', progress: 42, seq: 7 });
    expect(payload.eventId).toBe(`status:${job._id}:7:2026-10-08T05:00:00.000Z`);
    expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false);
  });

  it('gives the same eventId for the same state (idempotent re-send)', async () => {
    VideoService.getById.mockResolvedValue(job);
    const a = makeSocket();
    const b = makeSocket();
    await sendJobStatus(job._id, a);
    await sendJobStatus(job._id, b);
    expect(a.emit.mock.calls[0][1].eventId).toBe(b.emit.mock.calls[0][1].eventId);
  });

  it('reads latestSeq before the job so the snapshot is never older than its seq', async () => {
    const order = [];
    JobEventService.latestSeq.mockImplementation(async () => { order.push('seq'); return 3; });
    VideoService.getById.mockImplementation(async () => { order.push('job'); return job; });
    await sendJobStatus(job._id, makeSocket());
    expect(order).toEqual(['seq', 'job']);
  });

  it('treats a missing job as a quiet non-event, not an error', async () => {
    VideoService.getById.mockRejectedValue(new NotFoundError('Job not found'));
    const socket = makeSocket();

    await expect(sendJobStatus('aud-xyz', socket)).resolves.toBe(false);

    expect(socket.emit).not.toHaveBeenCalled();
    expect(LoggerService.error).not.toHaveBeenCalled();
    expect(LoggerService.warn).not.toHaveBeenCalled();
    expect(VideoService.getById).toHaveBeenCalledTimes(1); // no pointless retries
  });

  it('retries a transient failure and then delivers', async () => {
    VideoService.getById.mockRejectedValueOnce(new Error('connection reset')).mockResolvedValue(job);
    const socket = makeSocket();

    await expect(sendJobStatus(job._id, socket)).resolves.toBe(true);

    expect(socket.emit).toHaveBeenCalledTimes(1); // delivered once, not once per attempt
    expect(LoggerService.warn).toHaveBeenCalledWith('[Socket] job status retry 1/2', expect.objectContaining({ jobId: job._id }));
    expect(LoggerService.error).not.toHaveBeenCalled();
  });

  it('logs the real error with context when retries are exhausted', async () => {
    VideoService.getById.mockRejectedValue(new Error('Mongo went away'));
    const socket = makeSocket();

    await expect(sendJobStatus(job._id, socket)).resolves.toBe(false);

    expect(socket.emit).not.toHaveBeenCalled();
    expect(LoggerService.error).toHaveBeenCalledWith(
      '[Socket] failed to send job status after 3 attempts',
      expect.objectContaining({ jobId: job._id, error: 'Mongo went away' })
    );
  });
});
