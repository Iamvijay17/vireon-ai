const SocialPost = require('../../models/SocialPost');
const PublishingJobStore = require('../publishing/PublishingJobStore');
const { PUBLISH_STATUS } = require('../../constants');

const S = PUBLISH_STATUS;
const { event, MAX_EVENTS } = PublishingJobStore;
const DAY_MS = 24 * 3600_000;

/**
 * The worker's persistence for SocialPost. Everything the lease-guarded
 * state machine needs (claim / patch / settle / get) is inherited from
 * PublishingJobStore unchanged - same statuses, same lease fields - so a social
 * post gets exactly the guarantees a YouTube upload has: atomic claim,
 * cancellation-safe writes, takeover of a dead worker's run.
 *
 * Added here is what only scheduled social posts need.
 */
class SocialPostStore extends PublishingJobStore {
  constructor({ Job = SocialPost, ...rest } = {}) {
    super({ Job, ...rest });
  }

  /**
   * A SCHEDULED post whose time has come becomes QUEUED, atomically. Safe to call from both the
   * delayed BullMQ job and the periodic tick, any number of times: only one caller wins the transition.
   * Returns the promoted post, or null (not scheduled / not due / lost the race).
   */
  async promoteIfDue(postId, { slackMs = 1000 } = {}) {
    const at = new Date(this.now());
    return this.Job.findOneAndUpdate(
      { _id: postId, status: S.SCHEDULED, scheduledFor: { $lte: new Date(this.now() + slackMs) } },
      {
        $set: { status: S.QUEUED, queuedAt: at, nextRetryAt: null, 'progress.phase': 'Queued' },
        $push: { events: { $each: [event(S.QUEUED, 'Scheduled time reached - queued for publishing')], $slice: -MAX_EVENTS } },
      },
      { new: true }
    );
  }

  /** Ids of scheduled posts that are due now (oldest first). */
  async findDue(limit = 100) {
    const rows = await this.Job.find({ status: S.SCHEDULED, scheduledFor: { $lte: new Date(this.now() + 1000) } }).sort({ scheduledFor: 1 }).limit(limit);
    return rows.map((r) => String(r._id));
  }

  /**
   * Publishes started for this account in the rolling 24 hours - what the local quota guard counts.
   * `oldest` is when the allowance next frees up.
   */
  async dailyUsage(accountId, platform, { predicate = null } = {}) {
    const since = new Date(this.now() - DAY_MS);
    const rows = await this.Job.find({ accountId, platform, quotaCountedAt: { $gte: since } }).sort({ quotaCountedAt: 1 });
    const counted = predicate ? rows.filter(predicate) : rows;
    return { used: counted.length, oldest: counted[0]?.quotaCountedAt ? new Date(counted[0].quotaCountedAt) : null };
  }
}

module.exports = SocialPostStore;
