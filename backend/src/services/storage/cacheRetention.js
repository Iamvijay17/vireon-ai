const LoggerService = require('../common/LoggerService');

// Marks the one lifecycle rule this app owns, so turning retention off removes
// only our rule and never someone else's.
const RULE_ID = 'vireon-cache-retention';

/**
 * Keeps the cache bucket (TTS audio, scene images, transcripts) from growing
 * forever: objects older than `days` are expired by MinIO itself.
 *
 * The cache is only a shortcut - CacheService treats a missing object as a miss
 * and regenerates - so expiry costs a re-run, never a broken video. Age counts
 * from creation, not last use, which is why the default is "keep everything"
 * (days = 0) and the cost is the operator's call.
 *
 * Best effort: a failure here is logged, it never stops the server starting.
 */
async function applyCacheRetention(client, bucket, days) {
  try {
    const existing = await client.getBucketLifecycle(bucket).catch(() => null);
    const rules = existing?.Rule ? [].concat(existing.Rule) : [];
    const others = rules.filter((rule) => rule.ID !== RULE_ID);
    const ours = rules.find((rule) => rule.ID === RULE_ID);
    const wanted = Number.isInteger(days) && days > 0 ? days : 0;

    if (wanted === 0) {
      if (!ours) return;
      if (others.length > 0) await client.setBucketLifecycle(bucket, { Rule: others });
      else await client.removeBucketLifecycle(bucket);
      LoggerService.info('Cache retention disabled', { bucket });
      return;
    }

    if (Number(ours?.Expiration?.Days) === wanted && ours.Status === 'Enabled') return;
    await client.setBucketLifecycle(bucket, {
      Rule: [...others, { ID: RULE_ID, Status: 'Enabled', Filter: { Prefix: '' }, Expiration: { Days: wanted } }],
    });
    LoggerService.info('Cache retention applied', { bucket, days: wanted });
  } catch (err) {
    LoggerService.warn('Could not apply cache retention', { bucket, error: err.message });
  }
}

module.exports = { applyCacheRetention, RULE_ID };
