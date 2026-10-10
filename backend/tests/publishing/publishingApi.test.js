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
jest.mock('../../src/models/OAuthState', () => require('./helpers/fakeMongo').makeStateModel());
jest.mock('../../src/models/Course', () => require('./helpers/fakeMongo').createModel({ name: 'Course', idPrefix: 'cou' }));
jest.mock('../../src/models/CourseVideo', () => require('./helpers/fakeMongo').createModel({ name: 'CourseVideo', idPrefix: 'vid' }));
jest.mock('../../src/models/CoursePublishingProfile', () => require('./helpers/fakeMongo').createModel({ name: 'CoursePublishingProfile', idPrefix: 'cou' }));

let mockRuntime;
jest.mock('../../src/services/publishing', () => ({ getRuntime: () => mockRuntime }));

const mockStorage = { getObjectStream: jest.fn() };
jest.mock('../../src/services/storage/providers', () => ({ getStorageProvider: () => mockStorage }));

const http = require('http');
const { Readable } = require('stream');
const express = require('express');
const config = require('../../src/config');
const PublishingJob = require('../../src/models/PublishingJob');
const PlatformAccount = require('../../src/models/PlatformAccount');
const OAuthState = require('../../src/models/OAuthState');
const Course = require('../../src/models/Course');
const CourseVideo = require('../../src/models/CourseVideo');
const CoursePublishingProfile = require('../../src/models/CoursePublishingProfile');
const cipher = require('../../src/services/publishing/crypto');
const PublishingService = require('../../src/services/publishing/PublishingService');
const PublishingJobStore = require('../../src/services/publishing/PublishingJobStore');
const YouTubeAuthService = require('../../src/services/publishing/youtube/YouTubeAuthService');
const { REQUIRED_SCOPES } = require('../../src/services/publishing/youtube/constants');
const errorHandler = require('../../src/middleware/errorHandler');
const router = require('../../src/routes/publishing');
const { KEY, OWNER, IDS, RENDER_URL, storageFake, queueFake } = require('./helpers/harness');

const ORIGIN = config.cors.origins[0];
const FRONTEND = config.publishing.frontendUrl;

let server; let base; let q; let storage; let googleApi;

const call = async (method, path, { body, headers = {}, origin = ORIGIN, redirect = 'manual' } = {}) => {
  const res = await fetch(`${base}/api/publishing${path}`, {
    method, redirect,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(origin ? { Origin: origin } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, headers: res.headers };
};

beforeAll(async () => {
  config.publishing.encryptionKey = KEY;
  const app = express();
  app.use(express.json());
  app.use('/api/publishing', router);
  app.use(errorHandler);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  [PublishingJob, PlatformAccount, OAuthState, Course, CourseVideo, CoursePublishingProfile].forEach((m) => m.reset());
  jest.clearAllMocks();

  storage = storageFake();
  q = queueFake();
  googleApi = {
    isConfigured: jest.fn(() => true),
    assertConfigured: jest.fn(),
    buildAuthUrl: jest.fn(({ state }) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`),
    exchangeCode: jest.fn(async () => ({ accessToken: 'AT', refreshToken: 'RT-secret', expiresInSec: 3600, scopes: REQUIRED_SCOPES })),
    getMyChannel: jest.fn(async () => ({ id: 'UC1', title: 'Chan', thumbnailUrl: '' })),
    refreshAccessToken: jest.fn(),
    revoke: jest.fn(async () => true),
  };
  const auth = new YouTubeAuthService({ api: googleApi });
  const store = new PublishingJobStore();
  const settings = () => ({
    youtube: { apiVerified: true, maxUploadBytes: 4 * 1024 ** 3, dailyUploadLimit: 100, maxAttempts: 5 }, export: { maxBytes: 1e12 }, google: {}, encryptionKey: KEY,
  });
  mockRuntime = { auth, store, api: googleApi, service: new PublishingService({ auth, queues: q.queues, storage, settings, store }) };

  Course.seed({ _id: IDS.course, title: 'C', language: 'english' });
  CourseVideo.seed({ _id: IDS.video, courseId: IDS.course, title: 'L1', order: 1, renderUrl: RENDER_URL(IDS.video), videoStatus: 'Completed', status: 'Completed', script: { title: 'L1', description: 'd', tags: [] } });
  PlatformAccount.seed({ _id: IDS.account, ownerId: OWNER, platform: 'youtube', externalId: 'UC1', displayName: 'Chan', refreshTokenEnc: cipher.encrypt('RT') });
});

const stateOf = (authUrl) => new URL(authUrl).searchParams.get('state');

describe('OAuth over HTTP', () => {
  it('starts a connection and returns a Google URL carrying a one-time state', async () => {
    const res = await call('POST', '/accounts/youtube/connect', { body: {} });
    expect(res.status).toBe(200);
    expect(res.json.authUrl).toMatch(/^https:\/\/accounts\.google\.com\//);
    expect(OAuthState.rows).toHaveLength(1);
  });

  it('says so (503) instead of failing obscurely when Google credentials are not configured', async () => {
    const { PublishError } = require('../../src/services/publishing/errors');
    googleApi.assertConfigured.mockImplementation(() => { throw new PublishError('NOT_CONFIGURED', 'Google OAuth is not configured on the server'); });
    const res = await call('POST', '/accounts/youtube/connect', { body: {} });
    expect(res.status).toBe(503);
    expect(res.json.error).toMatch(/not configured/);
    expect(OAuthState.rows).toHaveLength(0);
  });

  it('rejects an unsupported return path', async () => {
    const res = await call('POST', '/accounts/youtube/connect', { body: { returnTo: 'https://evil.example' } });
    expect(res.status).toBe(400);
    expect(OAuthState.rows).toHaveLength(0);
  });

  it('completes the flow: validates state, redirects to the app (fixed address), exposes no token', async () => {
    const { json } = await call('POST', '/accounts/youtube/connect', { body: {} });
    const res = await call('GET', `/oauth/google/callback?state=${stateOf(json.authUrl)}&code=abc`, { origin: null });

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`${FRONTEND}/publishing?connect=connected`);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');

    const list = await call('GET', '/accounts');
    expect(list.json.accounts.map((a) => a.displayName)).toContain('Chan');
    expect(list.text).not.toMatch(/RT-secret|refreshToken|v1:/);
  });

  it('refuses a forged or replayed state and still redirects only to the app', async () => {
    const forged = await call('GET', '/oauth/google/callback?state=forged&code=abc', { origin: null });
    expect(forged.status).toBe(303);
    expect(forged.headers.get('location')).toBe(`${FRONTEND}/publishing?connect=state`);
    expect(googleApi.exchangeCode).not.toHaveBeenCalled();

    const { json } = await call('POST', '/accounts/youtube/connect', { body: {} });
    const url = `/oauth/google/callback?state=${stateOf(json.authUrl)}&code=abc`;
    await call('GET', url, { origin: null });
    const replay = await call('GET', url, { origin: null });
    expect(replay.headers.get('location')).toBe(`${FRONTEND}/publishing?connect=state`);
  });

  it('cannot be turned into an open redirect by extra query parameters', async () => {
    const res = await call('GET', '/oauth/google/callback?state=x&redirect=https://evil.example&returnTo=//evil.example&next=http://evil.example', { origin: null });
    expect(res.headers.get('location').startsWith(`${FRONTEND}/`)).toBe(true);
    expect(res.headers.get('location')).not.toMatch(/evil/);
  });

  it('tolerates array / odd query values', async () => {
    const res = await call('GET', '/oauth/google/callback?state[]=a&state[]=b&code[x]=1', { origin: null });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`${FRONTEND}/publishing?connect=state`);
  });

  it('reports a denied consent screen', async () => {
    const { json } = await call('POST', '/accounts/youtube/connect', { body: {} });
    const res = await call('GET', `/oauth/google/callback?state=${stateOf(json.authUrl)}&error=access_denied`, { origin: null });
    expect(res.headers.get('location')).toBe(`${FRONTEND}/publishing?connect=denied`);
  });
});

describe('CSRF and unauthorized access', () => {
  it('refuses state-changing requests from a foreign web origin, with no side effects', async () => {
    const evil = 'https://evil.example';
    const connect = await call('POST', '/accounts/youtube/connect', { body: {}, origin: evil });
    expect(connect.status).toBe(403);
    expect(OAuthState.rows).toHaveLength(0);

    const del = await call('DELETE', `/accounts/${IDS.account}`, { origin: evil });
    expect(del.status).toBe(403);
    expect(PlatformAccount.rows.find((a) => a._id === IDS.account)).toBeDefined();

    const draft = await call('POST', '/jobs', { body: { accountId: IDS.account, courseVideoId: IDS.video }, origin: evil });
    expect(draft.status).toBe(403);
    expect(PublishingJob.rows).toHaveLength(0);
  });

  it('allows the app\'s own origin, and non-browser clients that send no Origin', async () => {
    expect((await call('POST', '/accounts/youtube/connect', { body: {}, origin: ORIGIN })).status).toBe(200);
    expect((await call('POST', '/accounts/youtube/connect', { body: {}, origin: null })).status).toBe(200);
  });

  it('answers another owner\'s account and job with 404 - indistinguishable from not existing', async () => {
    PlatformAccount.seed({ _id: 'pac-cccccccc', ownerId: 'someone-else', platform: 'youtube', externalId: 'UCX', refreshTokenEnc: cipher.encrypt('x') });
    const job = PublishingJob.seed({ _id: 'pub-dddddddd', ownerId: 'someone-else', platform: 'youtube', courseId: IDS.course, status: 'DRAFT' });

    expect((await call('DELETE', '/accounts/pac-cccccccc')).status).toBe(404);
    expect((await call('GET', `/jobs/${job._id}`)).status).toBe(404);
    expect((await call('PATCH', `/jobs/${job._id}`, { body: { title: 'x' } })).status).toBe(404);
    expect((await call('POST', `/jobs/${job._id}/submit`, { body: { confirm: true } })).status).toBe(404);
    expect((await call('POST', `/jobs/${job._id}/cancel`)).status).toBe(404);
    expect((await call('POST', `/jobs/${job._id}/retry`)).status).toBe(404);
    expect((await call('GET', `/jobs/${job._id}/download`)).status).toBe(404);
    expect((await call('GET', `/jobs/pub-zzzzzzzz`)).status).toBe(404);
    expect((await call('GET', '/jobs')).json.jobs).toHaveLength(0);
    expect(PlatformAccount.rows.find((a) => a._id === 'pac-cccccccc')).toBeDefined();
    expect(q.queue.add).not.toHaveBeenCalled();
  });

  it('rejects malformed ids before touching the database', async () => {
    expect((await call('GET', '/jobs/not-an-id')).status).toBe(400);
    expect((await call('DELETE', '/accounts/..%2F..%2Fetc')).status).toBe(400);
    expect((await call('GET', '/courses/xyz/lessons')).status).toBe(400);
  });
});

describe('publishing flow over HTTP', () => {
  const createDraft = (extra = {}) => call('POST', '/jobs', { body: { accountId: IDS.account, courseVideoId: IDS.video, ...extra } });

  it('draft -> edit -> explicit approval -> queued; nothing is queued before approval', async () => {
    const created = await createDraft();
    expect(created.status).toBe(201);
    const id = created.json.job._id;
    expect(created.json.job.actions).toMatchObject({ canSubmit: true, canEdit: true });
    expect(q.queue.add).not.toHaveBeenCalled();

    const edited = await call('PATCH', `/jobs/${id}`, { body: { metadata: { title: 'Better title', tags: ['a', 'b'] } } });
    expect(edited.status).toBe(200);
    expect(edited.json.job.metadata.title).toBe('Better title');

    const noConfirm = await call('POST', `/jobs/${id}/submit`, { body: {} });
    expect(noConfirm.status).toBe(400);
    expect((await call('POST', `/jobs/${id}/submit`, { body: { confirm: 'true' } })).status).toBe(400);
    expect(q.queue.add).not.toHaveBeenCalled();

    const submitted = await call('POST', `/jobs/${id}/submit`, { body: { confirm: true } });
    expect(submitted.status).toBe(202);
    expect(submitted.json.job.status).toBe('QUEUED');
    expect(q.queue.add).toHaveBeenCalledTimes(1);
    expect(submitted.text).not.toMatch(/dedupeKey|sessionEnc|lease/);
    expect(submitted.text).not.toMatch(/final\.mp4|vireon-video/); // internal storage location stays server-side
  });

  it('returns field-level errors for invalid metadata', async () => {
    const res = await createDraft({ metadata: { title: 'x'.repeat(150), categoryId: '9999' } });
    expect(res.status).toBe(400);
    expect(res.json.details.map((d) => d.field)).toEqual(expect.arrayContaining(['title', 'categoryId']));
  });

  it('is idempotent for an identical draft and 409s a duplicate of a queued one', async () => {
    const first = await createDraft();
    const again = await createDraft();
    expect(again.status).toBe(200);
    expect(again.json.existing).toBe(true);
    expect(again.json.job._id).toBe(first.json.job._id);

    await call('POST', `/jobs/${first.json.job._id}/submit`, { body: { confirm: true } });
    expect((await createDraft()).status).toBe(409);
  });

  it('cancel and retry follow the allowed transitions', async () => {
    const id = (await createDraft()).json.job._id;
    await call('POST', `/jobs/${id}/submit`, { body: { confirm: true } });
    expect((await call('POST', `/jobs/${id}/retry`)).status).toBe(409); // not failed
    expect((await call('POST', `/jobs/${id}/cancel`)).json.job.status).toBe('CANCELLED');
    expect((await call('POST', `/jobs/${id}/cancel`)).status).toBe(409);
  });

  it('lists jobs and history', async () => {
    await createDraft();
    expect((await call('GET', '/jobs')).json.pagination.total).toBe(1);
    expect((await call('GET', '/history')).json.jobs).toHaveLength(0);
    expect((await call('GET', '/jobs?status=BOGUS')).status).toBe(400);
  });

  it('serves capabilities that say Udemy cannot be published to directly', async () => {
    const res = await call('GET', '/capabilities');
    expect(res.status).toBe(200);
    expect(res.json.udemy.directPublishing).toBe(false);
    expect(res.json.authentication.enabled).toBe(false);
    expect(res.json.youtube.configured).toBe(true);
  });
});

describe('Udemy export over HTTP', () => {
  it('queues a package build and 404s a download until it is finished', async () => {
    const res = await call('POST', `/courses/${IDS.course}/udemy/export`, { body: { includeMedia: false } });
    expect(res.status).toBe(202);
    expect(q.queues).toHaveBeenCalledWith('export');
    expect((await call('GET', `/jobs/${res.json.job._id}/download`)).status).toBe(404);
  });

  it('streams a finished package under a safe file name, without revealing the storage location', async () => {
    const job = PublishingJob.seed({
      _id: 'pub-eeeeeeee', ownerId: OWNER, platform: 'udemy-export', courseId: IDS.course, status: 'COMPLETED',
      exportResult: { bucket: 'vireon-video', key: 'publishing/exports/pub-eeeeeeee/x.zip', fileName: 'C - Udemy package.zip', size: 5 },
    });
    mockStorage.getObjectStream.mockResolvedValue(Readable.from([Buffer.from('PKzip')]));

    const res = await call('GET', `/jobs/${job._id}/download`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="C - Udemy package.zip"');
    expect(res.text).toBe('PKzip');
    expect(mockStorage.getObjectStream).toHaveBeenCalledWith('vireon-video', 'publishing/exports/pub-eeeeeeee/x.zip');

    const view = await call('GET', `/jobs/${job._id}`);
    expect(view.json.job.actions.canDownload).toBe(true);
    expect(view.text).not.toMatch(/publishing\/exports|"bucket"/);
  });

  it('saves the Udemy profile and rejects lessons from another course or duplicated across sections', async () => {
    const ok = await call('PUT', `/courses/${IDS.course}/udemy`, { body: { subtitle: 'S', learningObjectives: ['a'], sections: [{ title: 'One', lessonIds: [IDS.video] }] } });
    expect(ok.status).toBe(200);
    const dup = await call('PUT', `/courses/${IDS.course}/udemy`, { body: { sections: [{ title: 'A', lessonIds: [IDS.video] }, { title: 'B', lessonIds: [IDS.video] }] } });
    expect(dup.status).toBe(400);
    const foreign = await call('PUT', `/courses/${IDS.course}/udemy`, { body: { sections: [{ title: 'A', lessonIds: ['vid-zzzzzzzz'] }] } });
    expect(foreign.status).toBe(400);
  });

  it('returns the validation report for the course', async () => {
    const res = await call('GET', `/courses/${IDS.course}/udemy`);
    expect(res.status).toBe(200);
    expect(res.json.validation.ok).toBe(false);
    expect(res.json.validation.errors.map((e) => e.code)).toContain('COURSE_SUBTITLE_MISSING');
    expect(res.json.capabilities.directPublishing).toBe(false);
  });
});
