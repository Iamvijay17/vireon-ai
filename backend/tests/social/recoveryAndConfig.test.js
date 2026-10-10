jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), border: jest.fn(),
}));
jest.mock('../../src/models/SocialPost', () => require('../publishing/helpers/fakeMongo').makeSocialPostModel());
jest.mock('../../src/models/PublishingJob', () => require('../publishing/helpers/fakeMongo').makeJobModel());

const crypto = require('crypto');
const SocialPost = require('../../src/models/SocialPost');
const { sweepPublishingJobs } = require('../../src/services/publishing/recovery');
const { validateConfig, ConfigValidationError } = require('../../src/config/validate');

describe('worker restart recovery for social posts', () => {
  let clock; let enqueue;
  const sweep = () => sweepPublishingJobs({ platform: { $in: ['facebook', 'instagram', 'threads'] }, enqueue, Job: SocialPost, now: () => clock });
  const seed = (over) => SocialPost.seed({ ownerId: 'local', campaignId: 'cam-aaaaaaaa', platform: 'threads', accountId: 'pac-aaaaaaaa', format: 'text', ...over });

  beforeEach(() => {
    SocialPost.reset();
    clock = Date.parse('2026-10-10T12:00:00Z');
    enqueue = jest.fn(async () => {});
  });

  it('re-queues a post whose queue entry was lost, whose retry timer was lost, or whose worker died', async () => {
    const lostQueue = seed({ status: 'QUEUED', queuedAt: new Date(clock - 5 * 60_000) });
    const lostTimer = seed({ status: 'RETRYING', nextRetryAt: new Date(clock - 1000), attempts: 1 });
    const diedMidRun = seed({ status: 'UPLOADING', lease: { owner: 'dead-worker', expiresAt: new Date(clock - 1000) }, attempts: 1 });
    const waiting = seed({ status: 'PROCESSING', nextRetryAt: new Date(clock - 1000), attempts: 1 });
    expect(await sweep()).toBe(4);
    const ids = enqueue.mock.calls.map((c) => String(c[0]._id)).sort();
    expect(ids).toEqual([lostQueue._id, lostTimer._id, diedMidRun._id, waiting._id].sort());
  });

  it('leaves alone what is healthy: fresh queue entries, future retries, live workers, scheduled posts, finished posts', async () => {
    seed({ status: 'QUEUED', queuedAt: new Date(clock - 5000) });
    seed({ status: 'RETRYING', nextRetryAt: new Date(clock + 60_000) });
    seed({ status: 'UPLOADING', lease: { owner: 'alive', expiresAt: new Date(clock + 60_000) } });
    seed({ status: 'SCHEDULED', scheduledFor: new Date(clock - 1000) }); // the scheduler tick owns these
    seed({ status: 'COMPLETED' });
    seed({ status: 'FAILED' });
    seed({ status: 'CANCELLED' });
    expect(await sweep()).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('is repeatable: a second sweep asks for the same BullMQ job ids, which BullMQ drops as duplicates', async () => {
    seed({ status: 'QUEUED', queuedAt: new Date(clock - 5 * 60_000) });
    await sweep();
    await sweep();
    const ids = enqueue.mock.calls.map((c) => c[1].jobId);
    expect(new Set(ids).size).toBe(1);
  });
});

describe('social configuration validation', () => {
  const KEY = crypto.randomBytes(32).toString('base64');
  const base = () => {
    const cfg = JSON.parse(JSON.stringify(require('../../src/config')));
    cfg.publishing.google = { clientId: '', clientSecret: '', redirectUri: '' };
    cfg.publishing.encryptionKey = '';
    cfg.social.meta = { ...cfg.social.meta, appId: '', appSecret: '', redirectUri: '' };
    cfg.social.threads = { appId: '', appSecret: '', redirectUri: '' };
    cfg.social.publicMediaBaseUrl = '';
    return cfg;
  };
  const issuesFor = (mutate) => {
    const cfg = base();
    mutate(cfg);
    try {
      validateConfig(cfg);
      return [];
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigValidationError);
      return err.issues;
    }
  };
  const fullMeta = (c) => { c.publishing.encryptionKey = KEY; c.social.meta = { ...c.social.meta, appId: '1', appSecret: 's', redirectUri: 'https://app.example.com/api/social/oauth/meta/callback' }; };

  it('is optional: nothing configured is valid', () => {
    expect(issuesFor(() => {})).toEqual([]);
  });

  it('accepts a complete Meta and Threads setup, and http only for localhost', () => {
    expect(issuesFor((c) => { fullMeta(c); c.social.threads = { appId: '2', appSecret: 't', redirectUri: 'https://app.example.com/api/social/oauth/threads/callback' }; })).toEqual([]);
    expect(issuesFor((c) => { fullMeta(c); c.social.meta.redirectUri = 'http://localhost:3000/api/social/oauth/meta/callback'; })).toEqual([]);
    expect(issuesFor((c) => { fullMeta(c); c.social.meta.redirectUri = 'http://192.168.1.7:3000/cb'; }).map((i) => i.path)).toContain('social.meta.redirectUri');
  });

  it.each([
    ['META_APP_SECRET', (c) => { fullMeta(c); c.social.meta.appSecret = ''; }, 'social.meta.appSecret'],
    ['META_APP_ID', (c) => { fullMeta(c); c.social.meta.appId = ''; }, 'social.meta.appId'],
    ['META_REDIRECT_URI', (c) => { fullMeta(c); c.social.meta.redirectUri = ''; }, 'social.meta.redirectUri'],
    ['THREADS_APP_SECRET', (c) => { fullMeta(c); c.social.threads = { appId: '2', appSecret: '', redirectUri: 'https://a.example.com/cb' }; }, 'social.threads.appSecret'],
    ['PUBLISHING_TOKEN_ENCRYPTION_KEY', (c) => { fullMeta(c); c.publishing.encryptionKey = ''; }, 'publishing.encryptionKey'],
  ])('a half-finished setup names %s', (envVar, mutate, path) => {
    const issue = issuesFor(mutate).find((i) => i.path === path);
    expect(issue.message).toContain(envVar);
  });

  it('requires an https origin without query for the public media URL, and the encryption key to sign it', () => {
    expect(issuesFor((c) => { c.publishing.encryptionKey = KEY; c.social.publicMediaBaseUrl = 'https://media.example.com'; })).toEqual([]);
    expect(issuesFor((c) => { c.publishing.encryptionKey = KEY; c.social.publicMediaBaseUrl = 'http://media.example.com'; }).map((i) => i.path)).toContain('social.publicMediaBaseUrl');
    expect(issuesFor((c) => { c.publishing.encryptionKey = KEY; c.social.publicMediaBaseUrl = 'https://m.example.com?x=1'; }).map((i) => i.path)).toContain('social.publicMediaBaseUrl');
    expect(issuesFor((c) => { c.social.publicMediaBaseUrl = 'https://media.example.com'; }).map((i) => i.path)).toContain('publishing.encryptionKey');
  });

  it('rejects nonsense tuning values', () => {
    expect(issuesFor((c) => { c.social.meta.graphVersion = 'latest'; }).map((i) => i.path)).toContain('social.meta.graphVersion');
    expect(issuesFor((c) => { c.social.maxAttempts = 99; }).map((i) => i.path)).toContain('social.maxAttempts');
    expect(issuesFor((c) => { c.social.schedulerIntervalMs = 0; }).map((i) => i.path)).toContain('social.schedulerIntervalMs');
  });
});
