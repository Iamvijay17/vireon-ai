const mongoose = require('mongoose');

/**
 * Append-only timeline of everything that happened to a job, one document
 * per event, ordered by a per-job `seq` that never repeats or reorders.
 *
 * This is the machine-facing stream: the same payloads that go out over
 * Socket.IO, durably stored so a client that was disconnected (or opened
 * the page late) can ask for "everything after seq N" and catch up exactly,
 * instead of only seeing whatever fires after it reconnects. ActivityLog is
 * the separate human-readable log and is unaffected by this.
 */
const jobEventSchema = new mongoose.Schema(
  {
    jobId: {
      type: String,
      required: true,
      index: true,
    },
    // Identity of the event itself, generated once when it is produced and
    // reused by every retry of its write and by the live Socket.IO payload.
    // The (jobId, eventId) unique index below is what makes a retried append
    // a no-op instead of a duplicate. Absent on events stored before this
    // field existed, which the partial index tolerates.
    eventId: {
      type: String,
    },
    // Monotonic per job, allocated by JobEventCounter. Gapless is not
    // guaranteed (an allocated seq whose write then fails leaves a hole);
    // strictly increasing is.
    seq: {
      type: Number,
      required: true,
    },
    // Matches the Socket.IO event name this was emitted as, so a replayed
    // event can be dispatched through the exact same client handler as a
    // live one - 'jobProgress', 'sceneAudioReady', 'jobCompleted', etc.
    type: {
      type: String,
      required: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    at: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

jobEventSchema.index({ jobId: 1, seq: 1 }, { unique: true });
jobEventSchema.index(
  { jobId: 1, eventId: 1 },
  { unique: true, partialFilterExpression: { eventId: { $type: 'string' } } }
);

/**
 * One counter document per job, incremented atomically to hand out `seq`.
 * A dedicated counter (rather than max(seq)+1) is what keeps allocation
 * correct when the API process and a worker process both append to the
 * same job's timeline at the same time.
 */
const jobEventCounterSchema = new mongoose.Schema(
  {
    _id: { type: String },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

module.exports = {
  JobEvent: mongoose.model('JobEvent', jobEventSchema),
  JobEventCounter: mongoose.model('JobEventCounter', jobEventCounterSchema),
};
