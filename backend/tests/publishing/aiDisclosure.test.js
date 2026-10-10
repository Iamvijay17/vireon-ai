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
const { validateYouTubeMetadata } = require('../../src/services/publishing/youtube/metadata');
const { KEY, OWNER, IDS, RENDER_URL, storageFake, queueFake, authFake, settingsFor } = require('./helpers/harness');

const NOTE = 'Made with AI.';
const bytes = (s) => Buffer.byteLength(s, 'utf8');

const build = (aiDisclosure) => new PublishingService({
  auth: authFake(), queues: queueFake().queues, storage: storageFake(), settings: settingsFor({ apiVerified: true, aiDisclosure }),
  store: new PublishingJobStore(), now: () => Date.parse('2026-10-10T12:00:00Z'),
});

beforeAll(() => { config.publishing.encryptionKey = KEY; });
beforeEach(() => {
  [PublishingJob, PlatformAccount, Course, CourseVideo, VideoJob].forEach((m) => m.reset());
  PlatformAccount.seed({ _id: IDS.account, ownerId: OWNER, platform: 'youtube', externalId: 'UC1', refreshTokenEnc: cipher.encrypt('RT') });
  Course.seed({ _id: IDS.course, title: 'C', language: 'english' });
  CourseVideo.seed({
    _id: IDS.video, courseId: IDS.course, title: 'L1', order: 1, renderUrl: RENDER_URL(IDS.video), videoStatus: 'Completed', status: 'Completed',
    script: { title: 'L1', description: 'How closures work.' },
  });
});

const draftOf = async (service) => (await service.createDraft(OWNER, { accountId: IDS.account, courseVideoId: IDS.video })).job;

describe('AI-generated disclosure in the description', () => {
  it('is added to the end of a new draft\'s description', async () => {
    const job = await draftOf(build(NOTE));
    expect(job.metadata.description).toBe(`How closures work.\n\n${NOTE}`);
  });

  it('is the whole description when the video has none', async () => {
    CourseVideo.rows[0].script = { title: 'L1' };
    CourseVideo.rows[0].topic = '';
    expect((await draftOf(build(NOTE))).metadata.description).toBe(NOTE);
  });

  it('can be turned off with an empty setting', async () => {
    expect((await draftOf(build(''))).metadata.description).toBe('How closures work.');
    PublishingJob.reset();
    expect((await draftOf(build(undefined))).metadata.description).toBe('How closures work.');
  });

  it('is not repeated when the description already says it', async () => {
    CourseVideo.rows[0].script = { title: 'L1', description: `Intro. ${NOTE}` };
    expect((await draftOf(build(NOTE))).metadata.description).toBe(`Intro. ${NOTE}`);
  });

  it('stays editable: the user can change or remove it before publishing', async () => {
    const service = build(NOTE);
    const job = await draftOf(service);
    const edited = await service.updateMetadata(OWNER, job._id, { description: 'My own wording.' });
    expect(edited.metadata.description).toBe('My own wording.');
  });

  it('never pushes a long description past YouTube\'s limit - the original is trimmed, the disclosure is kept', async () => {
    CourseVideo.rows[0].script = { title: 'L1', description: 'é'.repeat(2490) }; // ~4980 bytes on its own
    const job = await draftOf(build(NOTE));
    expect(job.metadata.description.endsWith(NOTE)).toBe(true);
    expect(bytes(job.metadata.description)).toBeLessThanOrEqual(5000);
    expect(() => validateYouTubeMetadata(job.metadata, { apiVerified: true, now: Date.now() })).not.toThrow();
  });

  it('is on by default in the real configuration, and YouTube\'s own AI flag stays on', async () => {
    expect(config.publishing.youtube.aiDisclosure).toMatch(/AI/);
    const job = await draftOf(build(NOTE));
    expect(job.metadata.containsSyntheticMedia).toBe(true);
  });
});
