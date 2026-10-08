/**
 * JobEventService is the durable half of job-event delivery: every Socket.IO
 * packet a client may have missed is recoverable from what it stores. These
 * tests pin the guarantees that matter - a write that fails transiently is
 * retried without duplicating, one job's events keep their order, and a write
 * that never succeeds is reported loudly rather than swallowed.
 */
jest.mock('mongoose', () => ({ connection: { readyState: 1 } }));
jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));
// Real backoff is 200ms+; the schedule itself isn't what's under test.
jest.mock('../../src/utils/backoff', () => ({ computeBackoffMs: () => 1 }));

const mockStore = { counters: new Map(), events: new Map(), failNext: [], opLog: [] };

jest.mock('../../src/models/JobEvent', () => ({
  JobEventCounter: {
    findByIdAndUpdate: jest.fn(async (id) => {
      if (mockStore.failNext.length) throw mockStore.failNext.shift();
      const seq = (mockStore.counters.get(id) || 0) + 1;
      mockStore.counters.set(id, seq);
      return { seq };
    }),
  },
  JobEvent: {
    updateOne: jest.fn(async ({ jobId, eventId }, update) => {
      if (mockStore.failNext.length) throw mockStore.failNext.shift();
      const key = `${jobId}|${eventId}`;
      // $setOnInsert semantics: an existing (jobId, eventId) is left untouched.
      if (!mockStore.events.has(key)) {
        mockStore.events.set(key, { jobId, eventId, ...update.$setOnInsert });
        mockStore.opLog.push(`${jobId}:${update.$setOnInsert.type}`);
      }
    }),
  },
}));

const mongoose = require('mongoose');
const LoggerService = require('../../src/services/common/LoggerService');
const { JobEventCounter } = require('../../src/models/JobEvent');
const JobEventService = require('../../src/services/common/JobEventService');

const stored = () => [...mockStore.events.values()];

beforeEach(() => {
  mockStore.counters.clear();
  mockStore.events.clear();
  mockStore.failNext = [];
  mockStore.opLog = [];
  mongoose.connection.readyState = 1;
  jest.clearAllMocks();
});

describe('JobEventService.append', () => {
  it('stores an event with a unique eventId and a per-job seq', async () => {
    const a = await JobEventService.append('job-a', 'jobProgress', { progress: 10 });
    const b = await JobEventService.append('job-a', 'jobProgress', { progress: 20 });

    expect(a).toMatchObject({ jobId: 'job-a', seq: 1, type: 'jobProgress' });
    expect(b.seq).toBe(2);
    expect(a.eventId).toBeTruthy();
    expect(a.eventId).not.toBe(b.eventId);
    expect(stored()).toHaveLength(2);
  });

  it('keeps a caller-supplied eventId so the live payload and stored event share one identity', async () => {
    const event = await JobEventService.append('job-a', 'jobProgress', {}, { eventId: 'evt-fixed' });
    expect(event.eventId).toBe('evt-fixed');
    expect(stored()[0].eventId).toBe('evt-fixed');
  });

  it('retries a transient failure and persists exactly once', async () => {
    mockStore.failNext = [new Error('connection reset'), new Error('connection reset')];

    const event = await JobEventService.append('job-a', 'jobProgress', { progress: 5 });

    expect(event).toMatchObject({ seq: 1 });
    expect(stored()).toHaveLength(1);
    expect(LoggerService.warn).toHaveBeenCalledWith('[Job Event] retry 1/3', expect.objectContaining({ jobId: 'job-a', type: 'jobProgress' }));
    expect(LoggerService.warn).toHaveBeenCalledWith('[Job Event] retry 2/3', expect.anything());
    expect(LoggerService.info).toHaveBeenCalledWith('[Job Event] persisted successfully', expect.objectContaining({ attempt: 3 }));
    expect(LoggerService.error).not.toHaveBeenCalled();
  });

  it('does not burn a second seq when only the event write is retried', async () => {
    // First call succeeds at the counter, fails at the event write.
    JobEventCounter.findByIdAndUpdate.mockImplementationOnce(async (id) => {
      mockStore.counters.set(id, 1);
      return { seq: 1 };
    });
    const { JobEvent } = require('../../src/models/JobEvent');
    JobEvent.updateOne.mockRejectedValueOnce(new Error('timeout'));

    const event = await JobEventService.append('job-a', 'jobProgress', {});

    expect(event.seq).toBe(1);
    expect(JobEventCounter.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(stored()).toHaveLength(1);
  });

  it('is idempotent: re-appending the same eventId never creates a second document', async () => {
    await JobEventService.append('job-a', 'jobProgress', {}, { eventId: 'evt-1' });
    await JobEventService.append('job-a', 'jobProgress', {}, { eventId: 'evt-1' });
    expect(stored()).toHaveLength(1);
  });

  it('reports a final failure loudly with jobId, eventId, type, retry count and the real error', async () => {
    mockStore.failNext = Array.from({ length: 10 }, () => new Error('E11000 something real'));

    const event = await JobEventService.append('job-a', 'sceneAudioReady', {}, { eventId: 'evt-x' });

    expect(event).toBeNull();
    expect(stored()).toHaveLength(0);
    expect(LoggerService.error).toHaveBeenCalledTimes(1);
    expect(LoggerService.error).toHaveBeenCalledWith(
      '[Job Event] persistence failed after 4 attempts',
      expect.objectContaining({
        jobId: 'job-a', eventId: 'evt-x', type: 'sceneAudioReady', retryCount: 3, error: 'E11000 something real',
      })
    );
  });

  it('fails fast instead of buffering when Mongo is not connected', async () => {
    mongoose.connection.readyState = 0;

    const event = await JobEventService.append('job-a', 'jobProgress', {});

    expect(event).toBeNull();
    expect(JobEventCounter.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(LoggerService.error).toHaveBeenCalledWith(
      expect.stringContaining('persistence failed'),
      expect.objectContaining({ error: 'MongoDB is not connected' })
    );
  });

  it('preserves order within a job even when an earlier event needs retries', async () => {
    mockStore.failNext = [new Error('blip')]; // first event's counter bump fails once

    const results = await Promise.all([
      JobEventService.append('job-a', 'first', {}),
      JobEventService.append('job-a', 'second', {}),
      JobEventService.append('job-a', 'third', {}),
    ]);

    expect(results.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(mockStore.opLog).toEqual(['job-a:first', 'job-a:second', 'job-a:third']);
  });

  it('ignores calls without a jobId or type', async () => {
    expect(await JobEventService.append('', 'x')).toBeNull();
    expect(await JobEventService.append('job-a', '')).toBeNull();
    expect(stored()).toHaveLength(0);
  });
});
