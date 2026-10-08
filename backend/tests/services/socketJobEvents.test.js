/**
 * socketService/jobEvents.record() is where a persisted job event becomes a
 * live packet. These tests pin the delivery contract the frontend relies on:
 * the live payload and the stored event share one identity, a failed write
 * does not cost the live update, repeats are distinguishable only by
 * eventId, and a throwing dispatch is logged instead of becoming an
 * unhandled rejection.
 */
jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../src/services/common/JobEventService', () => ({
  newEventId: jest.fn(),
  append: jest.fn(),
}));
// Pub/sub path: the worker process publishes over Redis instead of emitting.
jest.mock('../../src/services/common/socketService/redisBridge', () => ({ publish: jest.fn() }));

const LoggerService = require('../../src/services/common/LoggerService');
const JobEventService = require('../../src/services/common/JobEventService');
const { publish } = require('../../src/services/common/socketService/redisBridge');
const { state } = require('../../src/services/common/socketService/state');
const { emitJobProgress, emitJobFailed } = require('../../src/services/common/socketService/jobEvents');

const job = { _id: 'job-abc12345', status: 'RENDERING', progress: 50, currentStep: 'RENDERING', currentScene: 1 };

// record() is fire-and-forget; wait for the append -> dispatch chain it starts.
const flush = () => new Promise((resolve) => setImmediate(resolve));

let io;
beforeEach(() => {
  jest.clearAllMocks();
  let n = 0;
  JobEventService.newEventId.mockImplementation(() => `evt-${(n += 1)}`);
  JobEventService.append.mockImplementation(async (jobId, type, data, opts) => ({ ...opts, jobId, type, data, seq: 7 }));
  io = { to: jest.fn(() => ({ emit: jest.fn() })), emit: jest.fn() };
  state.io = io;
});
afterEach(() => {
  state.io = null;
});

describe('jobEvents.record (via emitJobProgress)', () => {
  it('emits the stored event: same eventId, its seq, an ISO timestamp', async () => {
    const roomEmit = jest.fn();
    io.to.mockReturnValue({ emit: roomEmit });

    emitJobProgress(job);
    await flush();

    expect(io.to).toHaveBeenCalledWith('job:job-abc12345');
    const [event, payload] = roomEmit.mock.calls[0];
    expect(event).toBe('jobProgress');
    expect(payload).toMatchObject({ jobId: job._id, progress: 50, eventId: 'evt-1', seq: 7 });
    expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false);
    // The stored copy was written under the very same identity.
    expect(JobEventService.append).toHaveBeenCalledWith(job._id, 'jobProgress', expect.any(Object), expect.objectContaining({ eventId: 'evt-1' }));
  });

  it('still delivers the live update, without a seq, when the event could not be persisted', async () => {
    JobEventService.append.mockResolvedValue(null); // what append() returns after exhausting its retries
    const roomEmit = jest.fn();
    io.to.mockReturnValue({ emit: roomEmit });

    emitJobProgress(job);
    await flush();

    const payload = roomEmit.mock.calls[0][1];
    expect(payload.eventId).toBe('evt-1');
    expect(payload).not.toHaveProperty('seq');
  });

  it('gives every repeat of identical content its own eventId, so clients dedupe by id and never drop real updates', async () => {
    const roomEmit = jest.fn();
    io.to.mockReturnValue({ emit: roomEmit });

    emitJobProgress(job);
    emitJobProgress(job);
    await flush();

    const ids = roomEmit.mock.calls.map(([, payload]) => payload.eventId);
    expect(ids).toEqual(['evt-1', 'evt-2']);
  });

  it('publishes over Redis from the worker process (no Socket.IO server there)', async () => {
    state.io = null;

    emitJobFailed({ _id: job._id, status: 'FAILED', error: { message: 'boom' } }, 'boom');
    await flush();

    expect(publish).toHaveBeenCalledWith(job._id, 'jobFailed', expect.objectContaining({ eventId: 'evt-1', seq: 7, error: 'boom' }));
  });

  it('logs a throwing dispatch with jobId/eventId/type instead of leaving an unhandled rejection', async () => {
    const rejections = [];
    const onRejection = (reason) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);
    try {
      io.to.mockImplementation(() => { throw new Error('socket server gone'); });

      emitJobProgress(job);
      await flush();
      await flush();

      expect(LoggerService.error).toHaveBeenCalledWith(
        '[Job Event] failed to dispatch live event',
        expect.objectContaining({ jobId: job._id, eventId: 'evt-1', type: 'jobProgress', error: 'socket server gone' })
      );
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
  });
});
