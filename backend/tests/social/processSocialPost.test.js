jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), border: jest.fn(),
}));
jest.mock('../../src/services/social/SocialEvents', () => ({ emitPost: jest.fn(), summarize: jest.fn() }));
jest.mock('../../src/services/publishing/PublishingEvents', () => ({ emitJob: jest.fn(), emitAccount: jest.fn() }));
jest.mock('../../src/models/SocialPost', () => require('../publishing/helpers/fakeMongo').makeSocialPostModel());
jest.mock('../../src/models/PlatformAccount', () => {
  const model = require('../publishing/helpers/fakeMongo').makeAccountModel();
  model.ACCOUNT_STATUS = { CONNECTED: 'connected', NEEDS_REAUTH: 'needs_reauth' };
  return model;
});

const crypto = require('crypto');
const config = require('../../src/config');
const SocialPost = require('../../src/models/SocialPost');
const PlatformAccount = require('../../src/models/PlatformAccount');
const SocialPostStore = require('../../src/services/social/SocialPostStore');
const { processSocialPost } = require('../../src/services/social/processSocialPost');
const { PublishError } = require('../../src/services/publishing/errors');
const { fakeMeta, fakeThreads, storageFake } = require('./helpers/platforms');

const KEY = crypto.randomBytes(32).toString('base64');
const OWNER = 'local';
const ACC = { fb: 'pac-fbfbfbfb', ig: 'pac-igigigig', th: 'pac-thththth' };
const SIZE = 5000;
const OBJ = { bucket: 'vireon-video', key: 'job-aaaaaaaa/final.mp4' };
const HOUR = 3600_000;

const baseSettings = (over = {}) => ({
  processingPollMs: 10, processingWindowMs: 1000, processingMaxChecks: 3, maxAttempts: 3, uploadChunkBytes: 1024,
  publicMediaBaseUrl: '', mediaTokenTtlMs: HOUR, dailyLimits: { instagram: 100, facebook: 30, threads: 250 }, meta: { graphVersion: 'v25.0' }, aiLabel: true,
  ...over,
});

let clock; let store; let storage; let meta; let threads; let auth; let enqueue; let seq;

const media = (over = {}) => ({ kind: 'video', ...OBJ, size: SIZE, etag: 'etag-1', contentType: 'video/mp4', fileName: 'v.mp4', durationSec: 30, width: 1080, height: 1920, ...over });

function seedPost(over = {}) {
  seq += 1;
  const platform = over.platform || 'instagram';
  const accountId = { facebook: ACC.fb, instagram: ACC.ig, threads: ACC.th }[platform];
  const format = over.format || { facebook: 'reel', instagram: 'reel', threads: 'text' }[platform];
  const hasMedia = format !== 'text';
  return SocialPost.seed({
    ownerId: OWNER, campaignId: 'cam-aaaaaaaa', videoJobId: 'job-aaaaaaaa', platform, accountId, accountLabel: 'Acc', format,
    status: 'QUEUED', queuedAt: new Date(clock), maxAttempts: 3,
    content: { caption: 'Closures explained', hashtags: ['#js'], cta: 'Watch now', linkUrl: '' },
    media: hasMedia ? media() : {},
    fingerprint: `fp-${seq}`, dedupeKey: `fp-${seq}`,
    ...over,
  });
}

const run = (postId, over = {}) => processSocialPost(postId, {
  store, auth, apis: { meta, threads }, storage, enqueue, workerId: over.workerId || 'w1',
  settings: baseSettings(over.settings), now: () => clock, sleep: async (ms) => { clock += ms; },
});
const row = (i = 0) => SocialPost.rows[i];

beforeAll(() => { config.publishing.encryptionKey = KEY; });
beforeEach(() => {
  SocialPost.reset(); PlatformAccount.reset();
  jest.clearAllMocks();
  seq = 0;
  clock = Date.parse('2026-10-10T12:00:00Z');
  store = new SocialPostStore({ now: () => clock });
  storage = storageFake({ [`${OBJ.bucket}/${OBJ.key}`]: { size: SIZE, etag: 'etag-1' } });
  meta = fakeMeta();
  threads = fakeThreads();
  auth = {
    getAccessToken: jest.fn(async () => 'TOK'),
    markNeedsReauth: jest.fn(async (id, reason) => PlatformAccount.findByIdAndUpdate(id, { $set: { status: 'needs_reauth', statusReason: reason } }, { new: true })),
  };
  enqueue = jest.fn(async () => {});
  PlatformAccount.seed({ _id: ACC.fb, ownerId: OWNER, platform: 'facebook', externalId: 'PAGE1', displayName: 'My Page' });
  PlatformAccount.seed({ _id: ACC.ig, ownerId: OWNER, platform: 'instagram', externalId: 'IG1', displayName: 'My IG', username: 'my_ig' });
  PlatformAccount.seed({ _id: ACC.th, ownerId: OWNER, platform: 'threads', externalId: '777', displayName: 'Me', username: 'me' });
});

describe('successful publishing', () => {
  it('publishes a Threads text post and completes only after the platform confirmed it', async () => {
    const post = seedPost({ platform: 'threads', format: 'text' });
    const statusWhenPublishing = [];
    threads.publishContainer.mockImplementationOnce(async (...a) => { statusWhenPublishing.push(row().status); return fakeThreads().publishContainer(...a).catch(() => ({ id: 'THM1' })); });

    expect(await run(post._id)).toEqual({ outcome: 'completed' });
    expect(statusWhenPublishing).toEqual(['PROCESSING']); // not COMPLETED while the publish was in flight
    expect(row()).toMatchObject({ status: 'COMPLETED', progress: { percent: 100, phase: 'Published' } });
    expect(row().remote.postId).toBe('THM1');
    expect(row().remote.publishedAt).toBeInstanceOf(Date);
    expect(row().completedAt).toBeInstanceOf(Date);
    expect(row().dedupeKey).toBe(post.dedupeKey); // a completed post keeps blocking duplicates
    expect(threads.state.calls[0][1]).toMatchObject({ mediaType: 'TEXT', text: 'Closures explained\n\nWatch now\n\n#js' });
    expect(row().events.map((e) => e.status)).toContain('COMPLETED');
  });

  it('sends a link as a Threads link attachment on text posts', async () => {
    const post = seedPost({ platform: 'threads', format: 'text', content: { caption: 'Read this', hashtags: [], cta: '', linkUrl: 'https://e.test/post' } });
    await run(post._id);
    expect(threads.state.calls[0][1]).toMatchObject({ linkAttachment: 'https://e.test/post' });
  });

  it('publishes an Instagram Reel from a public URL, waiting while the container processes', async () => {
    const post = seedPost({ platform: 'instagram' });
    meta.state.igStatusScript.push('IN_PROGRESS', 'IN_PROGRESS');
    expect(await run(post._id, { settings: { publicMediaBaseUrl: 'https://media.example.com' } })).toEqual({ outcome: 'completed' });
    const created = meta.createIgContainer.mock.calls[0][2];
    expect(created).toMatchObject({ mediaType: 'REELS', isAiGenerated: true });
    expect(created.videoUrl).toMatch(/^https:\/\/media\.example\.com\/api\/social\/media\/[\w-]+\.[\w-]+\/final\.mp4$/);
    expect(created.resumable).toBeUndefined();
    expect(meta.ruploadBytes).not.toHaveBeenCalled();
    expect(meta.getIgContainer.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(row()).toMatchObject({ status: 'COMPLETED', remote: { containerId: 'IGC1' } });
    expect(row().remote.postId).toMatch(/^IGM\d+$/);
    expect(row().remote.permalink).toContain(`instagram.com/reel/${row().remote.postId}`);
    expect(meta.state.posted).toHaveLength(1);
  });

  it('without a public URL, uploads the Reel to Instagram resumably straight from storage', async () => {
    const post = seedPost({ platform: 'instagram' });
    await run(post._id);
    expect(meta.createIgContainer.mock.calls[0][2]).toMatchObject({ mediaType: 'REELS', resumable: true });
    expect(meta.ruploadBytes).toHaveBeenCalledTimes(1);
    expect(meta.state.uploaded).toBe(SIZE);
    expect(row().status).toBe('COMPLETED');
    expect(row().progress.bytesUploaded).toBe(SIZE);
  });

  it('does not label non-Vireon media as AI generated', async () => {
    const post = seedPost({ platform: 'instagram', videoJobId: null, courseVideoId: null });
    await run(post._id);
    expect(meta.createIgContainer.mock.calls[0][2].isAiGenerated).toBe(false);
  });

  it('publishes an Instagram image from a public URL only', async () => {
    const post = seedPost({ platform: 'instagram', format: 'image', media: media({ kind: 'image', contentType: 'image/jpeg', key: 'social/local/cam/i.jpg' }) });
    storage.objects.set(`${OBJ.bucket}/social/local/cam/i.jpg`, { size: SIZE, etag: 'etag-1' });
    await run(post._id, { settings: { publicMediaBaseUrl: 'https://media.example.com' } });
    expect(meta.createIgContainer.mock.calls[0][2]).toMatchObject({ imageUrl: expect.stringContaining('/i.jpg') });
    expect(row().status).toBe('COMPLETED');
  });

  it('publishes a Facebook text post and a photo (bytes uploaded directly, no public URL)', async () => {
    const text = seedPost({ platform: 'facebook', format: 'text', content: { caption: 'Hello page', hashtags: [], cta: '', linkUrl: 'https://e.test' } });
    await run(text._id);
    expect(meta.publishPageText.mock.calls[0][2]).toEqual({ message: 'Hello page', link: 'https://e.test' });
    expect(row(0)).toMatchObject({ status: 'COMPLETED' });

    const photo = seedPost({ platform: 'facebook', format: 'image', media: media({ kind: 'image', contentType: 'image/png', key: 'social/local/cam/p.png', size: 2048 }) });
    storage.objects.set(`${OBJ.bucket}/social/local/cam/p.png`, { size: 2048, etag: 'etag-1' });
    await run(photo._id);
    expect(meta.publishPagePhoto.mock.calls[0][2]).toMatchObject({ contentType: 'image/png' });
    expect(row(1)).toMatchObject({ status: 'COMPLETED' });
  });

  it('publishes a Facebook Reel: start, upload, wait until ready, finish, then confirm it is live', async () => {
    const post = seedPost({ platform: 'facebook', format: 'reel' });
    await run(post._id);
    expect(meta.state.calls.map((c) => c[0]).filter((n) => ['startReel', 'ruploadBytes', 'finishReel'].includes(n))).toEqual(['startReel', 'ruploadBytes', 'finishReel']);
    expect(row()).toMatchObject({ status: 'COMPLETED', remote: { videoId: 'REEL1', postId: 'REEL1', state: 'live' } });
    expect(row().remote.permalink).toBe('https://www.facebook.com/reel/REEL1');
  });

  it('keeps a Facebook Reel in PROCESSING (not COMPLETED) until Facebook reports it live, then picks it up later without finishing twice', async () => {
    const post = seedPost({ platform: 'facebook', format: 'reel' });
    meta.state.reelStaysPublishing = true;
    expect(await run(post._id, { settings: { processingWindowMs: 50, processingPollMs: 20 } })).toEqual({ outcome: 'waiting' });
    expect(row()).toMatchObject({ status: 'PROCESSING', remote: { postId: 'REEL1', state: 'publishing' } });
    expect(row().completedAt).toBeFalsy();
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ _id: post._id }), { delayMs: 2 * 60_000 });

    meta.state.video.publishing = { status: 'complete' };
    clock += 2 * 60_000 + 1;
    expect(await run(post._id)).toEqual({ outcome: 'completed' });
    expect(meta.finishReel).toHaveBeenCalledTimes(1);
    expect(meta.startReel).toHaveBeenCalledTimes(1);
    expect(row().status).toBe('COMPLETED');
  });
});

describe('idempotency and resuming', () => {
  it('never publishes the same post twice: re-delivery of a finished post is skipped', async () => {
    const post = seedPost({ platform: 'threads', format: 'text' });
    await run(post._id);
    expect(await run(post._id)).toEqual({ outcome: 'skipped' });
    expect(await run(post._id, { workerId: 'w2' })).toEqual({ outcome: 'skipped' });
    expect(threads.state.posted).toHaveLength(1);
  });

  it('two workers cannot run the same post at once', async () => {
    const post = seedPost({ platform: 'threads', format: 'text' });
    const [a, b] = await Promise.all([run(post._id, { workerId: 'w1' }), run(post._id, { workerId: 'w2' })]);
    expect([a.outcome, b.outcome].sort()).toEqual(['completed', 'skipped']);
    expect(threads.state.posted).toHaveLength(1);
  });

  it('resumes with the container it already created instead of making a second one', async () => {
    const post = seedPost({ platform: 'threads', format: 'text', status: 'PROCESSING', remote: { containerId: 'THC9', postId: '', videoId: '', permalink: '', state: 'container_created', publishAttemptedAt: null, publishedAt: null }, lease: { owner: 'dead', expiresAt: new Date(clock - 1000) } });
    threads.state.containers.set('THC9', { published: false, params: { text: 'x' } });
    await run(post._id);
    expect(threads.createContainer).not.toHaveBeenCalled();
    expect(threads.publishContainer).toHaveBeenCalledWith('777', 'TOK', 'THC9');
    expect(row().status).toBe('COMPLETED');
  });

  it('takes over the run of a dead worker (expired lease) but not of a live one', async () => {
    const live = seedPost({ platform: 'threads', format: 'text', status: 'UPLOADING', lease: { owner: 'alive', expiresAt: new Date(clock + 60_000) } });
    expect(await run(live._id)).toEqual({ outcome: 'skipped' });
    const dead = seedPost({ platform: 'threads', format: 'text', status: 'UPLOADING', lease: { owner: 'dead', expiresAt: new Date(clock - 1) } });
    expect(await run(dead._id)).toEqual({ outcome: 'completed' });
  });

  it('a Facebook Reel upload that was interrupted continues from the offset Facebook confirmed', async () => {
    const post = seedPost({ platform: 'facebook', format: 'reel', status: 'UPLOADING', lease: { owner: 'dead', expiresAt: new Date(clock - 1) }, remote: { containerId: 'https://rupload.facebook.com/video-upload/v25.0/REEL1', videoId: 'REEL1', postId: '', permalink: '', state: 'upload_started', publishAttemptedAt: null, publishedAt: null } });
    meta.state.video.uploading = { status: 'in_progress', bytes_transferred: 2000 };
    await run(post._id);
    expect(meta.startReel).not.toHaveBeenCalled();
    expect(meta.state.calls.find((c) => c[0] === 'ruploadBytes')[1].offset).toBe(2000);
    expect(row().status).toBe('COMPLETED');
  });
});

describe('an interrupted publish (the answer was lost)', () => {
  const attempted = () => ({ containerId: 'IGC1', videoId: '', postId: '', permalink: '', state: 'container_created', publishAttemptedAt: new Date(clock - 10 * 60_000), publishedAt: null });

  it('Instagram: the container reports PUBLISHED -> finds the media and completes without publishing again', async () => {
    const post = seedPost({ platform: 'instagram', status: 'RETRYING', nextRetryAt: new Date(clock - 1), remote: attempted(), content: { caption: 'Hello', hashtags: [], cta: '', linkUrl: '' } });
    meta.state.igContainers.set('IGC1', { published: true, params: { caption: 'Hello' } });
    meta.state.igMedia.push({ id: 'IGM-REAL', permalink: 'https://www.instagram.com/reel/REAL/', timestamp: new Date(clock - 9 * 60_000).toISOString(), caption: 'Hello' });
    expect(await run(post._id)).toEqual({ outcome: 'completed' });
    expect(meta.publishIgContainer).not.toHaveBeenCalled();
    expect(row().remote).toMatchObject({ postId: 'IGM-REAL', permalink: 'https://www.instagram.com/reel/REAL/' });
  });

  it('Instagram: the container was NOT published -> it is safe to publish it now', async () => {
    const post = seedPost({ platform: 'instagram', status: 'RETRYING', nextRetryAt: new Date(clock - 1), remote: attempted() });
    meta.state.igContainers.set('IGC1', { published: false, params: {} });
    expect(await run(post._id)).toEqual({ outcome: 'completed' });
    expect(meta.publishIgContainer).toHaveBeenCalledTimes(1);
    expect(meta.createIgContainer).not.toHaveBeenCalled(); // same container, no second one
    expect(meta.state.posted).toHaveLength(1);
  });

  it('Instagram: PUBLISHED but the media cannot be found -> stops as OUTCOME_UNKNOWN, never re-publishes, keeps the duplicate lock', async () => {
    const post = seedPost({ platform: 'instagram', status: 'RETRYING', nextRetryAt: new Date(clock - 1), remote: attempted() });
    meta.state.igContainers.set('IGC1', { published: true, params: {} });
    expect(await run(post._id)).toEqual({ outcome: 'failed' });
    expect(row()).toMatchObject({ status: 'FAILED', error: { code: 'OUTCOME_UNKNOWN', retryable: false } });
    expect(row().error.action).toMatch(/isn't posted/);
    expect(row().dedupeKey).toBe(post.dedupeKey);
    expect(meta.publishIgContainer).not.toHaveBeenCalled();
  });

  it('Facebook text: found among the Page\'s recent posts -> completes without posting a duplicate', async () => {
    const content = { caption: 'Same text', hashtags: [], cta: '', linkUrl: '' };
    const post = seedPost({ platform: 'facebook', format: 'text', status: 'RETRYING', nextRetryAt: new Date(clock - 1), content, remote: { ...attempted(), containerId: '' } });
    meta.state.pagePosts.push({ id: 'PAGE1_999', message: 'Same text', created_time: new Date(clock - 9 * 60_000).toISOString(), permalink_url: 'https://www.facebook.com/PAGE1_999' });
    expect(await run(post._id)).toEqual({ outcome: 'completed' });
    expect(meta.publishPageText).not.toHaveBeenCalled();
    expect(row().remote.postId).toBe('PAGE1_999');
  });

  it('Facebook text: not found after enough time -> publishes again; if the attempt is too fresh to be sure -> OUTCOME_UNKNOWN', async () => {
    const content = { caption: 'Other text', hashtags: [], cta: '', linkUrl: '' };
    const old = seedPost({ platform: 'facebook', format: 'text', status: 'RETRYING', nextRetryAt: new Date(clock - 1), content, remote: { ...attempted(), containerId: '' } });
    await run(old._id);
    expect(meta.publishPageText).toHaveBeenCalledTimes(1);
    expect(row(0).status).toBe('COMPLETED');

    meta.publishPageText.mockClear();
    meta.state.pagePosts.length = 0; // the earlier post is not this post's earlier attempt
    const fresh = seedPost({ platform: 'facebook', format: 'text', status: 'RETRYING', nextRetryAt: new Date(clock - 1), content, remote: { ...attempted(), containerId: '', publishAttemptedAt: new Date(clock - 20_000) } });
    await run(fresh._id);
    expect(row(1)).toMatchObject({ status: 'FAILED', error: { code: 'OUTCOME_UNKNOWN' } });
    expect(meta.publishPageText).not.toHaveBeenCalled();
  });

  it('an ambiguous failure at publish (timeout) keeps the "attempted" marker so the next run reconciles instead of re-posting', async () => {
    const post = seedPost({ platform: 'instagram' });
    meta.state.failures.publishIgContainer = [new PublishError('NETWORK', 'timed out', { retryable: true })];
    expect(await run(post._id, { settings: { publicMediaBaseUrl: 'https://media.example.com' } })).toEqual({ outcome: 'retrying' });
    expect(row().remote.publishAttemptedAt).toBeInstanceOf(Date);
    expect(row().quotaCountedAt).toBeInstanceOf(Date);
    // the platform did in fact publish before the answer was lost
    meta.state.igContainers.get('IGC1').published = true;
    meta.state.igMedia.push({ id: 'IGM-LOST', permalink: 'p', timestamp: new Date(clock).toISOString(), caption: row().content.caption.includes('Closures') ? meta.state.igContainers.get('IGC1').params.caption : '' });
    clock += 60_000;
    expect(await run(post._id, { settings: { publicMediaBaseUrl: 'https://media.example.com' } })).toEqual({ outcome: 'completed' });
    expect(meta.publishIgContainer).toHaveBeenCalledTimes(1); // only the lost attempt
    expect(row().remote.postId).toBe('IGM-LOST');
  });

  it('a definite refusal at publish releases the markers (nothing was posted, nothing counts against the quota)', async () => {
    const post = seedPost({ platform: 'threads', format: 'text' });
    threads.state.failures.publishContainer = [new PublishError('CONTENT_REJECTED', 'spam', { httpStatus: 400 })];
    expect(await run(post._id)).toEqual({ outcome: 'failed' });
    expect(row().remote.publishAttemptedAt).toBeNull();
    expect(row().quotaCountedAt).toBeFalsy();
    expect(row()).toMatchObject({ status: 'FAILED', error: { code: 'CONTENT_REJECTED', retryable: false } });
  });
});

describe('failure handling', () => {
  it('retries a transient failure with exponential backoff, then gives up and releases the duplicate lock', async () => {
    const post = seedPost({ platform: 'threads', format: 'text', maxAttempts: 3 });
    threads.state.failures.createContainer = [new PublishError('SERVER', 'HTTP 500', { httpStatus: 500 }), new PublishError('SERVER', 'HTTP 500', { httpStatus: 500 }), new PublishError('SERVER', 'HTTP 500', { httpStatus: 500 })];

    expect(await run(post._id)).toEqual({ outcome: 'retrying' });
    expect(row()).toMatchObject({ status: 'RETRYING', attempts: 1, error: { code: 'SERVER', retryable: true } });
    expect(enqueue).toHaveBeenLastCalledWith(expect.anything(), { delayMs: 5000 });
    expect(new Date(row().nextRetryAt).getTime()).toBe(clock + 5000);

    clock += 5001;
    expect(await run(post._id)).toEqual({ outcome: 'retrying' });
    expect(enqueue).toHaveBeenLastCalledWith(expect.anything(), { delayMs: 10_000 });

    clock += 10_001;
    expect(await run(post._id)).toEqual({ outcome: 'failed' });
    expect(row()).toMatchObject({ status: 'FAILED', attempts: 3 });
    expect(row().dedupeKey).toBeUndefined();
  });

  it('does not run a retry before its time', async () => {
    const post = seedPost({ platform: 'threads', format: 'text' });
    threads.state.failures.createContainer = [new PublishError('SERVER', 'HTTP 500')];
    await run(post._id);
    expect(await run(post._id)).toEqual({ outcome: 'skipped' });
  });

  it('does not retry permanent errors: invalid media fails immediately with an actionable message', async () => {
    const post = seedPost({ platform: 'instagram' });
    meta.state.failures.createIgContainer = [new PublishError('MEDIA_INVALID', 'Unsupported video format', { httpStatus: 400 })];
    expect(await run(post._id)).toEqual({ outcome: 'failed' });
    expect(row()).toMatchObject({ status: 'FAILED', attempts: 1, error: { code: 'MEDIA_INVALID', retryable: false } });
    expect(row().error.action).toMatch(/media/i);
    expect(enqueue).not.toHaveBeenCalled();
    expect(row().dedupeKey).toBeUndefined();
  });

  it('flags the account and stops when the platform says the permission was revoked', async () => {
    const post = seedPost({ platform: 'threads', format: 'text' });
    threads.state.failures.createContainer = [new PublishError('AUTH_REVOKED', 'token revoked', { httpStatus: 400 })];
    expect(await run(post._id)).toEqual({ outcome: 'failed' });
    expect(row()).toMatchObject({ status: 'FAILED', error: { code: 'AUTH_REVOKED', requiresReauth: true, retryable: false } });
    expect(auth.markNeedsReauth).toHaveBeenCalledWith(ACC.th, expect.stringMatching(/Reconnect/));
    expect(PlatformAccount.rows.find((r) => r._id === ACC.th).status).toBe('needs_reauth');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('treats a missing permission as needing reauthorisation too', async () => {
    const post = seedPost({ platform: 'facebook', format: 'text' });
    meta.state.failures.publishPageText = [new PublishError('PERMISSION_DENIED', '(#200) requires pages_manage_posts', { httpStatus: 403 })];
    await run(post._id);
    expect(row()).toMatchObject({ status: 'FAILED', error: { code: 'PERMISSION_DENIED', requiresReauth: true } });
    expect(PlatformAccount.rows.find((r) => r._id === ACC.fb).statusReason).toMatch(/pages_manage_posts/);
  });

  it('fails fast, without calling the platform, when the account is already flagged or was disconnected', async () => {
    const flagged = seedPost({ platform: 'threads', format: 'text' });
    PlatformAccount.rows.find((r) => r._id === ACC.th).status = 'needs_reauth';
    PlatformAccount.rows.find((r) => r._id === ACC.th).statusReason = 'Reconnect Threads';
    await run(flagged._id);
    expect(row()).toMatchObject({ status: 'FAILED', error: { code: 'AUTH_REVOKED', message: 'Reconnect Threads' } });

    const gone = seedPost({ platform: 'instagram' });
    PlatformAccount.reset();
    await run(gone._id);
    expect(row(1)).toMatchObject({ status: 'FAILED', error: { code: 'AUTH_REVOKED' } });
    expect(threads.createContainer).not.toHaveBeenCalled();
    expect(meta.createIgContainer).not.toHaveBeenCalled();
  });

  it('backs off much longer for rate limits', async () => {
    const post = seedPost({ platform: 'threads', format: 'text' });
    threads.state.failures.createContainer = [new PublishError('RATE_LIMITED', 'slow down', { httpStatus: 429 })];
    await run(post._id);
    expect(row().status).toBe('RETRYING');
    expect(enqueue).toHaveBeenLastCalledWith(expect.anything(), { delayMs: 60_000 });
  });

  it('refuses an expired token without calling the platform, with the reauthorisation hint', async () => {
    const post = seedPost({ platform: 'threads', format: 'text' });
    auth.getAccessToken.mockRejectedValue(new PublishError('AUTH_REVOKED', 'The saved access for this account expired'));
    await run(post._id);
    expect(row()).toMatchObject({ status: 'FAILED', error: { code: 'AUTH_REVOKED', requiresReauth: true } });
    expect(threads.createContainer).not.toHaveBeenCalled();
  });

  it('a wrong-key worker retries (and does NOT mark the account as needing reauthorisation)', async () => {
    const post = seedPost({ platform: 'threads', format: 'text' });
    auth.getAccessToken.mockRejectedValue(new PublishError('CREDENTIALS_UNREADABLE', 'cannot decrypt'));
    await run(post._id);
    expect(row().status).toBe('RETRYING');
    expect(auth.markNeedsReauth).not.toHaveBeenCalled();
  });

  it('re-validates the content right before sending and fails without touching the platform', async () => {
    const post = seedPost({ platform: 'threads', format: 'text', content: { caption: 'x'.repeat(600), hashtags: [], cta: '', linkUrl: '' } });
    await run(post._id);
    expect(row()).toMatchObject({ status: 'FAILED', error: { code: 'VALIDATION_FAILED', retryable: false } });
    expect(row().error.message).toMatch(/500/);
    expect(threads.createContainer).not.toHaveBeenCalled();
  });

  it('refuses media posts that need a public URL when none is configured', async () => {
    const post = seedPost({ platform: 'threads', format: 'video' });
    await run(post._id);
    expect(row()).toMatchObject({ status: 'FAILED', error: { code: 'VALIDATION_FAILED' } });
    expect(row().error.message).toMatch(/SOCIAL_PUBLIC_MEDIA_BASE_URL/);
  });

  it('fails when the stored media disappeared or was re-rendered since the post was created', async () => {
    const missing = seedPost({ platform: 'instagram' });
    storage.objects.clear();
    await run(missing._id);
    expect(row(0).error.code).toBe('SOURCE_MISSING');

    storage.objects.set(`${OBJ.bucket}/${OBJ.key}`, { size: SIZE, etag: 'etag-2' });
    const changed = seedPost({ platform: 'instagram' });
    await run(changed._id);
    expect(row(1).error.code).toBe('SOURCE_CHANGED');
    expect(meta.createIgContainer).not.toHaveBeenCalled();
  });

  it('reports media the platform failed to process as invalid media', async () => {
    const post = seedPost({ platform: 'instagram' });
    meta.state.igStatusScript.push('ERROR');
    await run(post._id, { settings: { publicMediaBaseUrl: 'https://media.example.com' } });
    expect(row()).toMatchObject({ status: 'FAILED', error: { code: 'MEDIA_INVALID' } });
    expect(row().error.message).toMatch(/codec/);
    expect(meta.publishIgContainer).not.toHaveBeenCalled();
  });

  it('starts over with a fresh container when the old one expired', async () => {
    const post = seedPost({ platform: 'threads', format: 'text' });
    threads.state.statusScript.push('EXPIRED');
    expect(await run(post._id)).toEqual({ outcome: 'retrying' });
    expect(row().remote.containerId).toBe('');
    clock += 5001;
    expect(await run(post._id)).toEqual({ outcome: 'completed' });
    expect(threads.createContainer).toHaveBeenCalledTimes(2);
    expect(threads.state.posted).toHaveLength(1);
  });

  it('hands a slow container back to the queue and later gives up after the maximum checks', async () => {
    const post = seedPost({ platform: 'threads', format: 'text' });
    threads.state.statusScript.push(...Array(200).fill('IN_PROGRESS'));
    const s = { processingWindowMs: 30, processingPollMs: 10, processingMaxChecks: 2 };
    expect(await run(post._id, { settings: s })).toEqual({ outcome: 'waiting' });
    expect(row()).toMatchObject({ status: 'PROCESSING', processingChecks: 1 });
    expect(enqueue).toHaveBeenLastCalledWith(expect.anything(), { delayMs: 120_000 });

    clock += 120_001;
    expect(await run(post._id, { settings: s })).toEqual({ outcome: 'waiting' });
    clock += 120_001;
    expect(await run(post._id, { settings: s })).toEqual({ outcome: 'failed' });
    expect(row().error.code).toBe('MEDIA_NOT_READY');
    expect(threads.createContainer).toHaveBeenCalledTimes(1);
    expect(threads.publishContainer).not.toHaveBeenCalled();
  });
});

describe('publishing allowances', () => {
  it('waits for the local daily allowance instead of failing, without spending attempts', async () => {
    for (let i = 0; i < 2; i += 1) {
      seedPost({ platform: 'instagram', status: 'COMPLETED', quotaCountedAt: new Date(clock - (10 - i) * HOUR) });
    }
    const post = seedPost({ platform: 'instagram' });
    const r = await run(post._id, { settings: { dailyLimits: { instagram: 2, facebook: 30, threads: 250 }, publicMediaBaseUrl: 'https://media.example.com' } });
    expect(r).toEqual({ outcome: 'retrying' });
    const waiting = SocialPost.rows[2];
    expect(waiting).toMatchObject({ status: 'RETRYING', deferrals: 1, attempts: 0, error: { code: 'PUBLISH_LIMIT_REACHED' } });
    // frees up 24h (+1 min) after the OLDEST counted publish
    expect(new Date(waiting.nextRetryAt).getTime()).toBe(clock - 10 * HOUR + 24 * HOUR + 60_000);
    expect(meta.createIgContainer).not.toHaveBeenCalled();
  });

  it('counts only Reels against Facebook\'s Reels limit', async () => {
    seedPost({ platform: 'facebook', format: 'text', status: 'COMPLETED', quotaCountedAt: new Date(clock - HOUR) });
    const post = seedPost({ platform: 'facebook', format: 'reel' });
    expect(await run(post._id, { settings: { dailyLimits: { instagram: 100, facebook: 1, threads: 250 } } })).toEqual({ outcome: 'completed' });
  });

  it('stops when the platform itself reports the allowance used up', async () => {
    const post = seedPost({ platform: 'threads', format: 'text' });
    threads.getPublishingLimit.mockResolvedValue({ used: 250, total: 250 });
    expect(await run(post._id)).toEqual({ outcome: 'retrying' });
    expect(row().error.code).toBe('PUBLISH_LIMIT_REACHED');
    expect(threads.publishContainer).not.toHaveBeenCalled();
  });

  it('does not let a failing allowance endpoint block a post', async () => {
    const post = seedPost({ platform: 'threads', format: 'text' });
    threads.getPublishingLimit.mockRejectedValue(new PublishError('SERVER', 'down'));
    expect(await run(post._id)).toEqual({ outcome: 'completed' });
  });

  it('gives up after repeatedly waiting for an allowance that never frees up', async () => {
    const post = seedPost({ platform: 'threads', format: 'text', deferrals: 6 });
    threads.getPublishingLimit.mockResolvedValue({ used: 250, total: 250 });
    expect(await run(post._id)).toEqual({ outcome: 'failed' });
    expect(row().error.code).toBe('PUBLISH_LIMIT_REACHED');
  });
});

describe('cancellation', () => {
  it('stops without overwriting a cancellation made while the worker was busy', async () => {
    const post = seedPost({ platform: 'threads', format: 'text' });
    threads.getContainer.mockImplementation(async () => {
      Object.assign(SocialPost.rows[0], { status: 'CANCELLED', lease: { owner: '', expiresAt: null } });
      return { status: 'IN_PROGRESS', errorMessage: '' };
    });
    expect(await run(post._id)).toEqual({ outcome: 'cancelled' });
    expect(row().status).toBe('CANCELLED');
    expect(threads.publishContainer).not.toHaveBeenCalled();
  });

  it('a cancelled post is never picked up', async () => {
    const post = seedPost({ platform: 'threads', format: 'text', status: 'CANCELLED' });
    expect(await run(post._id)).toEqual({ outcome: 'skipped' });
    expect(threads.createContainer).not.toHaveBeenCalled();
  });
});

describe('scheduled posts', () => {
  it('a delayed job that fires early does nothing; once due, the job itself promotes and publishes the post', async () => {
    const post = seedPost({ platform: 'threads', format: 'text', status: 'SCHEDULED', queuedAt: null, scheduledFor: new Date(clock + HOUR) });
    expect(await run(post._id)).toEqual({ outcome: 'skipped' });
    expect(row().status).toBe('SCHEDULED');

    clock += HOUR + 1;
    expect(await run(post._id)).toEqual({ outcome: 'completed' });
    expect(row().status).toBe('COMPLETED');
    expect(row().events.map((e) => e.message)).toContain('Scheduled time reached - queued for publishing');
  });
});
