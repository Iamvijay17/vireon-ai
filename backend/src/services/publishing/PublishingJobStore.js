const PublishingJob = require('../../models/PublishingJob');
const { PUBLISH_STATUS } = require('../../constants');
const cipher = require('./crypto');

const ACTIVE = PublishingJob.ACTIVE_STATUSES;
const MAX_EVENTS = 60;

const event = (status, message, level = 'info') => ({ at: new Date(), status, level, message });

/**
 * Every state change a worker makes to a PublishingJob goes through here, and
 * each one is a single atomic findOneAndUpdate guarded by the worker's lease.
 *
 * That guard is the point. Two things can happen while a worker is busy for
 * minutes: the user cancels the job, or the worker is presumed dead and its
 * lease is taken over (long GC pause, laptop sleep, stalled BullMQ job).
 * Either way the job document no longer matches `{status active, lease.owner =
 * me}`, `patch()` returns null, and the worker stops - it can never overwrite
 * a cancellation or race the worker that replaced it.
 */
class PublishingJobStore {
  constructor({ Job = PublishingJob, now = () => Date.now(), leaseMs = 2 * 60_000 } = {}) {
    this.Job = Job;
    this.now = now;
    this.leaseMs = leaseMs;
  }

  #lease(workerId) {
    return { owner: workerId, expiresAt: new Date(this.now() + this.leaseMs) };
  }

  /**
   * Take ownership of a job to work on it. Two legitimate ways in:
   *  1. a fresh run - QUEUED, or RETRYING whose wait is over (spends an attempt);
   *  2. taking over a run whose worker died - an active status with an expired
   *     or absent lease (does not spend an attempt; the work simply continues).
   * Anything else - cancelled, completed, owned by a live worker - returns null.
   */
  async claim(jobId, workerId) {
    const at = new Date(this.now());
    const due = [{ nextRetryAt: null }, { nextRetryAt: { $lte: new Date(this.now() + 1000) } }];

    const fresh = await this.Job.findOneAndUpdate(
      { _id: jobId, status: { $in: [PUBLISH_STATUS.QUEUED, PUBLISH_STATUS.RETRYING] }, $or: due },
      {
        $set: { status: PUBLISH_STATUS.VALIDATING, lease: this.#lease(workerId), nextRetryAt: null, startedAt: at, 'progress.phase': 'Validating' },
        $inc: { attempts: 1 },
        $push: { events: { $each: [event(PUBLISH_STATUS.VALIDATING, 'Worker picked up the job')], $slice: -MAX_EVENTS } },
      },
      { new: true }
    );
    if (fresh) return fresh;

    return this.Job.findOneAndUpdate(
      {
        _id: jobId,
        status: { $in: ACTIVE },
        $and: [
          { $or: [{ 'lease.expiresAt': null }, { 'lease.expiresAt': { $lt: at } }] },
          { $or: due },
        ],
      },
      {
        $set: { lease: this.#lease(workerId), nextRetryAt: null },
        $push: { events: { $each: [event(PUBLISH_STATUS.VALIDATING, 'Worker resumed the job')], $slice: -MAX_EVENTS } },
      },
      { new: true }
    );
  }

  /**
   * Lease-guarded update. `set`/`unset`/`inc` map to Mongo operators; `ev` is
   * `[status, message, level]`. Also renews the lease. Null = we no longer own it.
   */
  async patch(jobId, workerId, { set = {}, unset = [], inc = null, ev = null } = {}) {
    const update = {
      $set: { ...set, lease: this.#lease(workerId) },
    };
    if (unset.length) update.$unset = Object.fromEntries(unset.map((k) => [k, 1]));
    if (inc) update.$inc = inc;
    if (ev) update.$push = { events: { $each: [event(...ev)], $slice: -MAX_EVENTS } };

    return this.Job.findOneAndUpdate(
      { _id: jobId, 'lease.owner': workerId, status: { $in: ACTIVE } },
      update,
      { new: true }
    );
  }

  /**
   * End a run and hand the job to a non-active status (RETRYING, FAILED,
   * COMPLETED, or PROCESSING-waiting), dropping the lease in the same write.
   */
  async settle(jobId, workerId, { status, set = {}, unset = [], inc = null, ev = null }) {
    const update = {
      $set: { status, ...set, 'lease.owner': '', 'lease.expiresAt': null },
    };
    if (unset.length) update.$unset = Object.fromEntries(unset.map((k) => [k, 1]));
    if (inc) update.$inc = inc;
    if (ev) update.$push = { events: { $each: [event(...ev)], $slice: -MAX_EVENTS } };

    return this.Job.findOneAndUpdate(
      { _id: jobId, 'lease.owner': workerId, status: { $in: ACTIVE } },
      update,
      { new: true }
    );
  }

  get(jobId) {
    return this.Job.findById(jobId).lean();
  }

  /** The decrypted resumable-session URL, or '' when none/unreadable. */
  async readSession(jobId) {
    const doc = await this.Job.findById(jobId).select('+remote.sessionEnc').lean();
    const enc = doc?.remote?.sessionEnc;
    if (!enc) return '';
    try {
      return cipher.decrypt(enc);
    } catch {
      return ''; // unreadable -> the uploader just opens a new session
    }
  }

  /** Uploads that started a session at or after `since` - what the daily quota guard counts. */
  countUploadsSince(since) {
    return this.Job.countDocuments({ platform: 'youtube', quotaCountedAt: { $gte: since } });
  }
}

module.exports = PublishingJobStore;
module.exports.event = event;
module.exports.MAX_EVENTS = MAX_EVENTS;
