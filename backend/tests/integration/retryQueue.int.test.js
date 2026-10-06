/**
 * Automatic retries, end to end, through a REAL Redis and a real BullMQ queue
 * and worker running the real processVideoJob.
 *
 * The unit tests mock the queue, and so could never see the bug that stranded
 * jobs for three weeks: BullMQ silently drops add() for a job id it still
 * holds, so a retry queued under the running attempt's id just vanished.
 * Only a real queue reproduces that. Mongo and the pipeline steps are
 * in-memory fakes - this is about the queue contract, not the steps.
 *
 * Runs only with RUN_REDIS_TESTS=1 (CI sets it and provides Redis), on a
 * throwaway queue name, so a plain `npm test` never touches a shared Redis.
 */
const RUN = process.env.RUN_REDIS_TESTS === '1';
jest.setTimeout(30000);
const describeRedis = RUN ? describe : describe.skip;

const connection = { host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT) || 6379 };
const mockQueueName = `vireon-test-retry-${process.pid}-${Date.now()}`;

// The real retry policy, with millisecond backoff so the test runs in seconds.
jest.mock('../../src/utils/backoff', () => ({ computeBackoffMs: (attempt) => 50 * attempt }));

jest.mock('../../src/queues/videoQueue', () => {
  const { Queue } = require('bullmq');
  return new Queue(mockQueueName, {
    connection: { host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT) || 6379 },
    defaultJobOptions: { attempts: 1, removeOnComplete: { age: 3600 }, removeOnFail: { age: 3600 } },
  });
});

jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), border: jest.fn(),
}));
jest.mock('../../src/services/common/ActivityLogService', () => ({ add: jest.fn().mockResolvedValue() }));
jest.mock('../../src/services/common/MetricsService', () => ({ recordDuration: jest.fn(), increment: jest.fn() }));
jest.mock('../../src/services/common/SocketService', () => ({ emitJobProgress: jest.fn(), emitJobFailed: jest.fn() }));
jest.mock('../../src/services/common/cancellationBus', () => ({ register: jest.fn(() => jest.fn()) }));
jest.mock('../../src/workers/videoWorker/scriptStep', () => ({ run: jest.fn() }));
jest.mock('../../src/workers/videoWorker/audioStep', () => ({ run: jest.fn() }));
jest.mock('../../src/workers/videoWorker/imageStep', () => ({ run: jest.fn() }));
jest.mock('../../src/workers/videoWorker/renderStep', () => ({ prepareAssets: jest.fn(async () => ({})), render: jest.fn() }));
jest.mock('../../src/workers/videoWorker/uploadStep', () => ({ run: jest.fn() }));

// An in-memory VideoJob mockStore that behaves like the real status updates:
// updateStatus clears `error` (that is what hid the retry count), and
// scheduleRetry/fail record it.
const mockStore = new Map();
const mockClone = (id) => (mockStore.has(id) ? JSON.parse(JSON.stringify(mockStore.get(id))) : null);
jest.mock('../../src/services/video/VideoService', () => ({
  getById: jest.fn(async (id) => {
    const doc = mockClone(id);
    if (doc) doc.createdAt = new Date(doc.createdAt);
    return doc;
  }),
  updateStatus: jest.fn(async (id, status, extra = {}) => {
    const doc = mockStore.get(id);
    doc.status = status;
    doc.progress = extra.progress ?? doc.progress;
    delete doc.error;
    return mockClone(id);
  }),
  scheduleRetry: jest.fn(async (id, { message, step, retryCount, nextRetryAt }) => {
    Object.assign(mockStore.get(id), { status: 'RETRY_SCHEDULED', error: { message, step, retryCount }, nextRetryAt });
    return mockClone(id);
  }),
  fail: jest.fn(async (id, message, step, { retryCount } = {}) => {
    Object.assign(mockStore.get(id), { status: 'FAILED', error: { message, step, retryCount } });
    return mockClone(id);
  }),
}));

const audioStep = require('../../src/workers/videoWorker/audioStep');
const uploadStep = require('../../src/workers/videoWorker/uploadStep');

const newJob = (id) =>
  mockStore.set(id, {
    _id: id,
    status: 'QUEUED',
    fastGeneration: true,
    maxRetries: 3,
    createdAt: new Date().toISOString(),
    script: { scenes: [{ sceneNumber: 1, audio: { text: 'hi' } }] },
  });

const waitFor = async (check, timeoutMs = 15000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('timed out waiting for the job to settle');
};

describeRedis('automatic retries through a real BullMQ queue', () => {
  let worker;
  let videoQueue;
  const ran = [];

  beforeAll(() => {
    const { Worker } = require('bullmq');
    const { processVideoJob } = require('../../src/workers/videoWorker/processor');
    videoQueue = require('../../src/queues/videoQueue');
    worker = new Worker(
      mockQueueName,
      async (job) => {
        ran.push(job.id);
        return processVideoJob(job);
      },
      { connection, concurrency: 1 }
    );
    uploadStep.run.mockImplementation(async (jobId) => {
      mockStore.get(jobId).status = 'COMPLETED';
      return { success: true, jobId };
    });
  });

  afterAll(async () => {
    await worker?.close();
    await videoQueue?.obliterate({ force: true }).catch(() => {});
    await videoQueue?.close();
  });

  beforeEach(() => {
    ran.length = 0;
    audioStep.run.mockReset();
  });

  it('a job that fails twice is retried twice under new ids, then completes', async () => {
    newJob('job-flaky');
    let calls = 0;
    audioStep.run.mockImplementation(async () => {
      calls += 1;
      if (calls <= 2) throw new Error('TTS service did not respond in time');
    });

    await videoQueue.add('render-video', { jobId: 'job-flaky' }, { jobId: 'job-flaky' });
    await waitFor(() => ['COMPLETED', 'FAILED'].includes(mockStore.get('job-flaky').status));

    expect(mockStore.get('job-flaky').status).toBe('COMPLETED');
    expect(ran).toHaveLength(3);
    expect(ran[0]).toBe('job-flaky');
    expect(ran[1]).toMatch(/^job-flaky:retry:1-\d+$/);
    expect(ran[2]).toMatch(/^job-flaky:retry:2-\d+$/);
  });

  it('a job that keeps failing ends FAILED once its 3 retries are used, not stranded', async () => {
    newJob('job-broken');
    audioStep.run.mockImplementation(async () => {
      throw new Error('TTS service did not respond in time');
    });

    await videoQueue.add('render-video', { jobId: 'job-broken' }, { jobId: 'job-broken' });
    await waitFor(() => mockStore.get('job-broken').status === 'FAILED');

    expect(ran).toHaveLength(4); // first attempt + 3 retries
    expect(mockStore.get('job-broken').error.retryCount).toBe(4);
    const live = await videoQueue.getJobs(['waiting', 'delayed', 'active']);
    expect(live.filter((j) => j.data.jobId === 'job-broken')).toEqual([]);
  });
});
