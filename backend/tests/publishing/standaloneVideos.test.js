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
jest.mock('../../src/models/VideoJob', () => require('./helpers/fakeMongo').createModel({ name: 'VideoJob', idPrefix: 'job' }));
jest.mock('../../src/models/CoursePublishingProfile', () => require('./helpers/fakeMongo').createModel({ name: 'CoursePublishingProfile', idPrefix: 'cou' }));

const config = require('../../src/config');
const PublishingJob = require('../../src/models/PublishingJob');
const PlatformAccount = require('../../src/models/PlatformAccount');
const Course = require('../../src/models/Course');
const CourseVideo = require('../../src/models/CourseVideo');
const VideoJob = require('../../src/models/VideoJob');
const cipher = require('../../src/services/publishing/crypto');
const PublishingJobStore = require('../../src/services/publishing/PublishingJobStore');
const PublishingService = require('../../src/services/publishing/PublishingService');
const { processYouTubeJob } = require('../../src/services/publishing/youtube/processYouTubeJob');
const { NotFoundError, ValidationError, ConflictError, SchemaValidationError } = require('../../src/utils/errors');
const { KEY, OWNER, IDS, RENDER_URL, storageFake, queueFake, authFake, settingsFor } = require('./helpers/harness');

const JOB_ID = 'job-aaaaaaaa';
const UNFINISHED = 'job-bbbbbbbb';
const URL_OF = (id, ext = 'mp4') => `http://127.0.0.1:9000/vireon-video/${id}/final.${ext}`;

let storage; let q; let service; let clock;

beforeAll(() => { config.publishing.encryptionKey = KEY; });
beforeEach(() => {
  [PublishingJob, PlatformAccount, Course, CourseVideo, VideoJob].forEach((m) => m.reset());
  jest.clearAllMocks();
  clock = Date.parse('2026-10-10T12:00:00Z');
  storage = storageFake();
  storage.objects.set(`vireon-video/${JOB_ID}/final.mp4`, { size: 7_000_000, etag: 'job-etag' });
  storage.objects.set(`vireon-video/${JOB_ID}/final.webm`, { size: 6_000_000, etag: 'webm-etag' });
  q = queueFake();
  service = new PublishingService({
    auth: authFake(), queues: q.queues, storage, settings: settingsFor({ apiVerified: true }),
    store: new PublishingJobStore({ now: () => clock }), now: () => clock,
  });

  PlatformAccount.seed({ _id: IDS.account, ownerId: OWNER, platform: 'youtube', externalId: 'UC1', displayName: 'Chan', refreshTokenEnc: cipher.encrypt('RT') });
  VideoJob.seed({
    _id: JOB_ID, topic: 'How closures work', type: 'youtube_shorts', language: 'hindi', resolution: '1080x1920', status: 'COMPLETED',
    videoUrl: URL_OF(JOB_ID), thumbnailUrl: URL_OF(JOB_ID, 'jpg'), updatedAt: new Date(clock),
    script: { title: 'Closures in 60 seconds', description: 'A quick look.', tags: ['javascript', 'shorts'] },
  });
  VideoJob.seed({ _id: UNFINISHED, topic: 'Still rendering', status: 'RENDERING', videoUrl: '', updatedAt: new Date(clock - 1000) });
  Course.seed({ _id: IDS.course, title: 'C', language: 'english' });
  CourseVideo.seed({ _id: IDS.video, courseId: IDS.course, title: 'L1', order: 1, renderUrl: RENDER_URL(IDS.video), videoStatus: 'Completed', status: 'Completed', script: { title: 'L1' } });
});

const draft = (input = {}) => service.createDraft(OWNER, { accountId: IDS.account, videoJobId: JOB_ID, ...input });

describe('publishing a standalone video', () => {
  it('creates a draft from the finished render, pre-filled from its script, and queues nothing', async () => {
    const { job } = await draft();
    expect(job).toMatchObject({
      status: 'DRAFT', platform: 'youtube', videoJobId: JOB_ID, courseId: null, courseVideoId: null, lessonTitle: 'Closures in 60 seconds',
      metadata: { title: 'Closures in 60 seconds', description: 'A quick look.', tags: ['javascript', 'shorts'], language: 'hi', privacyStatus: 'private' },
      source: { bucket: 'vireon-video', key: `${JOB_ID}/final.mp4`, size: 7_000_000, etag: 'job-etag', contentType: 'video/mp4' },
    });
    expect(q.queue.add).not.toHaveBeenCalled();
  });

  it('falls back to the topic when the script has no title', async () => {
    VideoJob.rows.find((r) => r._id === JOB_ID).script = {};
    expect((await draft()).job.metadata.title).toBe('How closures work');
  });

  it('keeps the file type (a webm render is sent as video/webm)', async () => {
    VideoJob.rows.find((r) => r._id === JOB_ID).videoUrl = URL_OF(JOB_ID, 'webm');
    const { job } = await draft();
    expect(job.source).toMatchObject({ contentType: 'video/webm', size: 6_000_000 });
    expect(job.source.fileName).toMatch(/\.webm$/);
  });

  it('needs exactly one source: a lesson OR a standalone video', async () => {
    await expect(service.createDraft(OWNER, { accountId: IDS.account })).rejects.toBeInstanceOf(SchemaValidationError);
    await expect(service.createDraft(OWNER, { accountId: IDS.account, videoJobId: JOB_ID, courseVideoId: IDS.video })).rejects.toBeInstanceOf(SchemaValidationError);
    await expect(service.createDraft(OWNER, { accountId: IDS.account, videoJobId: 'nope' })).rejects.toBeInstanceOf(SchemaValidationError);
    expect(PublishingJob.rows).toHaveLength(0);
  });

  it('refuses a video that has not finished rendering, an unknown one, or a file missing from storage', async () => {
    await expect(draft({ videoJobId: UNFINISHED })).rejects.toBeInstanceOf(ValidationError);
    await expect(draft({ videoJobId: 'job-zzzzzzzz' })).rejects.toBeInstanceOf(NotFoundError);
    storage.objects.clear();
    await expect(draft()).rejects.toThrow(/missing from storage/);
  });

  it('is idempotent as a draft, then blocks a duplicate once queued, and allows an explicit second copy', async () => {
    const first = await draft();
    const again = await draft();
    expect(again.existing).toBe(true);
    expect(again.job._id).toBe(first.job._id);

    await service.submit(OWNER, first.job._id, { confirm: true });
    await expect(draft()).rejects.toBeInstanceOf(ConflictError);

    PublishingJob.rows[0].status = 'COMPLETED';
    await expect(draft()).rejects.toThrow(/already published/);
    const copy = await draft({ allowReupload: true });
    expect(copy.job._id).not.toBe(first.job._id);
  });

  it('does not collide with a course lesson, even if both were somehow the same file', async () => {
    const standalone = await draft();
    const lesson = await service.createDraft(OWNER, { accountId: IDS.account, courseVideoId: IDS.video });
    expect(lesson.job._id).not.toBe(standalone.job._id);
    expect(PublishingJob.rows.map((r) => [r.videoJobId, r.courseVideoId])).toEqual([[JOB_ID, null], [null, IDS.video]]);
  });

  it('approval and the rest of the lifecycle work exactly as for lessons (confirm required, re-render detected)', async () => {
    const { job } = await draft();
    await expect(service.submit(OWNER, job._id, {})).rejects.toBeInstanceOf(ValidationError);
    storage.objects.set(`vireon-video/${JOB_ID}/final.mp4`, { size: 7_000_001, etag: 'changed' });
    await expect(service.submit(OWNER, job._id, { confirm: true })).rejects.toThrow(/re-rendered/);
    storage.objects.set(`vireon-video/${JOB_ID}/final.mp4`, { size: 7_000_000, etag: 'job-etag' });
    const { enqueued } = await service.submit(OWNER, job._id, { confirm: true });
    expect(enqueued).toBe(true);
  });

  it('lists only finished standalone videos with their publishing state', async () => {
    const { job } = await draft();
    Object.assign(PublishingJob.rows[0], { status: 'COMPLETED', remote: { videoId: 'VID9', url: 'https://www.youtube.com/watch?v=VID9' } });
    const { videos } = await service.listStandaloneVideos(OWNER);
    expect(videos.map((v) => v._id)).toEqual([JOB_ID]); // the one still rendering is not offered
    expect(videos[0]).toMatchObject({ title: 'Closures in 60 seconds', type: 'youtube_shorts', publishable: true, renderUrl: URL_OF(JOB_ID) });
    expect(videos[0].published[0]).toMatchObject({ jobId: job._id, videoId: 'VID9' });
    expect(videos[0].latestJob.status).toBe('COMPLETED');
  });

  it("does not show another owner's publishing state", async () => {
    await draft();
    const { videos } = await service.listStandaloneVideos('someone-else');
    expect(videos[0].latestJob).toBeNull();
  });

  it('filters the job list by standalone video', async () => {
    await draft();
    await service.createDraft(OWNER, { accountId: IDS.account, courseVideoId: IDS.video });
    expect((await service.list(OWNER, { videoJobId: JOB_ID })).jobs).toHaveLength(1);
    expect((await service.list(OWNER, {})).jobs).toHaveLength(2);
  });
});

describe('the worker publishes a standalone job (no course involved)', () => {
  it('uploads and completes a job whose courseId is null', async () => {
    const { job } = await draft();
    await service.submit(OWNER, job._id, { confirm: true });

    const SIZE = 7_000_000;
    let received = 0;
    const api = {
      initiateUpload: jest.fn(async () => 'https://upload.example/s'),
      uploadChunk: jest.fn(async (_t, _u, { chunk, start }) => {
        received = start + chunk.length;
        return received >= SIZE ? { done: true, video: { id: 'VIDS', status: { uploadStatus: 'uploaded' } } } : { done: false, nextOffset: received };
      }),
      queryUpload: jest.fn(),
      getVideoStatus: jest.fn(async () => ({ uploadStatus: 'processed', privacyStatus: 'private', processingStatus: 'succeeded' })),
    };
    const result = await processYouTubeJob(job._id, {
      store: new PublishingJobStore({ now: () => clock }), api, auth: authFake(), storage, enqueue: jest.fn(), workerId: 'w1',
      settings: settingsFor({ apiVerified: true, chunkSizeBytes: 1024 * 1024 })(), now: () => clock, sleep: async () => {},
    });

    expect(result.outcome).toBe('completed');
    expect(PublishingJob.rows[0]).toMatchObject({ status: 'COMPLETED', courseId: null, remote: { videoId: 'VIDS' } });
    expect(api.initiateUpload.mock.calls[0][1].body.snippet.title).toBe('Closures in 60 seconds');
    expect(api.initiateUpload.mock.calls[0][1].contentType).toBe('video/mp4');
  });
});
