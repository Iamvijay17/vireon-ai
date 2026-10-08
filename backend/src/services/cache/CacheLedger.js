const mongoose = require('mongoose');
const CacheEntry = require('../../models/CacheEntry');
const LoggerService = require('../common/LoggerService');

/**
 * Bookkeeping for the smart cache (models/CacheEntry.js): hit, miss, shared,
 * stale, generation time and last reuse, per artifact and per kind.
 *
 * Every write is a single atomic upsert and fire-and-forget: the cache is on the
 * generation path and the ledger must never slow it down or fail it. A Mongo
 * hiccup loses a statistic and logs at debug level; it does not propagate.
 */

const idOf = (kind, key) => `${kind}:${key}`;

function write(kind, key, update, label) {
  // Not connected (a script, a unit test, the gap during a reconnect): Mongoose would buffer
  // the write for ten seconds before failing it. A statistic is not worth that - skip it.
  if (mongoose.connection.readyState !== 1) return;
  try {
    const result = CacheEntry.updateOne(
      { _id: idOf(kind, key) },
      { $setOnInsert: { kind, key }, ...update },
      { upsert: true }
    );
    // updateOne returns a Query; exec() it explicitly so the rejection can be caught.
    Promise.resolve(result.exec ? result.exec() : result).catch((err) => {
      LoggerService.debug(`[Cache ledger] could not record ${label}`, { kind, key, error: err.message });
    });
  } catch (err) {
    LoggerService.debug(`[Cache ledger] could not record ${label}`, { kind, key, error: err.message });
  }
}

/** Served from the cache. */
const hit = (kind, key) =>
  write(kind, key, { $inc: { hits: 1 }, $set: { lastHitAt: new Date(), status: 'ready' } }, 'hit');

/** Not in the cache; it will have to be generated. */
const miss = (kind, key) =>
  write(kind, key, { $inc: { misses: 1 }, $set: { lastMissAt: new Date() } }, 'miss');

/** Waited for an identical in-flight generation instead of starting another. */
const shared = (kind, key) => write(kind, key, { $inc: { shared: 1 }, $set: { lastHitAt: new Date() } }, 'shared wait');

/** Metadata said it was cached but the stored object is gone: the entry is not trustworthy. */
const stale = (kind, key) =>
  write(kind, key, { $inc: { stale: 1 }, $set: { status: 'stale', lastStaleAt: new Date() } }, 'stale entry');

/** Generated, and how long it took. */
const generated = (kind, key, generationMs) =>
  write(kind, key, {
    $inc: { generations: 1, generationMs: Math.max(0, Math.round(generationMs || 0)) },
    $set: { lastGenerationMs: Math.max(0, Math.round(generationMs || 0)), status: 'ready' },
  }, 'generation');

/** Written into the cache bucket. */
const stored = (kind, key, { sizeBytes = null } = {}) =>
  write(kind, key, {
    $set: { status: 'ready', ...(sizeBytes != null ? { sizeBytes } : {}) },
    $min: { firstStoredAt: new Date() },
  }, 'store');

/**
 * Cache effectiveness, by kind, over the last `days` days of activity (an entry counts
 * toward the window if it was reused or missed in it).
 *
 *   hitRate        hits / (hits + misses)
 *   timeSavedMs    each hit would have cost the entry's average generation time
 *
 * Real numbers only: an entry nobody has ever generated through the ledger contributes
 * hits and misses but no time saved (its cost is unknown, not zero).
 */
async function stats({ days = 30 } = {}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await CacheEntry.aggregate([
    { $match: { $or: [{ lastHitAt: { $gte: since } }, { lastMissAt: { $gte: since } }, { lastStaleAt: { $gte: since } }] } },
    {
      $group: {
        _id: '$kind',
        entries: { $sum: 1 },
        hits: { $sum: '$hits' },
        misses: { $sum: '$misses' },
        shared: { $sum: '$shared' },
        stale: { $sum: '$stale' },
        generations: { $sum: '$generations' },
        generationMs: { $sum: '$generationMs' },
        sizeBytes: { $sum: { $ifNull: ['$sizeBytes', 0] } },
        timeSavedMs: {
          $sum: {
            $cond: [
              { $gt: ['$generations', 0] },
              { $multiply: [{ $add: ['$hits', '$shared'] }, { $divide: ['$generationMs', '$generations'] }] },
              0,
            ],
          },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const byKind = rows.map((r) => ({
    kind: r._id,
    entries: r.entries,
    hits: r.hits,
    misses: r.misses,
    shared: r.shared,
    stale: r.stale,
    hitRate: r.hits + r.misses > 0 ? Math.round((r.hits / (r.hits + r.misses)) * 1000) / 10 : null,
    avgGenerationMs: r.generations > 0 ? Math.round(r.generationMs / r.generations) : null,
    timeSavedMs: Math.round(r.timeSavedMs),
    sizeBytes: r.sizeBytes,
  }));

  const total = byKind.reduce(
    (acc, k) => ({ hits: acc.hits + k.hits, misses: acc.misses + k.misses, shared: acc.shared + k.shared, stale: acc.stale + k.stale, timeSavedMs: acc.timeSavedMs + k.timeSavedMs, sizeBytes: acc.sizeBytes + k.sizeBytes }),
    { hits: 0, misses: 0, shared: 0, stale: 0, timeSavedMs: 0, sizeBytes: 0 }
  );
  return {
    days,
    byKind,
    total: { ...total, hitRate: total.hits + total.misses > 0 ? Math.round((total.hits / (total.hits + total.misses)) * 1000) / 10 : null },
  };
}

module.exports = { hit, miss, shared, stale, generated, stored, stats, idOf };
