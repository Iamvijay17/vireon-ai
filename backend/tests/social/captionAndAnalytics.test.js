jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), border: jest.fn(),
}));

const CaptionService = require('../../src/services/social/captionService');
const { sanitizeVariant, buildPrompt } = CaptionService;
const { aggregateInsights } = require('../../src/services/social/analytics');
const { validatePost } = require('../../src/services/social/contentRules');

const video = { title: 'How closures work', description: 'A short explainer', excerpt: 'A closure is a function that remembers...' };

describe('caption generation', () => {
  it('writes a different variant per platform and marks them as AI-written', async () => {
    const llm = {
      _callLLM: jest.fn(async () => ({
        facebook: { caption: 'Closures, explained in 60 seconds.', hashtags: ['#javascript', 'coding'], cta: 'Watch the video' },
        instagram: { caption: 'Closures finally click 🔥', hashtags: ['javascript', 'learntocode'], cta: 'Save this' },
        threads: { caption: 'A closure remembers where it was born.', hashtags: ['js'], cta: 'Watch' },
      })),
    };
    const out = await new CaptionService({ llm }).generate({ platforms: ['facebook', 'instagram', 'threads'], tone: 'educational', video, brief: { destinationUrl: 'https://e.test/v' } });
    expect(Object.keys(out)).toEqual(['facebook', 'instagram', 'threads']);
    expect(new Set(Object.values(out).map((v) => v.caption)).size).toBe(3);
    expect(Object.values(out).every((v) => v.origin === 'ai')).toBe(true);
    expect(out.facebook.hashtags).toEqual(['#javascript', '#coding']);
    expect(out.instagram.linkUrl).toBe(''); // links are not clickable on Instagram
    expect(out.threads.linkUrl).toBe('https://e.test/v');
    const prompt = llm._callLLM.mock.calls[0][0];
    expect(prompt).toMatch(/How closures work/);
    expect(prompt).toMatch(/educational/);
  });

  it('keeps Threads copy inside 500 characters even after the cta, hashtag and link are added', async () => {
    const llm = { _callLLM: async () => ({ threads: { caption: `${'Long sentence here. '.repeat(60)}`, hashtags: ['a', 'b', 'c'], cta: 'Watch the whole video now' } }) };
    const out = await new CaptionService({ llm }).generate({ platforms: ['threads'], video, brief: { destinationUrl: 'https://example.test/some/long/path' } });
    expect(out.threads.hashtags).toHaveLength(1);
    const check = validatePost({ platform: 'threads', content: out.threads, caps: {} });
    expect(check.errors.map((e) => e.code)).not.toContain('TEXT_TOO_LONG');
    expect(check.composed.length).toBeLessThanOrEqual(500);
  });

  it('limits Instagram hashtags to 30 and normalises junk from the model', () => {
    const v = sanitizeVariant('instagram', { caption: 'hi', hashtags: Array.from({ length: 50 }, (_, i) => `# tag ${i}!`), cta: 'x' });
    expect(v.hashtags.length).toBe(30);
    expect(v.hashtags[0]).toBe('#tag0');
  });

  it('drops platforms the model skipped or left empty, and fails clearly when nothing is usable', async () => {
    const partial = { _callLLM: async () => ({ facebook: { caption: 'ok', hashtags: [] }, instagram: { caption: '   ' } }) };
    expect(Object.keys(await new CaptionService({ llm: partial }).generate({ platforms: ['facebook', 'instagram'], video }))).toEqual(['facebook']);
    const none = { _callLLM: async () => ({}) };
    await expect(new CaptionService({ llm: none }).generate({ platforms: ['facebook'], video })).rejects.toMatchObject({ code: 'AI_UNAVAILABLE', status: 503 });
  });

  it('reports an unreachable local LLM as AI_UNAVAILABLE so the UI falls back to manual writing', async () => {
    const down = { _callLLM: async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:11434'); } };
    const err = await new CaptionService({ llm: down }).generate({ platforms: ['facebook'], video }).catch((e) => e);
    expect(err).toMatchObject({ code: 'AI_UNAVAILABLE', status: 503 });
    expect(err.message).toMatch(/by hand/);
  });

  it('puts the video facts and the brief in the prompt, and forbids invented claims', () => {
    const prompt = buildPrompt({ platforms: ['facebook'], tone: 'promotional', video, brief: { goal: 'Get signups', audience: 'beginners', cta: 'Enroll today' } });
    expect(prompt).toMatch(/Get signups/);
    expect(prompt).toMatch(/beginners/);
    expect(prompt).toMatch(/Enroll today/);
    expect(prompt).toMatch(/Do not invent/);
  });
});

describe('analytics aggregation', () => {
  const post = (over) => ({ _id: `spo-${Math.random().toString(36).slice(2, 10)}`, status: 'COMPLETED', platform: 'instagram', accountLabel: 'A', content: { caption: 'c' }, remote: { permalink: 'https://x' }, completedAt: new Date('2026-10-05T10:00:00Z'), insights: { fetchedAt: new Date('2026-10-06T10:00:00Z'), metrics: null }, ...over });
  const m = (value) => ({ available: true, value });
  const na = (reason) => ({ available: false, value: null, reason });

  it('sums reported values, counts how many posts reported them, and keeps a real 0 distinct from unavailable', () => {
    const out = aggregateInsights([
      post({ insights: { fetchedAt: new Date(), metrics: { views: m(100), likes: m(0), reach: na('Not supported') } } }),
      post({ platform: 'threads', insights: { fetchedAt: new Date(), metrics: { views: m(50), likes: m(4), reach: na('Not supported') } } }),
      post({ insights: { fetchedAt: new Date(), metrics: { views: na('x'), likes: m(1) } } }),
    ], { now: Date.now() });
    expect(out.metrics.views).toMatchObject({ available: true, value: 150, reporting: 2, of: 3 });
    expect(out.metrics.likes).toMatchObject({ available: true, value: 5, reporting: 3 });
    expect(out.metrics.reach).toMatchObject({ available: false, value: null, reporting: 0, reason: 'Not supported' });
    expect(out.metrics.views.byPlatform).toEqual({ instagram: { total: 100, reporting: 1 }, threads: { total: 50, reporting: 1 } });
  });

  it('averages watch time instead of summing it', () => {
    const out = aggregateInsights([
      post({ insights: { fetchedAt: new Date(), metrics: { avgWatchTimeMs: m(4000) } } }),
      post({ insights: { fetchedAt: new Date(), metrics: { avgWatchTimeMs: m(6000) } } }),
    ]);
    expect(out.metrics.avgWatchTimeMs.value).toBe(5000);
  });

  it('computes the success rate from finished posts only and says null when there are none', () => {
    const out = aggregateInsights([post({}), post({}), post({ status: 'FAILED', error: { at: new Date('2026-10-05T11:00:00Z') } }), post({ status: 'SCHEDULED' }), post({ status: 'CANCELLED' })]);
    expect(out.totals).toMatchObject({ posts: 5, published: 2, failed: 1, scheduled: 1, cancelled: 1, successRate: 66.7 });
    expect(aggregateInsights([post({ status: 'SCHEDULED' })]).totals.successRate).toBeNull();
    expect(aggregateInsights([]).totals.successRate).toBeNull();
  });

  it('builds a per-platform breakdown and a per-day timeline', () => {
    const out = aggregateInsights([post({}), post({ platform: 'facebook', status: 'FAILED', error: { at: new Date('2026-10-06T08:00:00Z') } })]);
    expect(out.byPlatform.instagram.published).toBe(1);
    expect(out.byPlatform.facebook.failed).toBe(1);
    expect(out.byPlatform.threads.posts).toBe(0);
    expect(out.timeline).toEqual([{ date: '2026-10-05', published: 1, failed: 0 }, { date: '2026-10-06', published: 0, failed: 1 }]);
  });

  it('reports freshness: never fetched and stale insights', () => {
    const now = Date.parse('2026-10-10T12:00:00Z');
    const out = aggregateInsights([
      post({ insights: { fetchedAt: null, metrics: null } }),
      post({ insights: { fetchedAt: new Date(now - 3600_000), metrics: { views: m(1) } } }),
      post({ insights: { fetchedAt: new Date(now - 60_000), metrics: { views: m(1) } } }),
    ], { now, cacheMs: 1800_000 });
    expect(out.freshness).toMatchObject({ published: 3, neverFetched: 1, stale: 1 });
  });

  it('states that per-post link clicks are not available rather than inventing them', () => {
    const out = aggregateInsights([post({})]);
    expect(out.metrics.clicks).toBeUndefined();
    expect(out.unreportable.note).toMatch(/clicks/i);
  });
});
