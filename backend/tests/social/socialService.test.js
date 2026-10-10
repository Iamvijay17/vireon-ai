jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), border: jest.fn(),
}));
jest.mock('../../src/services/social/SocialEvents', () => ({ emitPost: jest.fn(), summarize: jest.fn() }));
jest.mock('../../src/services/publishing/PublishingEvents', () => ({ emitJob: jest.fn(), emitAccount: jest.fn() }));
jest.mock('../../src/models/SocialPost', () => require('../publishing/helpers/fakeMongo').makeSocialPostModel());
jest.mock('../../src/models/SocialCampaign', () => require('../publishing/helpers/fakeMongo').makeCampaignModel());
jest.mock('../../src/models/PlatformAccount', () => {
  const model = require('../publishing/helpers/fakeMongo').makeAccountModel();
  model.ACCOUNT_STATUS = { CONNECTED: 'connected', NEEDS_REAUTH: 'needs_reauth' };
  return model;
});
jest.mock('../../src/models/OAuthState', () => require('../publishing/helpers/fakeMongo').makeStateModel());

const crypto = require('crypto');
const { Readable } = require('stream');
const config = require('../../src/config');
const SocialPost = require('../../src/models/SocialPost');
const SocialCampaign = require('../../src/models/SocialCampaign');
const PlatformAccount = require('../../src/models/PlatformAccount');
const cipher = require('../../src/services/publishing/crypto');
const SocialService = require('../../src/services/social/SocialService');
const SocialAuthService = require('../../src/services/social/SocialAuthService');
const SocialPostStore = require('../../src/services/social/SocialPostStore');
const { processSocialPost } = require('../../src/services/social/processSocialPost');
const { PublishError } = require('../../src/services/publishing/errors');
const { fakeMeta, fakeThreads, storageFake } = require('./helpers/platforms');

const KEY = crypto.randomBytes(32).toString('base64');
const OWNER = 'local';
const STRANGER = 'stranger';
const ACC = { fb: 'pac-fbfbfbfb', ig: 'pac-igigigig', th: 'pac-thththth' };
const OBJ = { bucket: 'vireon-video', key: 'job-aaaaaaaa/final.mp4' };
const SIZE = 5000;
const HOUR = 3600_000;

const settingsFor = (over = {}) => () => ({
  processingPollMs: 10, processingWindowMs: 1000, processingMaxChecks: 3, maxAttempts: 3, uploadChunkBytes: 1024,
  publicMediaBaseUrl: 'https://media.example.com', mediaTokenTtlMs: HOUR, minScheduleLeadMs: 120_000, maxScheduleAheadDays: 180,
  maxImageBytes: 8 * 1024 * 1024, maxVideoBytes: 1024 ** 3, insightsCacheMs: 30 * 60_000, tokenRefreshWindowMs: 10 * 86400_000,
  dailyLimits: { instagram: 100, facebook: 30, threads: 250 }, meta: { graphVersion: 'v25.0' }, threads: {}, aiLabel: true,
  ...over,
});

let clock; let service; let store; let storage; let meta; let threads; let auth; let queue; let sources; let captions;

const videoMedia = (over = {}) => ({ kind: 'video', ...OBJ, size: SIZE, etag: 'etag-1', contentType: 'video/mp4', fileName: 'v.mp4', durationSec: 30, width: 1080, height: 1920, measured: 'record', ...over });

async function makeCampaign(over = {}) {
  const c = await service.createCampaign(OWNER, { videoJobId: 'job-aaaaaaaa', brief: { cta: 'Watch now', destinationUrl: 'https://e.test/v' }, ...over });
  return c;
}

beforeAll(() => { config.publishing.encryptionKey = KEY; });
beforeEach(() => {
  SocialPost.reset(); SocialCampaign.reset(); PlatformAccount.reset();
  jest.clearAllMocks();
  clock = Date.parse('2026-10-10T12:00:00Z');
  storage = storageFake({ [`${OBJ.bucket}/${OBJ.key}`]: { size: SIZE, etag: 'etag-1' } });
  meta = fakeMeta();
  threads = fakeThreads();
  auth = new SocialAuthService({ meta: { ...meta, isConfigured: () => true }, threads: { ...threads, isConfigured: () => true }, now: () => clock, settings: settingsFor() });
  queue = { add: jest.fn(async () => ({})) };
  store = new SocialPostStore({ now: () => clock });
  sources = {
    resolve: jest.fn(async ({ videoJobId, courseVideoId }) => ({
      media: videoMedia(), thumbnail: null, title: 'How closures work', description: 'A short explainer', excerpt: 'A closure is...', language: 'english',
      source: { videoJobId: videoJobId || null, courseVideoId: courseVideoId || null, title: 'How closures work', description: 'A short explainer' },
    })),
    library: jest.fn(async () => ({ videos: [], lessons: [] })),
  };
  captions = { generate: jest.fn(async ({ platforms }) => Object.fromEntries(platforms.map((p) => [p, { caption: `AI ${p}`, hashtags: ['#ai'], cta: 'Watch', linkUrl: '', origin: 'ai' }]))) };
  service = new SocialService({
    auth, apis: { meta, threads }, queues: () => queue, storage, store, captions, settings: settingsFor(), now: () => clock, sources,
  });
  const token = (t) => cipher.encrypt(t);
  PlatformAccount.seed({ _id: ACC.fb, ownerId: OWNER, platform: 'facebook', externalId: 'PAGE1', displayName: 'My Page', accessTokenEnc: token('FB') });
  PlatformAccount.seed({ _id: ACC.ig, ownerId: OWNER, platform: 'instagram', externalId: 'IG1', displayName: 'My IG', username: 'my_ig', accessTokenEnc: token('FB') });
  PlatformAccount.seed({ _id: ACC.th, ownerId: OWNER, platform: 'threads', externalId: '777', displayName: 'Me', username: 'me', accessTokenEnc: token('TH'), tokenExpiresAt: new Date(clock + 40 * 86400_000), lastRefreshedAt: new Date(clock) });
});

const runPost = (postId, over = {}) => processSocialPost(postId, {
  store, auth, apis: { meta, threads }, storage, enqueue: (p, o) => service.enqueue(p, o), workerId: 'w1',
  settings: settingsFor(over.settings)(), now: () => clock, sleep: async (ms) => { clock += ms; },
});

describe('campaigns', () => {
  it('creates a campaign from a Vireon video with a snapshot of the stored file and a topic default', async () => {
    const c = await makeCampaign();
    expect(sources.resolve).toHaveBeenCalledWith(expect.objectContaining({ videoJobId: 'job-aaaaaaaa' }));
    expect(c).toMatchObject({ title: 'How closures work', brief: { topic: 'How closures work', cta: 'Watch now' }, source: { videoJobId: 'job-aaaaaaaa' } });
    expect(c.media).toMatchObject({ kind: 'video', size: SIZE, previewPath: `/${OBJ.bucket}/${OBJ.key}` });
    expect(JSON.stringify(c)).not.toContain('"bucket"');
  });

  it('rejects choosing both a video and a lesson, and bad input', async () => {
    await expect(service.createCampaign(OWNER, { videoJobId: 'job-aaaaaaaa', courseVideoId: 'vid-aaaaaaaa' })).rejects.toMatchObject({ name: 'SchemaValidationError' });
    await expect(service.createCampaign(OWNER, { videoJobId: 'nope' })).rejects.toMatchObject({ name: 'SchemaValidationError' });
    await expect(service.createCampaign(OWNER, { brief: { tone: 'sarcastic' } })).rejects.toMatchObject({ name: 'SchemaValidationError' });
  });

  it('edits the brief and per-platform copy; hashtags are normalised and the copy is marked manual', async () => {
    const c = await makeCampaign();
    const u = await service.updateCampaign(OWNER, c._id, { brief: { tone: 'educational' }, variants: { instagram: { caption: 'My caption', hashtags: ['#AI', 'video tips'] } } });
    expect(u.brief.tone).toBe('educational');
    expect(u.variants.instagram).toMatchObject({ caption: 'My caption', hashtags: ['#AI', '#videotips'], origin: 'manual' });
  });

  it('is invisible to another owner', async () => {
    const c = await makeCampaign();
    await expect(service.getCampaign(STRANGER, c._id)).rejects.toMatchObject({ status: 404 });
    await expect(service.updateCampaign(STRANGER, c._id, { title: 'x' })).rejects.toMatchObject({ status: 404 });
    await expect(service.deleteCampaign(STRANGER, c._id)).rejects.toMatchObject({ status: 404 });
    await expect(service.publish(STRANGER, c._id, { confirm: true, mode: 'now', destinations: [{ accountId: ACC.th }] })).rejects.toMatchObject({ status: 404 });
    expect((await service.listCampaigns(STRANGER)).campaigns).toEqual([]);
  });

  it('deletes a campaign that never posted, archives one that did', async () => {
    const a = await makeCampaign();
    expect(await service.deleteCampaign(OWNER, a._id)).toEqual({ deleted: true, archived: false });
    const b = await makeCampaign();
    await service.publish(OWNER, b._id, { confirm: true, mode: 'now', destinations: [{ accountId: ACC.th }] });
    expect(await service.deleteCampaign(OWNER, b._id)).toEqual({ deleted: false, archived: true });
    expect((await service.listCampaigns(OWNER)).campaigns).toEqual([]);
    expect(SocialPost.rows).toHaveLength(1); // history stays
  });

  it('removes only its own uploaded file on delete, never a Vireon render', async () => {
    const c = await makeCampaign();
    await service.deleteCampaign(OWNER, c._id);
    expect(storage.deleteObject).not.toHaveBeenCalled();

    const u = await service.createCampaign(OWNER, {});
    SocialCampaign.rows.at(-1).media = videoMedia({ key: `social/local/${u._id}/up.mp4` });
    await service.deleteCampaign(OWNER, u._id);
    expect(storage.deleteObject).toHaveBeenCalledWith(OBJ.bucket, `social/local/${u._id}/up.mp4`);
  });

  it('lists campaigns with a publishing summary', async () => {
    const c = await makeCampaign();
    await service.publish(OWNER, c._id, { confirm: true, mode: 'now', destinations: [{ accountId: ACC.th }, { accountId: ACC.fb }] });
    SocialPost.rows[0].status = 'COMPLETED';
    SocialPost.rows[1].status = 'FAILED';
    const { campaigns } = await service.listCampaigns(OWNER);
    expect(campaigns[0].summary).toMatchObject({ total: 2, published: 1, failed: 1, overall: 'partial' });
  });
});

describe('AI captions', () => {
  it('writes a variant per requested platform into the campaign', async () => {
    const c = await makeCampaign();
    const out = await service.generateCopy(OWNER, c._id, { platforms: ['instagram', 'threads'], tone: 'promotional' });
    expect(captions.generate).toHaveBeenCalledWith(expect.objectContaining({ platforms: ['instagram', 'threads'], tone: 'promotional', video: expect.objectContaining({ excerpt: 'A closure is...' }) }));
    expect(out.generated).toEqual(['instagram', 'threads']);
    expect(out.campaign.variants.instagram).toMatchObject({ caption: 'AI instagram', origin: 'ai' });
    expect(out.campaign.variants.facebook).toBeUndefined();
    expect(out.campaign.brief.tone).toBe('promotional');
  });

  it('leaves the existing copy alone when the local AI is unavailable (the user writes by hand)', async () => {
    const c = await makeCampaign();
    await service.updateCampaign(OWNER, c._id, { variants: { facebook: { caption: 'Mine' } } });
    captions.generate.mockRejectedValue(Object.assign(new Error('AI down'), { code: 'AI_UNAVAILABLE', status: 503 }));
    await expect(service.generateCopy(OWNER, c._id, {})).rejects.toMatchObject({ code: 'AI_UNAVAILABLE', status: 503 });
    expect((await service.getCampaign(OWNER, c._id)).campaign.variants.facebook.caption).toBe('Mine');
  });
});

describe('uploading media', () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14), Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0x38, 0x04, 0x38, 0x03]), Buffer.alloc(900)]);

  it('stores a verified image with its dimensions and makes it the campaign media', async () => {
    const c = await service.createCampaign(OWNER, { title: 'Image promo' });
    const out = await service.attachUpload(OWNER, c._id, { stream: Readable.from([jpeg]), fileName: '../../evil name.jpg' });
    expect(storage.putObjectFile).toHaveBeenCalledWith(expect.any(String), expect.stringMatching(new RegExp(`^social/local/${c._id}/[a-z0-9]+\\.jpg$`)), expect.any(String), 'image/jpeg');
    expect(out.media).toMatchObject({ kind: 'image', contentType: 'image/jpeg', width: 1080, height: 1080, measured: 'file', fileName: 'evil name.jpg' });
  });

  it('rejects files that are not JPEG/PNG/MP4/MOV by content, whatever they claim to be', async () => {
    const c = await service.createCampaign(OWNER, {});
    await expect(service.attachUpload(OWNER, c._id, { stream: Readable.from([Buffer.from('<script>alert(1)</script>'.repeat(20))]), fileName: 'x.jpg' })).rejects.toThrow(/Unsupported file/);
    await expect(service.attachUpload(OWNER, c._id, { stream: Readable.from([]), fileName: 'x.jpg' })).rejects.toThrow(/empty/);
    expect(storage.putObjectFile).not.toHaveBeenCalled();
  });

  it('enforces the size caps while streaming, and refuses another owner\'s campaign', async () => {
    const small = new SocialService({ auth, apis: { meta, threads }, queues: () => queue, storage, store, captions, sources, now: () => clock, settings: settingsFor({ maxImageBytes: 500, maxVideoBytes: 800 }) });
    const c = await small.createCampaign(OWNER, {});
    await expect(small.attachUpload(OWNER, c._id, { stream: Readable.from([jpeg]), fileName: 'big.jpg' })).rejects.toThrow(/too large|limited/);
    await expect(service.attachUpload(STRANGER, c._id, { stream: Readable.from([jpeg]) })).rejects.toMatchObject({ status: 404 });
  });
});

describe('validation and preview', () => {
  it('returns, per destination, whether it can post, the exact text that would be sent, and the problems', async () => {
    const c = await makeCampaign();
    await service.updateCampaign(OWNER, c._id, { variants: { threads: { caption: 'x'.repeat(520) }, instagram: { caption: 'Nice', hashtags: ['a'] } } });
    const out = await service.validate(OWNER, c._id, { destinations: [{ accountId: ACC.th }, { accountId: ACC.ig }, { accountId: ACC.fb }] });
    const by = Object.fromEntries(out.results.map((r) => [r.platform, r]));
    expect(by.threads.ok).toBe(false);
    expect(by.threads.errors.map((e) => e.code)).toContain('TEXT_TOO_LONG');
    expect(by.instagram).toMatchObject({ ok: true, format: 'reel', composed: { text: 'Nice\n\nWatch now\n\n#a', limit: 2200 } });
    expect(by.facebook).toMatchObject({ ok: true, format: 'reel' });
    expect(out.ok).toBe(false);
  });

  it('blocks a destination whose account needs reconnecting, an expired token, or an unknown account', async () => {
    const c = await makeCampaign();
    PlatformAccount.rows.find((r) => r._id === ACC.ig).status = 'needs_reauth';
    PlatformAccount.rows.find((r) => r._id === ACC.ig).statusReason = 'Reconnect Instagram';
    PlatformAccount.rows.find((r) => r._id === ACC.th).tokenExpiresAt = new Date(clock - 1);
    const out = await service.validate(OWNER, c._id, { destinations: [{ accountId: ACC.ig }, { accountId: ACC.th }, { accountId: 'pac-zzzzzzzz' }] });
    expect(out.results.map((r) => r.ok)).toEqual([false, false, false]);
    expect(out.results[0].errors[0]).toMatchObject({ code: 'ACCOUNT_NEEDS_REAUTH', message: 'Reconnect Instagram' });
    expect(out.results[1].errors[0].message).toMatch(/expired/);
    expect(out.results[2].errors[0].code).toBe('ACCOUNT_NOT_FOUND');
  });

  it('cannot see another owner\'s account', async () => {
    const c = await makeCampaign();
    PlatformAccount.rows.find((r) => r._id === ACC.th).ownerId = STRANGER;
    const out = await service.validate(OWNER, c._id, { destinations: [{ accountId: ACC.th }] });
    expect(out.results[0].errors[0].code).toBe('ACCOUNT_NOT_FOUND');
  });

  it('checks the schedule too', async () => {
    const c = await makeCampaign();
    const bad = await service.validate(OWNER, c._id, { mode: 'schedule', localDateTime: '2020-01-01T10:00', timezone: 'UTC', destinations: [{ accountId: ACC.th }] });
    expect(bad.schedule[0].code).toBe('SCHEDULE_PAST');
    expect(bad.ok).toBe(false);
  });
});

describe('publishing now', () => {
  it('requires explicit confirmation', async () => {
    const c = await makeCampaign();
    await expect(service.publish(OWNER, c._id, { mode: 'now', destinations: [{ accountId: ACC.th }] })).rejects.toMatchObject({ name: 'SchemaValidationError' });
    await expect(service.publish(OWNER, c._id, { confirm: false, mode: 'now', destinations: [{ accountId: ACC.th }] })).rejects.toMatchObject({ name: 'SchemaValidationError' });
    expect(SocialPost.rows).toHaveLength(0);
  });

  it('creates one independent post per account, snapshots the copy, and enqueues each', async () => {
    const c = await makeCampaign();
    await service.updateCampaign(OWNER, c._id, { variants: { instagram: { caption: 'IG copy' }, facebook: { caption: 'FB copy' }, threads: { caption: 'TH copy' } } });
    const r = await service.publish(OWNER, c._id, { confirm: true, mode: 'now', destinations: [{ accountId: ACC.ig }, { accountId: ACC.fb }, { accountId: ACC.th }] });
    expect(r).toMatchObject({ created: 3, failed: 0 });
    expect(SocialPost.rows.map((p) => [p.platform, p.status, p.content.caption])).toEqual([
      ['instagram', 'QUEUED', 'IG copy'], ['facebook', 'QUEUED', 'FB copy'], ['threads', 'QUEUED', 'TH copy'],
    ]);
    expect(SocialPost.rows[0]).toMatchObject({ format: 'reel', ownerId: OWNER, campaignId: c._id, videoJobId: 'job-aaaaaaaa', accountLabel: 'My IG', maxAttempts: 3 });
    expect(queue.add).toHaveBeenCalledTimes(3);
    expect(queue.add.mock.calls.map((x) => x[1].postId).sort()).toEqual(SocialPost.rows.map((p) => p._id).sort());
    // later edits of the campaign do not change what was approved
    await service.updateCampaign(OWNER, c._id, { variants: { instagram: { caption: 'changed after' } } });
    expect(SocialPost.rows[0].content.caption).toBe('IG copy');
  });

  it('reports each destination separately: valid ones are created even if another is refused', async () => {
    const noPublic = new SocialService({ auth, apis: { meta, threads }, queues: () => queue, storage, store, captions, sources, now: () => clock, settings: settingsFor({ publicMediaBaseUrl: '' }) });
    const c = await noPublic.createCampaign(OWNER, { videoJobId: 'job-aaaaaaaa' });
    const r = await noPublic.publish(OWNER, c._id, { confirm: true, mode: 'now', destinations: [{ accountId: ACC.fb }, { accountId: ACC.th }, { accountId: ACC.ig }] });
    expect(r).toMatchObject({ created: 2, failed: 1 });
    const th = r.results.find((x) => x.platform === 'threads');
    expect(th).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(th.message).toMatch(/SOCIAL_PUBLIC_MEDIA_BASE_URL/);
    expect(SocialPost.rows.map((p) => p.platform).sort()).toEqual(['facebook', 'instagram']);
  });

  it('refuses a duplicate submission, sequential or concurrent, with exactly one post per account', async () => {
    const c = await makeCampaign();
    const body = { confirm: true, mode: 'now', destinations: [{ accountId: ACC.fb }, { accountId: ACC.th }] };
    const [a, b] = await Promise.all([service.publish(OWNER, c._id, body), service.publish(OWNER, c._id, body)]);
    expect(a.created + b.created).toBe(2);
    expect(SocialPost.rows).toHaveLength(2);
    const again = await service.publish(OWNER, c._id, body);
    expect(again.created).toBe(0);
    expect(again.results.every((x) => x.code === 'DUPLICATE')).toBe(true);
    expect(again.results[0].existingPostId).toBeTruthy();
    expect(SocialPost.rows).toHaveLength(2);
  });

  it('rejects the same account chosen twice in one request', async () => {
    const c = await makeCampaign();
    const r = await service.publish(OWNER, c._id, { confirm: true, mode: 'now', destinations: [{ accountId: ACC.th }, { accountId: ACC.th }] });
    expect(r.results.map((x) => x.code ?? 'ok')).toEqual(['ok', 'DUPLICATE_DESTINATION']);
  });

  it('allows posting the same media to the same account again only on request, and only after it completed', async () => {
    const c = await makeCampaign();
    const body = { confirm: true, mode: 'now', destinations: [{ accountId: ACC.th }] };
    await service.publish(OWNER, c._id, body);
    expect((await service.publish(OWNER, c._id, { ...body, allowRepeat: true })).created).toBe(0); // still in flight
    SocialPost.rows[0].status = 'COMPLETED';
    expect((await service.publish(OWNER, c._id, { ...body, allowRepeat: true })).created).toBe(1);
    expect(SocialPost.rows).toHaveLength(2);
  });

  it('refuses media that changed or vanished since it was chosen', async () => {
    const c = await makeCampaign();
    storage.objects.set(`${OBJ.bucket}/${OBJ.key}`, { size: SIZE, etag: 'etag-2' });
    expect((await service.publish(OWNER, c._id, { confirm: true, mode: 'now', destinations: [{ accountId: ACC.th }] })).results[0].code).toBe('SOURCE_CHANGED');
    storage.objects.clear();
    expect((await service.publish(OWNER, c._id, { confirm: true, mode: 'now', destinations: [{ accountId: ACC.th }] })).results[0].code).toBe('SOURCE_MISSING');
    expect(SocialPost.rows).toHaveLength(0);
  });

  it('keeps the post (and says so) when Redis is down: nothing is lost', async () => {
    queue.add.mockRejectedValue(new Error('ECONNREFUSED redis'));
    const c = await makeCampaign();
    const r = await service.publish(OWNER, c._id, { confirm: true, mode: 'now', destinations: [{ accountId: ACC.th }] });
    expect(r.results[0]).toMatchObject({ ok: true, enqueued: false });
    expect(SocialPost.rows[0].status).toBe('QUEUED');
  });
});

describe('scheduling', () => {
  const body = (over = {}) => ({ confirm: true, mode: 'schedule', timezone: 'Asia/Kolkata', localDateTime: '2026-10-12T18:30', destinations: [{ accountId: ACC.th }, { accountId: ACC.fb }], ...over });

  it('persists the post as SCHEDULED in UTC with the chosen timezone, and enqueues a delayed job', async () => {
    const c = await makeCampaign();
    const r = await service.publish(OWNER, c._id, body());
    expect(r.created).toBe(2);
    const post = SocialPost.rows[0];
    expect(post).toMatchObject({ status: 'SCHEDULED', timezone: 'Asia/Kolkata', queuedAt: null });
    expect(new Date(post.scheduledFor).toISOString()).toBe('2026-10-12T13:00:00.000Z');
    const [name, data, opts] = queue.add.mock.calls[0];
    expect(name).toBe('publish');
    expect(data).toEqual({ postId: post._id });
    expect(opts.delay).toBe(Date.parse('2026-10-12T13:00:00Z') - clock);
    expect(r.results[0].post.scheduledLocal).toBe('2026-10-12T18:30');
  });

  it('accepts an explicit UTC instant too', async () => {
    const c = await makeCampaign();
    await service.publish(OWNER, c._id, body({ localDateTime: undefined, scheduledFor: '2026-10-12T13:00:00Z', timezone: 'UTC' }));
    expect(new Date(SocialPost.rows[0].scheduledFor).toISOString()).toBe('2026-10-12T13:00:00.000Z');
  });

  it('rejects past, too-soon, too-far, malformed times and unknown timezones before creating anything', async () => {
    const c = await makeCampaign();
    for (const bad of [
      { localDateTime: '2026-10-10T12:00' }, { localDateTime: '2026-10-10T17:31' }, { localDateTime: '2027-12-01T10:00' },
      { localDateTime: 'next friday' }, { localDateTime: undefined, scheduledFor: undefined }, { timezone: 'Mars/Base' },
    ]) {
      await expect(service.publish(OWNER, c._id, body(bad))).rejects.toMatchObject({ name: 'SchemaValidationError' });
    }
    expect(SocialPost.rows).toHaveLength(0);
  });

  it('survives losing Redis entirely: a restarted worker\'s scheduler tick promotes and enqueues what is due', async () => {
    const c = await makeCampaign();
    await service.publish(OWNER, c._id, body());
    queue.add.mockClear(); // Redis was flushed - the delayed jobs are gone, only Mongo remains

    expect(await service.promoteDue()).toBe(0); // not due yet
    expect(queue.add).not.toHaveBeenCalled();

    clock = Date.parse('2026-10-12T13:00:05Z');
    expect(await service.promoteDue()).toBe(2);
    expect(SocialPost.rows.map((p) => p.status)).toEqual(['QUEUED', 'QUEUED']);
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(await service.promoteDue()).toBe(0); // idempotent
    expect(queue.add).toHaveBeenCalledTimes(2);
  });

  it('two schedulers (dev + prod workers) never promote the same post twice', async () => {
    const c = await makeCampaign();
    await service.publish(OWNER, c._id, body({ destinations: [{ accountId: ACC.th }] }));
    clock = Date.parse('2026-10-12T13:00:05Z');
    queue.add.mockClear();
    const other = new SocialService({ auth, apis: { meta, threads }, queues: () => queue, storage, store: new SocialPostStore({ now: () => clock }), captions, sources, now: () => clock, settings: settingsFor() });
    const [a, b] = await Promise.all([service.promoteDue(), other.promoteDue()]);
    expect(a + b).toBe(1);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('a scheduled post publishes end to end when its time comes, with no browser involved', async () => {
    const c = await makeCampaign();
    await service.updateCampaign(OWNER, c._id, { variants: { threads: { caption: 'Scheduled hello', hashtags: [], cta: '' } } });
    const r = await service.publish(OWNER, c._id, body({ destinations: [{ accountId: ACC.th }] }));
    const id = r.results[0].post._id;
    expect(await runPost(id)).toEqual({ outcome: 'skipped' });
    clock = Date.parse('2026-10-12T13:00:01Z');
    expect(await runPost(id)).toEqual({ outcome: 'completed' });
    expect(SocialPost.rows[0].status).toBe('COMPLETED');
    expect(threads.state.posted).toHaveLength(1);
  });
});

describe('editing and cancelling', () => {
  const schedule = async () => {
    const c = await makeCampaign();
    const r = await service.publish(OWNER, c._id, { confirm: true, mode: 'schedule', timezone: 'UTC', localDateTime: '2026-10-12T10:00', destinations: [{ accountId: ACC.th }] });
    return { c, id: r.results[0].post._id };
  };

  it('edits the text and the time of a scheduled post, and re-enqueues for the new time', async () => {
    const { id } = await schedule();
    queue.add.mockClear();
    const post = await service.editPost(OWNER, id, { content: { caption: 'Better copy', hashtags: ['x'] }, localDateTime: '2026-10-13T09:15', timezone: 'Europe/London' });
    expect(post.content).toMatchObject({ caption: 'Better copy', hashtags: ['#x'] });
    expect(new Date(post.scheduledFor).toISOString()).toBe('2026-10-13T08:15:00.000Z');
    expect(post.timezone).toBe('Europe/London');
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add.mock.calls[0][2].delay).toBe(Date.parse('2026-10-13T08:15:00Z') - clock);
    expect(post.events.at(-1).message).toMatch(/Rescheduled/);
  });

  it('validates edits against the platform\'s rules', async () => {
    const { id } = await schedule();
    await expect(service.editPost(OWNER, id, { content: { caption: 'x'.repeat(600) } })).rejects.toMatchObject({ name: 'SchemaValidationError' });
    await expect(service.editPost(OWNER, id, { localDateTime: '2026-10-10T12:01', timezone: 'UTC' })).rejects.toMatchObject({ name: 'SchemaValidationError' });
    expect(SocialPost.rows[0].content.caption).not.toHaveLength(600);
  });

  it('refuses to edit a post that is running or finished, or that belongs to someone else', async () => {
    const { id } = await schedule();
    await expect(service.editPost(STRANGER, id, { content: { caption: 'x' } })).rejects.toMatchObject({ status: 404 });
    for (const status of ['QUEUED', 'UPLOADING', 'COMPLETED', 'CANCELLED']) {
      SocialPost.rows[0].status = status;
      await expect(service.editPost(OWNER, id, { content: { caption: 'x' } })).rejects.toMatchObject({ status: 409 });
    }
  });

  it('cancels a scheduled post, freeing the duplicate lock so it can be scheduled again', async () => {
    const { c, id } = await schedule();
    const cancelled = await service.cancelPost(OWNER, id);
    expect(cancelled.status).toBe('CANCELLED');
    expect(SocialPost.rows[0].dedupeKey).toBeUndefined();
    expect(await runPost(id)).toEqual({ outcome: 'skipped' });
    const again = await service.publish(OWNER, c._id, { confirm: true, mode: 'now', destinations: [{ accountId: ACC.th }] });
    expect(again.created).toBe(1);
  });

  it('cannot cancel what already reached the platform, finished, or is someone else\'s', async () => {
    const { id } = await schedule();
    await expect(service.cancelPost(STRANGER, id)).rejects.toMatchObject({ status: 404 });
    SocialPost.rows[0].status = 'COMPLETED';
    await expect(service.cancelPost(OWNER, id)).rejects.toMatchObject({ status: 409 });
    SocialPost.rows[0].status = 'PROCESSING';
    SocialPost.rows[0].remote.publishAttemptedAt = new Date(clock);
    await expect(service.cancelPost(OWNER, id)).rejects.toThrow(/being sent/);
    SocialPost.rows[0].remote.publishAttemptedAt = null;
    SocialPost.rows[0].remote.postId = 'REEL1';
    await expect(service.cancelPost(OWNER, id)).rejects.toThrow(/already published/);
  });
});

describe('partial failure and retrying one destination', () => {
  it('Instagram succeeds, Facebook fails: both results are kept and retrying Facebook cannot touch Instagram', async () => {
    const c = await makeCampaign();
    const r = await service.publish(OWNER, c._id, { confirm: true, mode: 'now', destinations: [{ accountId: ACC.ig }, { accountId: ACC.fb }] });
    const [ig, fb] = r.results.map((x) => x.post._id);
    meta.state.failures.startReel = [new PublishError('MEDIA_INVALID', 'Facebook rejected the video', { httpStatus: 400 })];

    expect(await runPost(ig)).toEqual({ outcome: 'completed' });
    expect(await runPost(fb)).toEqual({ outcome: 'failed' });

    const rows = Object.fromEntries(SocialPost.rows.map((p) => [p.platform, p]));
    expect(rows.instagram).toMatchObject({ status: 'COMPLETED', remote: { state: 'live' } });
    expect(rows.facebook).toMatchObject({ status: 'FAILED', error: { code: 'MEDIA_INVALID', retryable: false } });
    expect(rows.instagram.dedupeKey).toBeDefined();
    expect(rows.facebook.dedupeKey).toBeUndefined();
    const summary = (await service.getCampaign(OWNER, c._id)).summary;
    expect(summary).toMatchObject({ published: 1, failed: 1, overall: 'partial' });

    // the failed destination can be retried; the successful one cannot, and is never re-sent
    await expect(service.retryPost(OWNER, ig)).rejects.toMatchObject({ status: 409 });
    const igPosts = meta.state.posted.filter((p) => p.platform === 'instagram').length;
    const retried = await service.retryPost(OWNER, fb);
    expect(retried.post).toMatchObject({ status: 'QUEUED', attempts: 0, retryCount: 1 });
    expect(retried.post.error.code).toBe('');
    expect(await runPost(fb)).toEqual({ outcome: 'completed' });
    expect(SocialPost.rows.find((p) => p.platform === 'facebook').status).toBe('COMPLETED');
    expect(meta.state.posted.filter((p) => p.platform === 'instagram')).toHaveLength(igPosts);
    expect(meta.state.posted.filter((p) => p.platform === 'instagram')).toHaveLength(1);
    expect(meta.state.posted.filter((p) => p.platform === 'facebook')).toHaveLength(1);
    expect((await service.getCampaign(OWNER, c._id)).summary.overall).toBe('published');
  });

  it('refuses to retry what cannot be fixed by retrying, and anything not failed', async () => {
    const c = await makeCampaign();
    const r = await service.publish(OWNER, c._id, { confirm: true, mode: 'now', destinations: [{ accountId: ACC.th }] });
    const id = r.results[0].post._id;
    await expect(service.retryPost(OWNER, id)).rejects.toThrow(/Only a failed post/);
    Object.assign(SocialPost.rows[0], { status: 'FAILED', error: { code: 'SOURCE_CHANGED', message: 'm', action: 'Create a new post', retryable: false } });
    await expect(service.retryPost(OWNER, id)).rejects.toThrow(/Create a new post/);
    await expect(service.retryPost(STRANGER, id)).rejects.toMatchObject({ status: 404 });
  });

  it('needs the account to be healthy again before a retry (reauthorisation flow)', async () => {
    const c = await makeCampaign();
    const r = await service.publish(OWNER, c._id, { confirm: true, mode: 'now', destinations: [{ accountId: ACC.th }] });
    const id = r.results[0].post._id;
    threads.state.failures.createContainer = [new PublishError('AUTH_REVOKED', 'revoked', { httpStatus: 400 })];
    await runPost(id);
    expect(SocialPost.rows[0]).toMatchObject({ status: 'FAILED', error: { requiresReauth: true } });
    expect(PlatformAccount.rows.find((a) => a._id === ACC.th).status).toBe('needs_reauth');
    await expect(service.retryPost(OWNER, id)).rejects.toThrow(/Reconnect|reconnect/);

    PlatformAccount.rows.find((a) => a._id === ACC.th).status = 'connected'; // the user reconnected
    await service.retryPost(OWNER, id);
    expect(await runPost(id)).toEqual({ outcome: 'completed' });
  });

  it('an unconfirmed publish needs the user to say it is not posted; then it starts clean', async () => {
    const c = await makeCampaign();
    const r = await service.publish(OWNER, c._id, { confirm: true, mode: 'now', destinations: [{ accountId: ACC.ig }] });
    const id = r.results[0].post._id;
    Object.assign(SocialPost.rows[0], {
      status: 'FAILED', error: { code: 'OUTCOME_UNKNOWN', message: 'unclear', action: '', retryable: false },
      remote: { ...SocialPost.rows[0].remote, containerId: 'IGC1', publishAttemptedAt: new Date(clock) },
    });
    const decorated = await service.getPost(OWNER, id);
    expect(decorated.actions).toMatchObject({ canRetry: false, canRetryUnknown: true });
    await expect(service.retryPost(OWNER, id)).rejects.toThrow(/Check the account on the platform/);

    await service.retryPost(OWNER, id, { confirmNotPosted: true });
    expect(SocialPost.rows[0].remote).toMatchObject({ containerId: '', publishAttemptedAt: null });
    expect(SocialPost.rows[0].status).toBe('QUEUED');
  });

  it('retrying a post that already has a platform id keeps it (the retry only confirms)', async () => {
    const c = await makeCampaign();
    const r = await service.publish(OWNER, c._id, { confirm: true, mode: 'now', destinations: [{ accountId: ACC.fb }] });
    const id = r.results[0].post._id;
    Object.assign(SocialPost.rows[0], {
      status: 'FAILED', error: { code: 'MEDIA_NOT_READY', message: 'm', action: '', retryable: false },
      remote: { ...SocialPost.rows[0].remote, videoId: 'REEL1', postId: 'REEL1', state: 'publishing', publishAttemptedAt: new Date(clock) },
    });
    await service.retryPost(OWNER, id);
    expect(SocialPost.rows[0].remote).toMatchObject({ postId: 'REEL1', videoId: 'REEL1' });
    meta.state.video.publishing = { status: 'complete' };
    meta.state.video.uploading = { status: 'complete', bytes_transferred: SIZE };
    await runPost(id);
    expect(meta.finishReel).not.toHaveBeenCalled();
    expect(meta.startReel).not.toHaveBeenCalled();
    expect(SocialPost.rows[0].status).toBe('COMPLETED');
  });

  it('deletes only posts that never reached a platform', async () => {
    const c = await makeCampaign();
    const r = await service.publish(OWNER, c._id, { confirm: true, mode: 'now', destinations: [{ accountId: ACC.th }, { accountId: ACC.fb }] });
    const [a, b] = r.results.map((x) => x.post._id);
    await expect(service.deletePost(OWNER, a)).rejects.toMatchObject({ status: 409 }); // queued
    SocialPost.rows[0].status = 'CANCELLED';
    expect(await service.deletePost(OWNER, a)).toEqual({ deleted: true });
    SocialPost.rows[0].status = 'FAILED'; // was row b
    SocialPost.rows[0].remote.postId = 'X';
    await expect(service.deletePost(OWNER, b)).rejects.toMatchObject({ status: 409 });
  });
});

describe('history, calendar and overview', () => {
  const seed = (over) => SocialPost.seed({ ownerId: OWNER, campaignId: 'cam-aaaaaaaa', platform: 'threads', accountId: ACC.th, format: 'text', content: { caption: 'c', hashtags: [] }, ...over });

  it('filters history by platform, status, account and date, with pagination, for the owner only', async () => {
    seed({ status: 'COMPLETED', createdAt: new Date('2026-10-01T10:00:00Z') });
    seed({ status: 'FAILED', platform: 'facebook', accountId: ACC.fb, createdAt: new Date('2026-10-05T10:00:00Z') });
    seed({ status: 'SCHEDULED', createdAt: new Date('2026-10-08T10:00:00Z'), scheduledFor: new Date('2026-10-20T10:00:00Z') });
    seed({ status: 'COMPLETED', ownerId: STRANGER });
    expect((await service.listPosts(OWNER)).pagination.total).toBe(3);
    expect((await service.listPosts(OWNER, { platform: 'facebook' })).posts).toHaveLength(1);
    expect((await service.listPosts(OWNER, { status: 'COMPLETED' })).posts).toHaveLength(1);
    expect((await service.listPosts(OWNER, { finished: 'false' })).posts.map((p) => p.status)).toEqual(['SCHEDULED']);
    expect((await service.listPosts(OWNER, { from: '2026-10-04T00:00:00Z', to: '2026-10-06T00:00:00Z' })).posts).toHaveLength(1);
    const page = await service.listPosts(OWNER, { limit: 2, page: 2 });
    expect(page.posts).toHaveLength(1);
    expect(page.pagination).toMatchObject({ total: 3, pages: 2 });
    await expect(service.listPosts(OWNER, { limit: 500 })).rejects.toMatchObject({ name: 'SchemaValidationError' });
    await expect(service.listPosts(OWNER, { status: 'EXPLODED' })).rejects.toMatchObject({ name: 'SchemaValidationError' });
  });

  it('exposes sanitised posts: no storage location, lease or duplicate key', async () => {
    seed({ status: 'SCHEDULED', scheduledFor: new Date(clock + HOUR), dedupeKey: 'secret', media: { kind: 'video', bucket: 'b', key: 'k', size: 1 }, lease: { owner: 'w', expiresAt: null } });
    const text = JSON.stringify((await service.listPosts(OWNER)).posts);
    expect(text).not.toMatch(/dedupeKey|"lease"|"bucket"|"key"/);
  });

  it('shows scheduled and published posts in the calendar range, newest data only inside the range', async () => {
    seed({ status: 'SCHEDULED', scheduledFor: new Date('2026-10-15T09:00:00Z'), timezone: 'UTC' });
    seed({ status: 'COMPLETED', completedAt: new Date('2026-10-09T09:00:00Z') });
    seed({ status: 'SCHEDULED', scheduledFor: new Date('2027-03-01T09:00:00Z') });
    const cal = await service.calendar(OWNER, { from: '2026-10-01T00:00:00Z', to: '2026-10-31T00:00:00Z' });
    expect(cal.items.map((i) => i.status).sort()).toEqual(['COMPLETED', 'SCHEDULED']);
    expect(cal.items.find((i) => i.status === 'SCHEDULED').actions.canCancel).toBe(true);
    await expect(service.calendar(OWNER, { from: '2020-01-01', to: '2026-01-01' })).rejects.toThrow(/at most 400 days/);
  });

  it('summarises the dashboard', async () => {
    seed({ status: 'SCHEDULED', scheduledFor: new Date(clock + HOUR) });
    seed({ status: 'COMPLETED', createdAt: new Date(clock - HOUR) });
    seed({ status: 'FAILED', createdAt: new Date(clock - HOUR), error: { code: 'MEDIA_INVALID', message: 'm' } });
    PlatformAccount.rows.find((a) => a._id === ACC.ig).status = 'needs_reauth';
    const o = await service.overview(OWNER);
    expect(o.accounts).toEqual({ total: 3, needReauth: 1 });
    expect(o.scheduledTotal).toBe(1);
    expect(o.last7Days).toMatchObject({ published: 1, failed: 1 });
    expect(o.upcoming).toHaveLength(1);
    expect(o.needsAttention).toHaveLength(1);
  });
});

describe('analytics', () => {
  const published = (over = {}) => SocialPost.seed({
    ownerId: OWNER, campaignId: 'cam-aaaaaaaa', platform: 'threads', accountId: ACC.th, format: 'text', status: 'COMPLETED', completedAt: new Date(clock - HOUR),
    createdAt: new Date(clock - 2 * HOUR), content: { caption: 'c' }, remote: { postId: 'THM1', permalink: 'p' }, ...over,
  });

  it('refreshes insights per post, stores unavailable metrics as unavailable, and aggregates without inventing zeros', async () => {
    published();
    threads.getInsightMetric.mockImplementation(async (id, token, metric) => (metric === 'views' ? { available: true, value: 42 } : { available: false, value: null, reason: 'Not available for this post' }));
    expect(await service.refreshInsights(OWNER, {})).toEqual({ refreshed: 1, failed: 0, skipped: 0 });
    const a = await service.analytics(OWNER, {});
    expect(a.metrics.views).toMatchObject({ available: true, value: 42 });
    expect(a.metrics.shares).toMatchObject({ available: false, value: null });
    expect(a.metrics.reach).toBeUndefined(); // Threads has no reach: it is simply not reported
    expect(a.totals).toMatchObject({ published: 1, successRate: 100 });
  });

  it('respects the cache: a fresh post is not fetched again, a stale one is', async () => {
    published();
    await service.refreshInsights(OWNER, {});
    threads.getInsightMetric.mockClear();
    expect(await service.refreshInsights(OWNER, {})).toEqual({ refreshed: 0, failed: 0, skipped: 0 });
    expect(threads.getInsightMetric).not.toHaveBeenCalled();
    clock += 31 * 60_000;
    expect((await service.refreshInsights(OWNER, {})).refreshed).toBe(1);
  });

  it('records a per-post failure without losing the older numbers, and stops at a rate limit', async () => {
    published({ insights: { fetchedAt: new Date(clock - HOUR), metrics: { views: { available: true, value: 7 } }, error: '' } });
    published({ remote: { postId: 'THM2', permalink: 'p2' } });
    threads.getInsightMetric.mockRejectedValue(Object.assign(new PublishError('RATE_LIMITED', 'slow'), {}));
    const out = await service.refreshInsights(OWNER, {});
    expect(out.failed).toBe(1);
    expect(out.refreshed).toBe(0);
    expect(SocialPost.rows[0].insights.metrics.views.value).toBe(7);
    expect(SocialPost.rows[0].insights.error).toMatch(/slow/);
    expect(threads.getInsightMetric).toHaveBeenCalledTimes(1); // the second post was not even tried
  });

  it('only refreshes published posts, and only the owner\'s', async () => {
    const mine = published();
    published({ ownerId: STRANGER });
    SocialPost.seed({ ownerId: OWNER, campaignId: 'c', platform: 'threads', accountId: ACC.th, format: 'text', status: 'FAILED' });
    expect((await service.refreshInsights(OWNER, {})).refreshed).toBe(1);
    await expect(service.refreshInsights(OWNER, { postId: SocialPost.rows[2]._id })).rejects.toMatchObject({ status: 409 });
    await expect(service.refreshInsights(STRANGER, { postId: mine._id })).rejects.toMatchObject({ status: 404 });
  });

  it('filters analytics by platform and date range', async () => {
    published({ createdAt: new Date('2026-09-01T00:00:00Z'), completedAt: new Date('2026-09-01T00:00:00Z') });
    published({ platform: 'facebook', accountId: ACC.fb });
    expect((await service.analytics(OWNER, {})).totals.posts).toBe(1);
    expect((await service.analytics(OWNER, { from: '2026-08-01T00:00:00Z' })).totals.posts).toBe(2);
    expect((await service.analytics(OWNER, { from: '2026-08-01T00:00:00Z', platform: 'threads' })).totals.posts).toBe(1);
  });
});

describe('capabilities', () => {
  it('describes what this deployment can do, including the missing public media URL', () => {
    const noPublic = new SocialService({ auth, apis: { meta, threads }, queues: () => queue, storage, store, captions, sources, now: () => clock, settings: settingsFor({ publicMediaBaseUrl: '' }) });
    const caps = noPublic.getCapabilities();
    expect(caps.publicMedia.configured).toBe(false);
    expect(caps.restrictions[0]).toMatch(/SOCIAL_PUBLIC_MEDIA_BASE_URL/);
    expect(caps.platforms.instagram.dailyLimit).toBe(100);
    expect(caps.testing.sandbox).toBe(false);
    expect(service.getCapabilities().publicMedia.configured).toBe(true);
  });
});
