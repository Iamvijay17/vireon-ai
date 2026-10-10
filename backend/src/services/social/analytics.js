const { PUBLISH_STATUS, SOCIAL_PLATFORM } = require('../../constants');

/**
 * Turns the insights cached on SocialPosts into dashboard numbers.
 *
 * The one rule: a number is shown only if a platform reported it. Each cached metric
 * is `{ available, value, reason? }`; the aggregate of a metric that NO published post
 * reported is `{ available: false }` - never 0 - and a metric reported by only some posts
 * says how many (`reporting` of `of`), so a total is never mistaken for the whole picture.
 */

const S = PUBLISH_STATUS;
const PLATFORMS = Object.values(SOCIAL_PLATFORM);

const METRIC_LABELS = Object.freeze({
  views: 'Views',
  reach: 'Reach',
  likes: 'Likes',
  reactions: 'Reactions',
  comments: 'Comments / replies',
  shares: 'Shares',
  saves: 'Saves',
  reposts: 'Reposts',
  quotes: 'Quotes',
  interactions: 'Total interactions',
  avgWatchTimeMs: 'Avg. watch time',
});

// Averaged rather than summed.
const AVERAGED = new Set(['avgWatchTimeMs']);

const day = (d) => new Date(d).toISOString().slice(0, 10);
const rate = (done, failed) => (done + failed > 0 ? Math.round((done / (done + failed)) * 1000) / 10 : null);

function statusCounts(posts) {
  const c = { posts: posts.length, published: 0, failed: 0, cancelled: 0, scheduled: 0, inFlight: 0 };
  for (const p of posts) {
    if (p.status === S.COMPLETED) c.published += 1;
    else if (p.status === S.FAILED) c.failed += 1;
    else if (p.status === S.CANCELLED) c.cancelled += 1;
    else if (p.status === S.SCHEDULED) c.scheduled += 1;
    else c.inFlight += 1;
  }
  return { ...c, successRate: rate(c.published, c.failed) };
}

function aggregateMetric(key, published) {
  const values = [];
  const reasons = new Map();
  const byPlatform = {};
  for (const p of published) {
    const m = p.insights?.metrics?.[key];
    if (!m) continue;
    if (m.available && typeof m.value === 'number' && Number.isFinite(m.value)) {
      values.push(m.value);
      byPlatform[p.platform] = byPlatform[p.platform] || { total: 0, reporting: 0 };
      byPlatform[p.platform].total += m.value;
      byPlatform[p.platform].reporting += 1;
    } else if (m.reason) {
      reasons.set(m.reason, (reasons.get(m.reason) || 0) + 1);
    }
  }
  if (!values.length) {
    const top = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0];
    return { available: false, value: null, reporting: 0, of: published.length, reason: top ? top[0] : 'No published post has reported this yet', byPlatform: {} };
  }
  const sum = values.reduce((a, v) => a + v, 0);
  const value = AVERAGED.has(key) ? Math.round(sum / values.length) : sum;
  if (AVERAGED.has(key)) for (const entry of Object.values(byPlatform)) entry.total = Math.round(entry.total / entry.reporting);
  return { available: true, value, reporting: values.length, of: published.length, byPlatform };
}

function aggregateInsights(posts, { now = Date.now(), cacheMs = 30 * 60_000 } = {}) {
  const published = posts.filter((p) => p.status === S.COMPLETED);

  const byPlatform = Object.fromEntries(PLATFORMS.map((pl) => [pl, statusCounts(posts.filter((p) => p.platform === pl))]));

  const timeline = new Map();
  for (const p of posts) {
    if (![S.COMPLETED, S.FAILED].includes(p.status)) continue;
    const at = p.status === S.COMPLETED ? (p.completedAt || p.updatedAt) : (p.error?.at || p.updatedAt);
    if (!at) continue;
    const key = day(at);
    const row = timeline.get(key) || { date: key, published: 0, failed: 0 };
    row[p.status === S.COMPLETED ? 'published' : 'failed'] += 1;
    timeline.set(key, row);
  }

  const keys = [...new Set(published.flatMap((p) => Object.keys(p.insights?.metrics || {})))];
  const present = Object.keys(METRIC_LABELS).filter((k) => keys.includes(k));
  const metrics = Object.fromEntries(present.map((k) => [k, { label: METRIC_LABELS[k], ...aggregateMetric(k, published) }]));

  const fetched = published.map((p) => p.insights?.fetchedAt).filter(Boolean).map((d) => new Date(d).getTime());
  const top = published
    .map((p) => ({ postId: String(p._id), platform: p.platform, accountLabel: p.accountLabel, permalink: p.remote?.permalink || '', caption: (p.content?.caption || '').slice(0, 100), views: p.insights?.metrics?.views }))
    .filter((p) => p.views?.available && typeof p.views.value === 'number')
    .sort((a, b) => b.views.value - a.views.value)
    .slice(0, 5)
    .map((p) => ({ ...p, views: p.views.value }));

  return {
    totals: statusCounts(posts),
    byPlatform,
    timeline: [...timeline.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    metrics,
    unreportable: {
      note: 'Link clicks and click-through rate are not available per post from these APIs, so they are not shown.',
    },
    freshness: {
      published: published.length,
      neverFetched: published.filter((p) => !p.insights?.fetchedAt).length,
      stale: published.filter((p) => p.insights?.fetchedAt && now - new Date(p.insights.fetchedAt).getTime() > cacheMs).length,
      oldestFetchedAt: fetched.length ? new Date(Math.min(...fetched)) : null,
      newestFetchedAt: fetched.length ? new Date(Math.max(...fetched)) : null,
      note: 'Platforms can delay metrics by up to 48 hours.',
    },
    topPosts: top,
  };
}

module.exports = { aggregateInsights, aggregateMetric, statusCounts, METRIC_LABELS };
