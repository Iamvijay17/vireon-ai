const Metric = require('../../models/Metric');

/**
 * Thin wrapper around the Metric collection for cheap, fire-and-forget
 * counters/aggregates (cache hit/miss counts, cumulative TTS synthesis
 * time, ...) that Analytics reads back as rates/averages. Every write is a
 * single atomic upsert - never reads a metric back except to report it.
 */
class MetricsService {
  static async increment(key, by = 1) {
    try {
      await Metric.updateOne({ _id: key }, { $inc: { count: by } }, { upsert: true });
    } catch {
      // Metrics are best-effort - never let a counter failure break the
      // actual cache/TTS operation it's measuring.
    }
  }

  static async recordDuration(key, ms) {
    try {
      await Metric.updateOne({ _id: key }, { $inc: { count: 1, sum: ms } }, { upsert: true });
    } catch {
      // best-effort, see above
    }
  }

  static async getAverage(key) {
    const doc = await Metric.findById(key).lean();
    if (!doc || !doc.count) return null;
    return doc.sum / doc.count;
  }

  static async getRate(hitKey, missKey) {
    const [hits, misses] = await Promise.all([
      Metric.findById(hitKey).lean(),
      Metric.findById(missKey).lean(),
    ]);
    const hitCount = hits?.count || 0;
    const missCount = misses?.count || 0;
    const total = hitCount + missCount;
    if (!total) return null;
    return Math.round((hitCount / total) * 1000) / 10;
  }
}

module.exports = MetricsService;
