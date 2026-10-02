const { JobEvent, JobEventCounter } = require('../../models/JobEvent');
const LoggerService = require('./LoggerService');

// A replay is meant to close a reconnect gap, not stream a job's entire
// history - a client that's further behind than this re-reads current state
// from REST instead.
const MAX_REPLAY = 500;

class JobEventService {
  /**
   * Append one event to a job's timeline and return it (with its allocated
   * `seq`), or null if the append failed.
   *
   * Never throws: the event log is an observability record, and losing one
   * entry must not take down the render pipeline that produced it - same
   * contract as AssetService.recordUpload.
   */
  static async append(jobId, type, data = {}) {
    if (!jobId || !type) return null;

    try {
      const counter = await JobEventCounter.findByIdAndUpdate(
        String(jobId),
        { $inc: { seq: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      return await JobEvent.create({
        jobId: String(jobId),
        seq: counter.seq,
        type,
        data,
        at: new Date(),
      });
    } catch (err) {
      LoggerService.warn('Failed to append job event', { jobId, type, error: err.message });
      return null;
    }
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
      LoggerService.warn('Failed to read job events', { jobId, error: err.message });
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
      LoggerService.warn('Failed to delete job events', { error: err.message });
    });
  }
}

module.exports = JobEventService;
