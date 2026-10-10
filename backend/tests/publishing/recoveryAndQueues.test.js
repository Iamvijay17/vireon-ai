jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), border: jest.fn(),
}));
jest.mock('../../src/models/PublishingJob', () => {
  const model = require('./helpers/fakeMongo').makeJobModel();
  model.ACTIVE_STATUSES = ['VALIDATING', 'UPLOADING', 'PROCESSING'];
  return model;
});
const mockQueueCtor = jest.fn();
jest.mock('bullmq', () => ({
  Queue: class FakeQueue {
    constructor(name, options) { mockQueueCtor(name, options); this.name = name; this.on = jest.fn(); }
  },
}));

const PublishingJob = require('../../src/models/PublishingJob');
const { sweepPublishingJobs } = require('../../src/services/publishing/recovery');
const PublishingJobStore = require('../../src/services/publishing/PublishingJobStore');
const { getQueue, QUEUE_NAMES } = require('../../src/queues/publishingQueues');

const NOW = Date.parse('2026-10-10T12:00:00Z');
const at = (ms) => new Date(NOW + ms);
const seed = (over) => PublishingJob.seed({ platform: 'youtube', ownerId: 'local', attempts: 1, ...over });

beforeEach(() => { PublishingJob.reset(); jest.clearAllMocks(); });

describe('publishing queues', () => {
  it('uses separate queues for YouTube uploads, package exports and social posts', () => {
    expect(QUEUE_NAMES).toEqual({ youtube: 'youtube-publishing', export: 'course-export', social: 'social-publishing' });
  });

  it('leaves retries to the application: one BullMQ attempt, bounded retention', () => {
    getQueue('youtube');
    getQueue('export');
    expect(mockQueueCtor).toHaveBeenCalledTimes(2);
    for (const [, options] of mockQueueCtor.mock.calls) {
      expect(options.defaultJobOptions.attempts).toBe(1);
      expect(options.defaultJobOptions.removeOnComplete).toBeDefined();
      expect(options.defaultJobOptions.removeOnFail).toBeDefined();
    }
  });

  it('creates each queue once and refuses unknown kinds', () => {
    const a = getQueue('youtube');
    expect(getQueue('youtube')).toBe(a);
    expect(() => getQueue('tiktok')).toThrow(/Unknown publishing queue/);
  });
});

describe('recovery sweep after a restart or Redis loss', () => {
  const sweep = async () => {
    const enqueue = jest.fn(async () => {});
    const count = await sweepPublishingJobs({ platform: 'youtube', enqueue, now: () => NOW });
    return { count, enqueue, ids: enqueue.mock.calls.map(([job]) => job._id) };
  };

  it('re-enqueues a job that was saved as QUEUED but never reached the queue', async () => {
    const lost = seed({ status: 'QUEUED', queuedAt: at(-120_000) });
    const { ids, enqueue } = await sweep();
    expect(ids).toEqual([lost._id]);
    expect(enqueue.mock.calls[0][1].jobId).toMatch(new RegExp(`^${lost._id}:retry:1-\\d+$`));
  });

  it('leaves a job that was queued a moment ago to its own enqueue', async () => {
    seed({ status: 'QUEUED', queuedAt: at(-1000) });
    expect((await sweep()).count).toBe(0);
  });

  it('re-enqueues retries and processing re-checks whose time has come, but not future ones', async () => {
    const due = seed({ status: 'RETRYING', nextRetryAt: at(-1000) });
    const check = seed({ status: 'PROCESSING', nextRetryAt: at(-1), remote: { videoId: 'V' } });
    seed({ status: 'RETRYING', nextRetryAt: at(60_000) });
    seed({ status: 'PROCESSING', nextRetryAt: at(60_000) });
    expect((await sweep()).ids.sort()).toEqual([due._id, check._id].sort());
  });

  it('re-enqueues a job whose worker died (expired lease), but not one with a live lease', async () => {
    const dead = seed({ status: 'UPLOADING', lease: { owner: 'w-dead', expiresAt: at(-5000) } });
    seed({ status: 'UPLOADING', lease: { owner: 'w-alive', expiresAt: at(60_000) } });
    expect((await sweep()).ids).toEqual([dead._id]);
  });

  it('ignores finished jobs, drafts, and other platforms', async () => {
    seed({ status: 'COMPLETED' });
    seed({ status: 'FAILED' });
    seed({ status: 'CANCELLED' });
    seed({ status: 'DRAFT' });
    seed({ status: 'QUEUED', queuedAt: at(-120_000), platform: 'udemy-export' });
    expect((await sweep()).count).toBe(0);
  });

  it('uses ids that match the normal path, so a duplicate delivery is dropped by BullMQ and by the claim', async () => {
    const queuedAt = at(-120_000);
    const job = seed({ status: 'QUEUED', queuedAt });
    const { enqueue } = await sweep();
    // PublishingService.enqueue derives its id from (attempts, queuedAt) - same inputs, same id.
    const { retryJobId } = require('../../src/services/common/retryPolicy');
    expect(enqueue.mock.calls[0][1].jobId).toBe(retryJobId(job._id, 1, queuedAt.getTime()));
  });

  it('keeps going when one job cannot be re-enqueued', async () => {
    seed({ status: 'QUEUED', queuedAt: at(-120_000) });
    const second = seed({ status: 'QUEUED', queuedAt: at(-130_000) });
    const enqueue = jest.fn().mockRejectedValueOnce(new Error('redis down')).mockResolvedValue();
    const count = await sweepPublishingJobs({ platform: 'youtube', enqueue, now: () => NOW });
    expect(count).toBe(1);
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(second).toBeDefined();
  });

  it('a recovered job can then be claimed exactly once', async () => {
    const lost = seed({ status: 'QUEUED', queuedAt: at(-120_000) });
    const store = new PublishingJobStore({ now: () => NOW });
    const [a, b] = await Promise.all([store.claim(lost._id, 'w1'), store.claim(lost._id, 'w2')]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(PublishingJob.rows[0]).toMatchObject({ status: 'VALIDATING', attempts: 2 });
  });
});

describe('job store guards', () => {
  const store = () => new PublishingJobStore({ now: () => NOW });

  it('refuses writes from a worker that does not hold the lease', async () => {
    const job = seed({ status: 'UPLOADING', lease: { owner: 'w1', expiresAt: at(60_000) } });
    expect(await store().patch(job._id, 'w2', { set: { 'progress.percent': 50 } })).toBeNull();
    expect(PublishingJob.rows[0].progress.percent).toBe(0);
    expect(await store().patch(job._id, 'w1', { set: { 'progress.percent': 50 } })).not.toBeNull();
  });

  it('refuses writes once the job is no longer active (cancelled underneath the worker)', async () => {
    const job = seed({ status: 'CANCELLED', lease: { owner: 'w1', expiresAt: at(60_000) } });
    expect(await store().patch(job._id, 'w1', { set: { 'progress.percent': 50 } })).toBeNull();
  });

  it('renews the lease on every write', async () => {
    const job = seed({ status: 'UPLOADING', lease: { owner: 'w1', expiresAt: at(1000) } });
    await store().patch(job._id, 'w1', {});
    expect(new Date(PublishingJob.rows[0].lease.expiresAt).getTime()).toBeGreaterThan(NOW + 60_000);
  });

  it('caps the event history so a long-lived job document cannot grow without bound', async () => {
    const job = seed({ status: 'UPLOADING', lease: { owner: 'w1', expiresAt: at(60_000) } });
    for (let i = 0; i < 100; i += 1) await store().patch(job._id, 'w1', { ev: ['UPLOADING', `event ${i}`] });
    expect(PublishingJob.rows[0].events).toHaveLength(60);
    expect(PublishingJob.rows[0].events.at(-1).message).toBe('event 99');
  });
});
