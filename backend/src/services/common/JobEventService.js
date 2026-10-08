const crypto = require('crypto');
const mongoose = require('mongoose');
const { JobEvent, JobEventCounter } = require('../../models/JobEvent');
const LoggerService = require('./LoggerService');
const { computeBackoffMs } = require('../../utils/backoff');

// A replay is meant to close a reconnect gap, not stream a job's entire
// history - a client that's further behind than this re-reads current state
// from REST instead.
const MAX_REPLAY = 500;

// One initial attempt plus up to MAX_RETRIES retries. Delays are
// 200 / 400 / 800 ms (computeBackoffMs), so the worst case a caller waits on
// a persistently failing write is ~1.4s plus the driver's own op time - the
// pipeline is never held hostage by the event log.
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 200;
const RETRY_MAX_MS = 2000;

// Mongoose connection states (mongoose.STATES): 0 = disconnected.
const DISCONNECTED = 0;

// Tail of each job's in-process append chain (jobId -> promise). Appends for
// one job run strictly one after another, so within a process the order
// events are produced is the order they get `seq` and the order they are
// emitted. Entries delete themselves when their chain drains.
const chains = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class JobEventService {
  /**
   * Fresh unique id for an event. Generated once per logical event and
   * reused across every retry of its write - that is what makes the write
   * idempotent.
   */
  static newEventId() {
    return crypto.randomUUID();
  }

  /**
   * Append one event to a job's timeline and return it
   * (`{ eventId, jobId, seq, type, data, at }`), or null if it could not be
   * persisted even after retrying.
   *
   * Never throws: the event log is an observability record, and losing one
   * entry must not take down the render pipeline that produced it - same
   * contract as AssetService.recordUpload. A final failure is NOT silent
   * though: it is logged at error level with jobId, eventId, type, attempt
   * count and the underlying driver error.
   *
   * Idempotency: callers may pass `opts.eventId` (and `opts.at`) so the live
   * Socket.IO payload and the stored event share one identity; if omitted
   * they are generated here. The write is an upsert keyed on
   * (jobId, eventId), so re-running it - from a retry, or after a timeout
   * whose first attempt actually landed - can never create a second copy.
   */
  static append(jobId, type, data = {}, opts = {}) {
    if (!jobId || !type) return Promise.resolve(null);

    const key = String(jobId);
    const eventId = opts.eventId || JobEventService.newEventId();
    const at = opts.at ? new Date(opts.at) : new Date();

    const previous = chains.get(key) || Promise.resolve();
    // _persist never rejects, so the chain can't wedge on a failed event.
    const run = previous.then(() => JobEventService._persist(key, eventId, type, data, at));
    chains.set(key, run);
    run.then(() => {
      if (chains.get(key) === run) chains.delete(key);
    });
    return run;
  }

  static async _persist(jobId, eventId, type, data, at) {
    // Allocated once and reused by every retry: if the counter bump landed
    // but its response was lost, re-bumping would only burn a seq (a harmless
    // gap) - but reusing it keeps seq and eventId paired 1:1.
    let seq = null;
    let lastError = null;
    const totalAttempts = MAX_RETRIES + 1;

    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      try {
        // Without this, a process that never connected to Mongo (a script,
        // or the gap during a reconnect) makes Mongoose buffer the op for
        // its full 10s timeout before failing - once per event.
        if (mongoose.connection.readyState === DISCONNECTED) {
          throw new Error('MongoDB is not connected');
        }

        if (seq === null) {
          const counter = await JobEventCounter.findByIdAndUpdate(
            jobId,
            { $inc: { seq: 1 } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          seq = counter.seq;
        }

        await JobEvent.updateOne(
          { jobId, eventId },
          { $setOnInsert: { seq, type, data, at } },
          { upsert: true }
        );

        if (attempt > 1) {
          LoggerService.info('[Job Event] persisted successfully', { jobId, eventId, type, seq, attempt });
        } else {
          LoggerService.debug('[Job Event] persisted successfully', { jobId, eventId, type, seq });
        }
        return { eventId, jobId, seq, type, data, at };
      } catch (err) {
        lastError = err;
        if (attempt <= MAX_RETRIES) {
          LoggerService.warn(`[Job Event] retry ${attempt}/${MAX_RETRIES}`, {
            jobId, eventId, type, attempt, error: err.message,
          });
          await sleep(computeBackoffMs(attempt, { base: RETRY_BASE_MS, max: RETRY_MAX_MS }));
        }
      }
    }

    LoggerService.error(`[Job Event] persistence failed after ${totalAttempts} attempts`, {
      jobId, eventId, type, retryCount: MAX_RETRIES, error: lastError?.message,
    });
    return null;
  }

  /**
   * Events after `sinceSeq`, oldest first - the shape a reconnecting client
   * replays in. `sinceSeq` is exclusive, so a client that has seen seq 12
   * asks for 12 and gets 13 onward.
   */
  static async since(jobId, sinceSeq = 0, limit = MAX_REPLAY) {
    try {
      const capped = Math.max(1, Math.min(MAX_REPLAY, parseInt(limit, 10) || MAX_REPLAY));
      return await JobEvent.find({ jobId: String(jobId), seq: { $gt: Number(sinceSeq) || 0 } })
        .sort({ seq: 1 })
        .limit(capped)
        .lean();
    } catch (err) {
      LoggerService.warn('[Job Event] failed to read events', { jobId, error: err.message });
      return [];
    }
  }

  /**
   * Highest seq allocated for a job, or 0 if it has no events yet.
   */
  static async latestSeq(jobId) {
    const counter = await JobEventCounter.findById(String(jobId)).lean().catch(() => null);
    return counter?.seq || 0;
  }

  static async deleteByJob(jobIds) {
    const ids = (Array.isArray(jobIds) ? jobIds : [jobIds]).map(String);
    await Promise.all([
      JobEvent.deleteMany({ jobId: { $in: ids } }),
      JobEventCounter.deleteMany({ _id: { $in: ids } }),
    ]).catch((err) => {
      LoggerService.warn('[Job Event] failed to delete events', { error: err.message });
    });
  }
}

module.exports = JobEventService;
