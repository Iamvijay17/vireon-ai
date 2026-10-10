jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), border: jest.fn(),
}));
jest.mock('../../src/services/publishing/PublishingEvents', () => ({ emitJob: jest.fn(), emitAccount: jest.fn() }));
jest.mock('../../src/models/PublishingJob', () => {
  const model = require('./helpers/fakeMongo').makeJobModel();
  model.ACTIVE_STATUSES = ['VALIDATING', 'UPLOADING', 'PROCESSING'];
  return model;
});
jest.mock('../../src/models/PlatformAccount', () => {
  const model = require('./helpers/fakeMongo').makeAccountModel();
  model.ACCOUNT_STATUS = { CONNECTED: 'connected', NEEDS_REAUTH: 'needs_reauth' };
  return model;
});

const config = require('../../src/config');
const PublishingJob = require('../../src/models/PublishingJob');
const PlatformAccount = require('../../src/models/PlatformAccount');
const cipher = require('../../src/services/publishing/crypto');
const events = require('../../src/services/publishing/PublishingEvents');
const PublishingJobStore = require('../../src/services/publishing/PublishingJobStore');
const { processYouTubeJob, PROCESSING_RECHECK_MS } = require('../../src/services/publishing/youtube/processYouTubeJob');
const { PublishError } = require('../../src/services/publishing/errors');
const { nextQuotaReset } = require('../../src/services/publishing/quota');
const { KEY, OWNER, IDS, storageFake, settingsFor } = require('./helpers/harness');

const CHUNK = 256 * 1024;
const SIZE = CHUNK * 3;
const SOURCE = { bucket: 'vireon-video', key: `${IDS.video}/final.mp4`, size: SIZE, etag: 'etag-1', contentType: 'video/mp4', fileName: 'x.mp4' };
const META = {
  title: 'Closures', description: 'desc', tags: ['js'], categoryId: '27', language: 'en', privacyStatus: 'private',
  publishAt: null, madeForKids: false, containsSyntheticMedia: true,
};

let clock; let store; let storage; let auth; let enqueue; let yt;

/** A fake YouTube that tracks persisted bytes and can be told to fail or stall. */
function makeYouTube() {
  const state = { received: 0, statusCalls: 0, statuses: [], uploadFailures: [], initiateFailures: [] };
  const done = () => state.received >= SIZE;
  return {
    state,
    api: {
      initiateUpload: jest.fn(async () => {
        const f = state.initiateFailures.shift();
        if (f) throw f;
        return 'https://upload.example/session/secret-session-token';
      }),
      uploadChunk: jest.fn(async (_t, _u, { chunk, start }) => {
        const f = state.uploadFailures.shift();
        if (typeof f === 'function') f();
        else if (f) throw f;
        state.received = start + chunk.length;
        return done() ? { done: true, video: { id: 'VID1', status: { uploadStatus: 'uploaded', privacyStatus: 'private' } } } : { done: false, nextOffset: state.received };
      }),
      queryUpload: jest.fn(async () => (done() ? { done: true, video: { id: 'VID1', status: {} } } : { done: false, nextOffset: state.received })),
      getVideoStatus: jest.fn(async () => {
        state.statusCalls += 1;
        const next = state.statuses.length ? state.statuses.shift() : { uploadStatus: 'processed', privacyStatus: 'private', processingStatus: 'succeeded' };
        return next;
      }),
    },
  };
}

const seedAccount = (over = {}) => PlatformAccount.seed({ _id: IDS.account, ownerId: OWNER, platform: 'youtube', externalId: 'UC1', refreshTokenEnc: cipher.encrypt('RT'), ...over });
const seedJob = (over = {}) => PublishingJob.seed({
  ownerId: OWNER, platform: 'youtube', accountId: IDS.account, courseId: IDS.course, courseVideoId: IDS.video,
  status: 'QUEUED', queuedAt: new Date(clock), maxAttempts: 3, metadata: { ...META }, source: { ...SOURCE },
  fingerprint: 'fp-1', dedupeKey: 'fp-1', ...over,
});
const row = () => PublishingJob.rows[0];

const run = (jobId, over = {}) => processYouTubeJob(jobId, {
  store, api: yt.api, auth, storage, enqueue, workerId: 'w1',
  settings: settingsFor(over.youtube)(), now: () => clock,
  sleep: async (ms) => { clock += ms; },
  ...over.deps,
});

beforeAll(() => { config.publishing.encryptionKey = KEY; });
beforeEach(() => {
  PublishingJob.reset();
  PlatformAccount.reset();
  jest.clearAllMocks();
  clock = Date.parse('2026-10-10T12:00:00Z');
  store = new PublishingJobStore({ now: () => clock });
  storage = storageFake();
  storage.objects.set(`vireon-video/${IDS.video}/final.mp4`, { size: SIZE, etag: 'etag-1' });
  auth = { getAccessToken: jest.fn(async () => 'AT') };
  enqueue = jest.fn(async () => {});
  yt = makeYouTube();
  seedAccount();
});

const emittedStatuses = () => events.emitJob.mock.calls.map(([doc]) => doc.status);

describe('a successful publish', () => {
  it('walks QUEUED -> VALIDATING -> UPLOADING -> PROCESSING -> COMPLETED and records what YouTube returned', async () => {
    const job = seedJob();
    yt.state.statuses = [{ uploadStatus: 'uploaded', privacyStatus: 'private', processingStatus: 'processing' }];

    const result = await run(job._id);

    expect(result).toEqual({ outcome: 'completed' });
    expect(row()).toMatchObject({
      status: 'COMPLETED', attempts: 1,
      remote: { videoId: 'VID1', url: 'https://www.youtube.com/watch?v=VID1', studioUrl: 'https://studio.youtube.com/video/VID1/edit', uploadStatus: 'processed' },
      progress: { percent: 100, bytesUploaded: SIZE, bytesTotal: SIZE },
      lease: { owner: '', expiresAt: null },
    });
    expect(row().completedAt).toBeInstanceOf(Date);
    expect(row().dedupeKey).toBe('fp-1'); // still blocks a duplicate publish of the same file
    expect(row().quotaCountedAt).toBeInstanceOf(Date);
    expect(yt.api.initiateUpload).toHaveBeenCalledTimes(1);
    expect(yt.api.getVideoStatus).toHaveBeenCalledTimes(2); // waited for "processed"
    expect(row().events.map((e) => e.status)).toEqual(expect.arrayContaining(['VALIDATING', 'UPLOADING', 'PROCESSING', 'COMPLETED']));
  });

  it('marks COMPLETED only after YouTube reports the video as processed - never on insert alone', async () => {
    const job = seedJob();
    let statusAtCheck;
    yt.api.getVideoStatus.mockImplementation(async () => {
      statusAtCheck = row().status;
      return { uploadStatus: 'processed', privacyStatus: 'private', processingStatus: 'succeeded' };
    });
    await run(job._id);
    expect(statusAtCheck).toBe('PROCESSING');
    expect(row().status).toBe('COMPLETED');
  });

  it('sends the approved metadata and chunks of the stored file - no regeneration, no local copy', async () => {
    const job = seedJob();
    await run(job._id);
    const body = yt.api.initiateUpload.mock.calls[0][1];
    expect(body.body.snippet).toMatchObject({ title: 'Closures', categoryId: '27', defaultLanguage: 'en' });
    expect(body.body.status).toMatchObject({ privacyStatus: 'private', selfDeclaredMadeForKids: false, containsSyntheticMedia: true });
    expect(body.size).toBe(SIZE);
    expect(storage.getObjectRange).toHaveBeenCalledTimes(3);
    expect(storage.getObjectRange.mock.calls[0].slice(0, 2)).toEqual(['vireon-video', `${IDS.video}/final.mp4`]);
  });

  it('keeps the resumable session URL encrypted at rest and drops it once the upload is confirmed', async () => {
    const job = seedJob();
    let stored;
    yt.api.uploadChunk.mockImplementationOnce(async (_t, _u, { chunk, start }) => {
      stored = row().remote.sessionEnc;
      yt.state.received = start + chunk.length;
      return { done: false, nextOffset: yt.state.received };
    });
    await run(job._id);
    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain('secret-session-token');
    expect(cipher.decrypt(stored)).toContain('secret-session-token');
    expect(row().remote.sessionEnc).toBe('');
  });

  it('pushes progress and every status change over the socket channel', async () => {
    const job = seedJob();
    const send = yt.api.uploadChunk.getMockImplementation();
    yt.api.uploadChunk.mockImplementation(async (...args) => { clock += 1000; return send(...args); }); // progress emits are throttled by time
    await run(job._id);
    const seen = emittedStatuses();
    expect(seen).toEqual(expect.arrayContaining(['VALIDATING', 'UPLOADING', 'PROCESSING', 'COMPLETED']));
    expect(events.emitJob.mock.calls.some(([doc]) => doc.status === 'UPLOADING' && doc.progress.percent > 0 && doc.progress.percent < 100)).toBe(true);
  });
});

describe('claiming', () => {
  it('only one of two concurrent workers runs a job', async () => {
    const job = seedJob();
    const [a, b] = await Promise.all([run(job._id, { deps: { workerId: 'w1' } }), run(job._id, { deps: { workerId: 'w2' } })]);
    expect([a.outcome, b.outcome].sort()).toEqual(['completed', 'skipped']);
    expect(yt.api.initiateUpload).toHaveBeenCalledTimes(1);
  });

  it.each(['CANCELLED', 'COMPLETED', 'FAILED', 'DRAFT'])('does nothing for a %s job', async (status) => {
    const job = seedJob({ status });
    expect(await run(job._id)).toEqual({ outcome: 'skipped' });
    expect(yt.api.initiateUpload).not.toHaveBeenCalled();
    expect(row().status).toBe(status);
  });

  it('does not steal a job from a worker whose lease is still valid', async () => {
    const job = seedJob({ status: 'UPLOADING', lease: { owner: 'w2', expiresAt: new Date(clock + 60_000) } });
    expect(await run(job._id)).toEqual({ outcome: 'skipped' });
  });

  it('ignores a delayed-retry delivery that arrives before its time', async () => {
    const job = seedJob({ status: 'RETRYING', nextRetryAt: new Date(clock + 60_000) });
    expect(await run(job._id)).toEqual({ outcome: 'skipped' });
  });
});

describe('restart and interruption recovery', () => {
  it('takes over a dead worker\'s run and resumes from YouTube\'s confirmed offset without spending an attempt', async () => {
    yt.state.received = CHUNK; // the dead worker got one chunk in
    const job = seedJob({
      status: 'UPLOADING', attempts: 1,
      lease: { owner: 'dead-worker', expiresAt: new Date(clock - 1000) },
      remote: { videoId: '', sessionEnc: cipher.encrypt('https://upload.example/session/secret-session-token') },
      quotaCountedAt: new Date(clock - 60_000),
    });
    const result = await run(job._id);

    expect(result.outcome).toBe('completed');
    expect(row().attempts).toBe(1);
    expect(yt.api.initiateUpload).not.toHaveBeenCalled();
    expect(storage.getObjectRange.mock.calls[0][2]).toBe(CHUNK); // continued, did not start over
    expect(yt.api.uploadChunk).toHaveBeenCalledTimes(2);
  });

  it('never uploads again once YouTube has returned a video id - it only verifies that video', async () => {
    const job = seedJob({ status: 'RETRYING', attempts: 1, nextRetryAt: new Date(clock - 1), remote: { videoId: 'VID-EXISTING', url: 'u', studioUrl: 's', sessionEnc: '' } });
    const result = await run(job._id);

    expect(result.outcome).toBe('completed');
    expect(yt.api.initiateUpload).not.toHaveBeenCalled();
    expect(yt.api.uploadChunk).not.toHaveBeenCalled();
    expect(yt.api.getVideoStatus.mock.calls[0][1]).toBe('VID-EXISTING');
    expect(storage.statObject).not.toHaveBeenCalled(); // the source is no longer relevant
  });

  it('a retry after a failure completes the upload (retry behaviour end to end)', async () => {
    const job = seedJob();
    yt.state.uploadFailures = Array.from({ length: 10 }, () => new PublishError('SERVER', 'HTTP 503'));
    const first = await run(job._id);
    expect(first.outcome).toBe('retrying');

    yt.state.uploadFailures = [];
    clock = new Date(row().nextRetryAt).getTime() + 1;
    const second = await run(job._id);
    expect(second.outcome).toBe('completed');
    expect(row().attempts).toBe(2);
  });
});

describe('transient failures', () => {
  it('schedules a bounded exponential-backoff retry and persists why', async () => {
    const job = seedJob();
    yt.state.uploadFailures = Array.from({ length: 10 }, () => new PublishError('SERVER', 'HTTP 503'));
    const result = await run(job._id);

    expect(result.outcome).toBe('retrying');
    expect(row()).toMatchObject({ status: 'RETRYING', attempts: 1, lease: { owner: '' } });
    expect(row().error).toMatchObject({ code: 'SERVER', retryable: true });
    expect(row().dedupeKey).toBe('fp-1');
    const [queuedJob, opts] = enqueue.mock.calls[0];
    expect(queuedJob._id).toBe(job._id);
    expect(opts.delayMs).toBe(5000); // attempt 1 -> 5s
    expect(new Date(row().nextRetryAt).getTime() - clock).toBeGreaterThanOrEqual(5000);
  });

  it('doubles the wait on the next failure', async () => {
    const job = seedJob({ status: 'RETRYING', attempts: 1, nextRetryAt: new Date(clock - 1), maxAttempts: 5 });
    yt.state.uploadFailures = Array.from({ length: 10 }, () => new PublishError('NETWORK', 'down'));
    await run(job._id);
    expect(enqueue.mock.calls[0][1].delayMs).toBe(10_000); // attempt 2 -> 10s
  });

  it('stops retrying when the attempt budget is spent and releases the duplicate lock', async () => {
    const job = seedJob({ maxAttempts: 2 });
    const failing = () => { yt.state.uploadFailures = Array.from({ length: 10 }, () => new PublishError('NETWORK', 'down')); };

    failing();
    expect((await run(job._id)).outcome).toBe('retrying');
    clock = new Date(row().nextRetryAt).getTime() + 1;
    failing();
    expect((await run(job._id)).outcome).toBe('failed');

    expect(row()).toMatchObject({ status: 'FAILED', attempts: 2 });
    expect(row().error).toMatchObject({ code: 'NETWORK', retryable: true });
    expect(row().dedupeKey).toBeUndefined();
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});

describe('permanent failures', () => {
  it('fails immediately, without retrying, on an error retrying cannot fix', async () => {
    const job = seedJob();
    yt.state.initiateFailures = [new PublishError('INVALID_METADATA', 'YouTube rejected the video details: invalidTitle', { httpStatus: 400 })];
    expect((await run(job._id)).outcome).toBe('failed');

    expect(row()).toMatchObject({ status: 'FAILED', attempts: 1 });
    expect(row().error).toMatchObject({ code: 'INVALID_METADATA', retryable: false, httpStatus: 400 });
    expect(row().error.action).toMatch(/Fix the highlighted metadata/);
    expect(enqueue).not.toHaveBeenCalled();
    expect(row().dedupeKey).toBeUndefined();
  });

  it('fails with an actionable message when Google revoked the account\'s permission', async () => {
    const job = seedJob();
    auth.getAccessToken.mockRejectedValue(new PublishError('AUTH_REVOKED', 'Google no longer accepts the saved permission'));
    expect((await run(job._id)).outcome).toBe('failed');
    expect(row().error).toMatchObject({ code: 'AUTH_REVOKED', retryable: false });
    expect(row().error.action).toMatch(/Reconnect the YouTube account/);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('fails fast, before contacting YouTube, when the account is already flagged needs_reauth', async () => {
    const job = seedJob();
    PlatformAccount.rows[0].status = 'needs_reauth';
    PlatformAccount.rows[0].statusReason = 'Revoked in Google settings';
    expect((await run(job._id)).outcome).toBe('failed');
    expect(row().error).toMatchObject({ code: 'AUTH_REVOKED', message: 'Revoked in Google settings' });
    expect(yt.api.initiateUpload).not.toHaveBeenCalled();
  });

  it('fails when the account was disconnected after the job was queued', async () => {
    const job = seedJob();
    PlatformAccount.reset();
    expect((await run(job._id)).outcome).toBe('failed');
    expect(row().error.code).toBe('AUTH_REVOKED');
  });

  it.each([
    ['the file is gone from storage', () => storage.objects.clear(), 'SOURCE_MISSING'],
    ['the file was re-rendered', () => storage.objects.set(`vireon-video/${IDS.video}/final.mp4`, { size: SIZE + 1, etag: 'etag-2' }), 'SOURCE_CHANGED'],
    ['the file exceeds the configured limit', () => storage.objects.set(`vireon-video/${IDS.video}/final.mp4`, { size: SIZE, etag: 'etag-1' }), 'SOURCE_TOO_LARGE'],
  ])('fails permanently when %s', async (_label, arrange, code) => {
    const job = seedJob();
    arrange();
    const overrides = code === 'SOURCE_TOO_LARGE' ? { youtube: { maxUploadBytes: SIZE - 1 } } : {};
    expect((await run(job._id, overrides)).outcome).toBe('failed');
    expect(row().error).toMatchObject({ code, retryable: false });
    expect(yt.api.initiateUpload).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('re-checks metadata against current rules at run time', async () => {
    const job = seedJob({ metadata: { ...META, privacyStatus: 'public' } });
    expect((await run(job._id, { youtube: { apiVerified: false } })).outcome).toBe('failed');
    expect(row().error.code).toBe('INVALID_METADATA');
    expect(row().error.message).toMatch(/not marked verified/);
  });

  it('fails permanently, keeping the video id, when YouTube rejects or deletes the upload', async () => {
    const job = seedJob();
    yt.state.statuses = [{ uploadStatus: 'rejected', rejectionReason: 'duplicate', privacyStatus: 'private' }];
    expect((await run(job._id)).outcome).toBe('failed');
    expect(row().error).toMatchObject({ code: 'REMOTE_REJECTED', retryable: false });
    expect(row().error.message).toMatch(/duplicate/);
    expect(row().remote.videoId).toBe('VID1');
  });

  it('fails when the video no longer exists on YouTube', async () => {
    const job = seedJob({ status: 'PROCESSING', attempts: 1, remote: { videoId: 'GONE' }, lease: { owner: '', expiresAt: null } });
    yt.api.getVideoStatus.mockResolvedValue(null);
    expect((await run(job._id)).outcome).toBe('failed');
    expect(row().error.code).toBe('REMOTE_REJECTED');
  });
});

describe('quota', () => {
  const quotaError = () => new PublishError('QUOTA_EXCEEDED', 'The YouTube daily quota has been used up', { httpStatus: 403 });

  it('waits for the Pacific-midnight reset instead of burning attempts', async () => {
    const job = seedJob();
    yt.state.initiateFailures = [quotaError()];
    const result = await run(job._id);

    expect(result.outcome).toBe('retrying');
    const reset = nextQuotaReset(new Date(clock)).getTime();
    expect(new Date(row().nextRetryAt).getTime()).toBeGreaterThan(reset);
    expect(new Date(row().nextRetryAt).getTime()).toBeLessThan(reset + 5 * 60_000);
    expect(row()).toMatchObject({ status: 'RETRYING', attempts: 0, deferrals: 1 });
    expect(row().error.code).toBe('QUOTA_EXCEEDED');
    expect(enqueue.mock.calls[0][1].delayMs).toBeGreaterThan(60_000);
  });

  it('gives up after repeated quota deferrals', async () => {
    const job = seedJob({ deferrals: 3 });
    yt.state.initiateFailures = [quotaError()];
    expect((await run(job._id)).outcome).toBe('failed');
    expect(row().error.code).toBe('QUOTA_EXCEEDED');
  });

  it('stops locally, before asking Google, once today\'s upload allowance is used', async () => {
    for (let i = 0; i < 2; i += 1) {
      PublishingJob.seed({ ownerId: OWNER, platform: 'youtube', status: 'COMPLETED', quotaCountedAt: new Date(clock - 3600_000) });
    }
    const job = seedJob();
    PublishingJob.rows.unshift(PublishingJob.rows.pop()); // keep row() === our job
    const result = await run(job._id, { youtube: { dailyUploadLimit: 2 } });
    expect(result.outcome).toBe('retrying');
    expect(yt.api.initiateUpload).not.toHaveBeenCalled();
    expect(PublishingJob.rows.find((r) => r._id === job._id).error.code).toBe('QUOTA_EXCEEDED');
  });

  it('does not count yesterday\'s (pre-reset) uploads against today', async () => {
    PublishingJob.seed({ ownerId: OWNER, platform: 'youtube', status: 'COMPLETED', quotaCountedAt: new Date(clock - 30 * 3600_000) });
    const job = seedJob();
    const result = await run(job._id, { youtube: { dailyUploadLimit: 1 } });
    expect(result.outcome).toBe('completed');
    expect(PublishingJob.rows.find((r) => r._id === job._id).status).toBe('COMPLETED');
  });
});

describe('YouTube is still processing', () => {
  it('hands the check back to the queue and keeps the job in PROCESSING (no upload repeated)', async () => {
    const job = seedJob();
    yt.state.statuses = Array.from({ length: 200 }, () => ({ uploadStatus: 'uploaded', privacyStatus: 'private', processingStatus: 'processing' }));
    const result = await run(job._id);

    expect(result.outcome).toBe('waiting');
    expect(row()).toMatchObject({ status: 'PROCESSING', processingChecks: 1, remote: { videoId: 'VID1' } });
    expect(row().lease.owner).toBe('');
    expect(enqueue.mock.calls[0][1].delayMs).toBe(PROCESSING_RECHECK_MS);
    expect(yt.api.initiateUpload).toHaveBeenCalledTimes(1);
  });

  it('completes on a later check once YouTube is done', async () => {
    const job = seedJob();
    yt.state.statuses = Array.from({ length: 200 }, () => ({ uploadStatus: 'uploaded', privacyStatus: 'private', processingStatus: 'processing' }));
    await run(job._id);

    yt.state.statuses = [];
    clock = new Date(row().nextRetryAt).getTime() + 1;
    expect((await run(job._id)).outcome).toBe('completed');
    expect(yt.api.initiateUpload).toHaveBeenCalledTimes(1);
  });

  it('eventually fails with PROCESSING_TIMEOUT (retryable by hand, never re-uploaded)', async () => {
    const job = seedJob({ status: 'PROCESSING', attempts: 1, processingChecks: 3, remote: { videoId: 'VID1' }, nextRetryAt: new Date(clock - 1) });
    yt.state.statuses = Array.from({ length: 200 }, () => ({ uploadStatus: 'uploaded', privacyStatus: 'private' }));
    expect((await run(job._id)).outcome).toBe('failed');
    expect(row().error).toMatchObject({ code: 'PROCESSING_TIMEOUT', retryable: true });
    expect(row().remote.videoId).toBe('VID1');
    expect(enqueue).not.toHaveBeenCalled(); // no automatic retry storm
  });
});

describe('cancellation and lost leases', () => {
  it('stops mid-upload when the user cancels, and leaves the job CANCELLED', async () => {
    const job = seedJob();
    yt.state.uploadFailures = [() => {}, () => { row().status = 'CANCELLED'; }]; // user cancels while chunk 2 is in flight
    const result = await run(job._id);

    expect(result.outcome).toBe('cancelled');
    expect(row().status).toBe('CANCELLED');
    expect(yt.api.uploadChunk.mock.calls.length).toBeLessThanOrEqual(3);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('stops writing the moment another worker owns the lease', async () => {
    const job = seedJob();
    yt.state.uploadFailures = [() => { row().lease.owner = 'w2'; }];
    const result = await run(job._id);
    expect(result.outcome).toBe('cancelled');
    expect(row().status).not.toBe('COMPLETED');
    expect(row().status).not.toBe('FAILED');
  });
});
