jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), border: jest.fn(),
}));
jest.mock('../../src/services/publishing/PublishingEvents', () => ({ emitJob: jest.fn(), emitAccount: jest.fn(), summarize: jest.fn() }));
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
jest.mock('../../src/models/Course', () => require('./helpers/fakeMongo').createModel({ name: 'Course', idPrefix: 'cou' }));
jest.mock('../../src/models/CourseVideo', () => require('./helpers/fakeMongo').createModel({ name: 'CourseVideo', idPrefix: 'vid' }));
jest.mock('../../src/models/CoursePublishingProfile', () => require('./helpers/fakeMongo').createModel({ name: 'CoursePublishingProfile', idPrefix: 'cou' }));

const config = require('../../src/config');
const PublishingJob = require('../../src/models/PublishingJob');
const PlatformAccount = require('../../src/models/PlatformAccount');
const Course = require('../../src/models/Course');
const CourseVideo = require('../../src/models/CourseVideo');
const Profile = require('../../src/models/CoursePublishingProfile');
const cipher = require('../../src/services/publishing/crypto');
const PublishingEvents = require('../../src/services/publishing/PublishingEvents');
const PublishingJobStore = require('../../src/services/publishing/PublishingJobStore');
const PublishingService = require('../../src/services/publishing/PublishingService');
const { NotFoundError, ConflictError, ValidationError, SchemaValidationError } = require('../../src/utils/errors');
const { KEY, OWNER, IDS, RENDER_URL, storageFake, queueFake, authFake, settingsFor } = require('./helpers/harness');

let storage; let q; let service; let clock;

function build({ verified = true, authOver } = {}) {
  storage = storageFake();
  q = queueFake();
  const settings = settingsFor({ apiVerified: verified });
  service = new PublishingService({
    auth: authFake(authOver), queues: q.queues, storage, settings,
    store: new PublishingJobStore({ now: () => clock }), now: () => clock,
  });
}

const seedWorld = () => {
  PlatformAccount.seed({ _id: IDS.account, ownerId: OWNER, platform: 'youtube', externalId: 'UC1', displayName: 'Chan', refreshTokenEnc: cipher.encrypt('RT') });
  PlatformAccount.seed({ _id: IDS.otherAccount, ownerId: 'someone-else', platform: 'youtube', externalId: 'UC2', refreshTokenEnc: cipher.encrypt('RT2') });
  Course.seed({ _id: IDS.course, title: 'JS Course', language: 'english', category: 'Web Development' });
  CourseVideo.seed({
    _id: IDS.video, courseId: IDS.course, title: 'Closures', order: 1, renderUrl: RENDER_URL(IDS.video),
    videoStatus: 'Completed', status: 'Completed', audioDuration: 300,
    script: { title: 'Closures explained', description: 'How closures work.', tags: ['javascript'] },
  });
  CourseVideo.seed({ _id: IDS.video2, courseId: IDS.course, title: 'Unrendered', order: 2, renderUrl: '', videoStatus: 'Pending', status: 'Draft' });
};

beforeAll(() => { config.publishing.encryptionKey = KEY; });
beforeEach(() => {
  [PublishingJob, PlatformAccount, Course, CourseVideo, Profile].forEach((m) => m.reset());
  jest.clearAllMocks();
  clock = Date.parse('2026-10-10T12:00:00Z');
  seedWorld();
  build();
});

const draft = async (input = {}) => (await service.createDraft(OWNER, { accountId: IDS.account, courseVideoId: IDS.video, ...input })).job;

describe('creating a draft', () => {
  it('prefills metadata, snapshots the stored video, and queues NOTHING', async () => {
    const job = await draft();
    expect(job).toMatchObject({
      status: 'DRAFT', platform: 'youtube', accountId: IDS.account, courseVideoId: IDS.video, ownerId: OWNER,
      metadata: { title: 'Closures explained', description: 'How closures work.', tags: ['javascript'], privacyStatus: 'private', language: 'en', madeForKids: false, containsSyntheticMedia: true },
      source: { bucket: 'vireon-video', key: `${IDS.video}/final.mp4`, size: 5_000_000, etag: 'etag-1' },
    });
    expect(q.queue.add).not.toHaveBeenCalled(); // generating/creating never publishes
  });

  it('applies the user\'s edits over the defaults and validates them', async () => {
    const job = await draft({ metadata: { title: 'My title', tags: ['x', 'y'], privacyStatus: 'unlisted' } });
    expect(job.metadata).toMatchObject({ title: 'My title', tags: ['x', 'y'], privacyStatus: 'unlisted' });
    await expect(draft({ metadata: { title: '' } })).rejects.toBeInstanceOf(SchemaValidationError);
  });

  it('starts at the course default visibility only when the API project is verified', async () => {
    Profile.seed({ _id: IDS.course, ownerId: OWNER, youtubeDefaults: { privacyStatus: 'unlisted', categoryId: '28', tags: ['course'], language: 'en', madeForKids: false } });
    expect((await draft()).metadata).toMatchObject({ privacyStatus: 'unlisted', categoryId: '28', tags: ['course', 'javascript'] });

    PublishingJob.reset();
    build({ verified: false });
    expect((await draft()).metadata.privacyStatus).toBe('private');
  });

  it('refuses public/unlisted/scheduled uploads while the project is unverified', async () => {
    build({ verified: false });
    await expect(draft({ metadata: { privacyStatus: 'public' } })).rejects.toBeInstanceOf(SchemaValidationError);
    await expect(draft({ metadata: { publishAt: '2026-10-12T09:00:00Z' } })).rejects.toBeInstanceOf(SchemaValidationError);
  });

  it('returns the existing draft instead of creating a second one (double-click safe)', async () => {
    const first = await service.createDraft(OWNER, { accountId: IDS.account, courseVideoId: IDS.video });
    const second = await service.createDraft(OWNER, { accountId: IDS.account, courseVideoId: IDS.video });
    expect(second.existing).toBe(true);
    expect(second.job._id).toBe(first.job._id);
    expect(PublishingJob.rows).toHaveLength(1);
  });

  it('rejects a duplicate of a job that is queued, running or already published', async () => {
    const j = await draft();
    await service.submit(OWNER, j._id, { confirm: true });
    await expect(draft()).rejects.toThrow(/already has a publishing job/);

    PublishingJob.rows[0].status = 'COMPLETED';
    await expect(draft()).rejects.toThrow(/already published/);
  });

  it('allows an explicit second copy of a published video, but still not two at once', async () => {
    const j = await draft();
    PublishingJob.rows[0].status = 'COMPLETED';
    const again = await draft({ allowReupload: true });
    expect(again._id).not.toBe(j._id);
    await expect(draft({ allowReupload: true })).resolves.toBeDefined(); // returns the new draft (idempotent)
    expect(PublishingJob.rows).toHaveLength(2);
  });

  it('refuses lessons that are not rendered, files missing from storage, and oversized files', async () => {
    await expect(service.createDraft(OWNER, { accountId: IDS.account, courseVideoId: IDS.video2 })).rejects.toBeInstanceOf(ValidationError);
    storage.objects.clear();
    await expect(draft()).rejects.toThrow(/missing from storage/);
    storage.objects.set(`vireon-video/${IDS.video}/final.mp4`, { size: 5 * 1024 ** 3, etag: 'big' });
    await expect(draft()).rejects.toThrow(/over the configured upload limit/);
  });

  it('cannot use another owner\'s account, or one that needs reconnecting', async () => {
    await expect(service.createDraft(OWNER, { accountId: IDS.otherAccount, courseVideoId: IDS.video })).rejects.toBeInstanceOf(NotFoundError);
    PlatformAccount.rows.find((r) => r._id === IDS.account).status = 'needs_reauth';
    await expect(draft()).rejects.toBeInstanceOf(ConflictError);
  });

  it('validates ids at the boundary', async () => {
    await expect(service.createDraft(OWNER, { accountId: 'nope', courseVideoId: IDS.video })).rejects.toBeInstanceOf(SchemaValidationError);
    await expect(service.createDraft(OWNER, {})).rejects.toBeInstanceOf(SchemaValidationError);
  });
});

describe('editing a draft', () => {
  it('edits metadata while it is a draft', async () => {
    const j = await draft();
    const updated = await service.updateMetadata(OWNER, j._id, { title: 'Edited', madeForKids: true });
    expect(updated.metadata).toMatchObject({ title: 'Edited', madeForKids: true, description: 'How closures work.' });
  });

  it('rejects invalid edits and leaves the draft untouched', async () => {
    const j = await draft();
    await expect(service.updateMetadata(OWNER, j._id, { title: 'x'.repeat(200) })).rejects.toBeInstanceOf(SchemaValidationError);
    await expect(service.updateMetadata(OWNER, j._id, { bogus: 1 })).rejects.toBeInstanceOf(SchemaValidationError);
    expect(PublishingJob.rows[0].metadata.title).toBe('Closures explained');
  });

  it('refuses edits once the job is queued or running', async () => {
    const j = await draft();
    await service.submit(OWNER, j._id, { confirm: true });
    await expect(service.updateMetadata(OWNER, j._id, { title: 'late' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('allows fixing a job that failed before anything was uploaded, but not after', async () => {
    const j = await draft();
    PublishingJob.rows[0].status = 'FAILED';
    await expect(service.updateMetadata(OWNER, j._id, { title: 'fixed' })).resolves.toBeDefined();
    PublishingJob.rows[0].remote.videoId = 'VID';
    await expect(service.updateMetadata(OWNER, j._id, { title: 'again' })).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('explicit approval before publishing', () => {
  it('will not queue without confirm: true', async () => {
    const j = await draft();
    await expect(service.submit(OWNER, j._id, {})).rejects.toBeInstanceOf(ValidationError);
    await expect(service.submit(OWNER, j._id, { confirm: 'yes' })).rejects.toBeInstanceOf(ValidationError);
    await expect(service.submit(OWNER, j._id)).rejects.toBeInstanceOf(ValidationError);
    expect(PublishingJob.rows[0].status).toBe('DRAFT');
    expect(q.queue.add).not.toHaveBeenCalled();
  });

  it('approves a draft: QUEUED, timestamped, enqueued on the YouTube queue exactly once', async () => {
    const j = await draft();
    const { job, enqueued } = await service.submit(OWNER, j._id, { confirm: true });

    expect(enqueued).toBe(true);
    expect(job).toMatchObject({ status: 'QUEUED', attempts: 0 });
    expect(job.approvedAt).toBeInstanceOf(Date);
    expect(q.queues).toHaveBeenCalledWith('youtube');
    expect(q.queue.add).toHaveBeenCalledTimes(1);
    const [name, data, opts] = q.queue.add.mock.calls[0];
    expect(name).toBe('publish');
    expect(data).toEqual({ jobId: j._id });
    expect(opts.jobId).toMatch(new RegExp(`^${j._id}:retry:0-\\d+$`)); // BullMQ-safe, deterministic id
    expect(PublishEventsEmitted()).toBeGreaterThan(0);
  });

  it('cannot be submitted twice', async () => {
    const j = await draft();
    await service.submit(OWNER, j._id, { confirm: true });
    await expect(service.submit(OWNER, j._id, { confirm: true })).rejects.toBeInstanceOf(ConflictError);
    expect(q.queue.add).toHaveBeenCalledTimes(1);
  });

  it('refuses to publish a file that was re-rendered after the draft was made', async () => {
    const j = await draft();
    storage.objects.set(`vireon-video/${IDS.video}/final.mp4`, { size: 5_000_001, etag: 'etag-2' });
    await expect(service.submit(OWNER, j._id, { confirm: true })).rejects.toThrow(/re-rendered/);
    expect(PublishingJob.rows[0].status).toBe('DRAFT');
  });

  it('revalidates metadata at submit time (e.g. the project stopped being verified)', async () => {
    const j = await draft({ metadata: { privacyStatus: 'public' } });
    build({ verified: false });
    await expect(service.submit(OWNER, j._id, { confirm: true })).rejects.toBeInstanceOf(SchemaValidationError);
    expect(PublishingJob.rows[0].status).toBe('DRAFT');
  });

  it('keeps the job safely QUEUED (and says so) when Redis is down, for the recovery sweep to pick up', async () => {
    const j = await draft();
    q.queue.add.mockRejectedValueOnce(new Error('ECONNREFUSED redis'));
    const { job, enqueued } = await service.submit(OWNER, j._id, { confirm: true });
    expect(enqueued).toBe(false);
    expect(job.status).toBe('QUEUED');
    expect(PublishingJob.rows[0].status).toBe('QUEUED');
  });

  it('refuses when the account needs reconnecting', async () => {
    const j = await draft();
    PlatformAccount.rows.find((r) => r._id === IDS.account).status = 'needs_reauth';
    await expect(service.submit(OWNER, j._id, { confirm: true })).rejects.toBeInstanceOf(ConflictError);
  });
});

function PublishEventsEmitted() {
  return PublishingEvents.emitJob.mock.calls.length;
}

describe('ownership', () => {
  it('another owner gets 404 for every operation, as if the job did not exist', async () => {
    const j = await draft();
    const stranger = 'someone-else';
    await expect(service.get(stranger, j._id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.updateMetadata(stranger, j._id, { title: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.submit(stranger, j._id, { confirm: true })).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.cancel(stranger, j._id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.retry(stranger, j._id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.discard(stranger, j._id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.getOwnedRaw(stranger, j._id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await service.list(stranger)).jobs).toHaveLength(0);
    expect(PublishingJob.rows[0].status).toBe('DRAFT');
  });
});

describe('cancel, retry, discard', () => {
  it('cancels a running job and releases the duplicate lock so a fresh draft is possible', async () => {
    const j = await draft();
    await service.submit(OWNER, j._id, { confirm: true });
    PublishingJob.rows[0].status = 'UPLOADING';

    const cancelled = await service.cancel(OWNER, j._id);
    expect(cancelled.status).toBe('CANCELLED');
    expect(PublishingJob.rows[0].dedupeKey).toBeUndefined();
    await expect(draft()).resolves.toBeDefined();
  });

  it('cannot cancel a draft or a finished job', async () => {
    const j = await draft();
    await expect(service.cancel(OWNER, j._id)).rejects.toBeInstanceOf(ConflictError);
    PublishingJob.rows[0].status = 'COMPLETED';
    await expect(service.cancel(OWNER, j._id)).rejects.toBeInstanceOf(ConflictError);
  });

  it('retries a failed job: back to QUEUED with fresh counters, error cleared, lock re-taken', async () => {
    const j = await draft();
    const row = PublishingJob.rows[0];
    Object.assign(row, { status: 'FAILED', attempts: 5, deferrals: 2, error: { code: 'NETWORK', message: 'down', retryable: true }, dedupeKey: undefined });

    const { job, enqueued } = await service.retry(OWNER, j._id);
    expect(enqueued).toBe(true);
    expect(job).toMatchObject({ status: 'QUEUED', attempts: 0, deferrals: 0 });
    expect(job.error.code).toBe('');
    expect(PublishingJob.rows[0].dedupeKey).toBe(row.fingerprint);
  });

  it('only retries FAILED jobs, and not failures a retry cannot fix', async () => {
    const j = await draft();
    await expect(service.retry(OWNER, j._id)).rejects.toBeInstanceOf(ConflictError);
    Object.assign(PublishingJob.rows[0], { status: 'FAILED', error: { code: 'SOURCE_CHANGED', action: 'Create a new draft' } });
    await expect(service.retry(OWNER, j._id)).rejects.toThrow(/Create a new draft/);
  });

  it('refuses a retry when another job for the same video is now active', async () => {
    const j = await draft();
    PublishingJob.rows[0].status = 'FAILED';
    delete PublishingJob.rows[0].dedupeKey;
    await draft(); // a new draft takes the lock
    await expect(service.retry(OWNER, j._id)).rejects.toBeInstanceOf(ConflictError);
  });

  it('discards drafts and cancelled jobs but keeps finished history', async () => {
    const j = await draft();
    await expect(service.discard(OWNER, j._id)).resolves.toEqual({ deleted: true });
    const k = await draft();
    PublishingJob.rows[0].status = 'COMPLETED';
    await expect(service.discard(OWNER, k._id)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('listing, history and allowed actions', () => {
  it('filters, paginates and parses query strings safely', async () => {
    const a = await draft();
    PublishingJob.rows[0].status = 'COMPLETED';
    await draft({ allowReupload: true });
    expect(a).toBeDefined();

    expect((await service.list(OWNER, {})).pagination.total).toBe(2);
    expect((await service.list(OWNER, { finished: 'true' })).jobs).toHaveLength(1);
    expect((await service.list(OWNER, { finished: 'false' })).jobs).toHaveLength(1);
    expect((await service.list(OWNER, { limit: '1', page: '2' })).jobs).toHaveLength(1);
    await expect(service.list(OWNER, { status: 'NOPE' })).rejects.toBeInstanceOf(SchemaValidationError);
    expect((await service.list(OWNER, { status: 'COMPLETED' })).jobs[0].status).toBe('COMPLETED');
  });

  it('tells the UI which actions are allowed, and never leaks internals', async () => {
    const j = await draft();
    let view = await service.get(OWNER, j._id);
    expect(view.actions).toMatchObject({ canEdit: true, canSubmit: true, canCancel: false, canRetry: false, canDiscard: true });
    expect(JSON.stringify(view)).not.toMatch(/dedupeKey|sessionEnc|lease/);

    PublishingJob.rows[0].status = 'UPLOADING';
    view = await service.get(OWNER, j._id);
    expect(view.actions).toMatchObject({ canEdit: false, canSubmit: false, canCancel: true });

    Object.assign(PublishingJob.rows[0], { status: 'FAILED', error: { code: 'NETWORK', retryable: true } });
    view = await service.get(OWNER, j._id);
    expect(view.actions).toMatchObject({ canRetry: true, canEdit: true });
  });

  it('lists a course\'s lessons with render state and what is already published', async () => {
    const j = await draft();
    Object.assign(PublishingJob.rows[0], { status: 'COMPLETED', remote: { videoId: 'VID', url: 'https://youtu.be/VID' } });
    const { lessons } = await service.listLessons(OWNER, IDS.course);
    const lesson = lessons.find((l) => l._id === IDS.video);
    expect(lesson.publishable).toBe(true);
    expect(lesson.published[0]).toMatchObject({ jobId: j._id, videoId: 'VID' });
    expect(lessons.find((l) => l._id === IDS.video2)).toMatchObject({ publishable: false, reason: 'Not rendered yet' });
    await expect(service.listLessons(OWNER, 'cou-zzzzzzzz')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('capabilities', () => {
  it('reports honest YouTube restrictions and today\'s usage', async () => {
    build({ verified: false });
    PublishingJob.seed({ ownerId: OWNER, platform: 'youtube', status: 'COMPLETED', quotaCountedAt: new Date(clock - 3600_000) });
    const caps = await service.getCapabilities();
    expect(caps.youtube).toMatchObject({ configured: true, apiVerified: false, privacyOptions: ['private'], schedulingAvailable: false, uploadsToday: 1, dailyUploadLimit: 100 });
    expect(caps.youtube.restrictions[0]).toMatch(/locks uploads to Private/);
    expect(caps.youtube.quotaResetsAt).toBe('2026-10-11T07:00:00.000Z');
    expect(caps.authentication.enabled).toBe(false);
  });

  it('never claims Udemy can be published to directly', async () => {
    const caps = await service.getCapabilities();
    expect(caps.udemy.directPublishing).toBe(false);
    expect(caps.udemy.mode).toBe('export');
    expect(caps.udemy.requiresCredentials).toBe(false);
    expect(caps.udemy.officialApi.notDocumented).toEqual(expect.arrayContaining(['Create a course', 'Upload lecture video or resources']));
  });

  it('reflects an unconfigured Google project', async () => {
    build({ authOver: { isConfigured: jest.fn(() => false) } });
    expect((await service.getCapabilities()).youtube.configured).toBe(false);
  });
});

describe('Udemy package builds', () => {
  it('queues a build on the export queue; allowed without a draft because it publishes nothing', async () => {
    const { job, enqueued } = await service.createExport(OWNER, IDS.course, { includeMedia: false });
    expect(enqueued).toBe(true);
    expect(job).toMatchObject({ platform: 'udemy-export', status: 'QUEUED', maxAttempts: 3 });
    expect(job.exportOptions).toMatchObject({ includeMedia: false, includeCaptions: true, allowIncomplete: false });
    expect(q.queues).toHaveBeenCalledWith('export');
  });

  it('allows one build per course at a time', async () => {
    await service.createExport(OWNER, IDS.course, {});
    await expect(service.createExport(OWNER, IDS.course, {})).rejects.toBeInstanceOf(ConflictError);
  });

  it('404s for an unknown course and validates options', async () => {
    await expect(service.createExport(OWNER, 'cou-zzzzzzzz', {})).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.createExport(OWNER, IDS.course, { includeMedia: 'yes' })).rejects.toBeInstanceOf(SchemaValidationError);
  });

  it('exposes the overview with the validation report and a clear non-publishing notice', async () => {
    const overview = await service.getUdemyOverview(OWNER, IDS.course);
    expect(overview.capabilities.summary).toMatch(/does not create or publish anything on Udemy/);
    expect(overview.validation.ok).toBe(false);
    expect(overview.validation.errors.map((e) => e.code)).toEqual(expect.arrayContaining(['COURSE_SUBTITLE_MISSING', 'LESSON_VIDEO_MISSING']));
    expect(JSON.stringify(overview.plan)).not.toContain('renderUrl');
  });
});
