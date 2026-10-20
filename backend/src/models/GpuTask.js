const mongoose = require('mongoose');

/**
 * One GPU task: a single trip through the scheduler (queue -> admission ->
 * run), written by services/gpu/gpuTaskLedger.js.
 *
 * This is the GPU layer's recovery checkpoint. VideoJob.stages records what a
 * *stage* did; this records what the *card* was doing for it - how long it sat
 * in the queue, which attempt it was on, whether it was admitted under memory
 * pressure. After a crash, a row still `queued`/`running` whose heartbeat has
 * gone silent is the proof that work was lost mid-task, and the sweep
 * (gpuTaskLedger.reapAbandoned) closes it so the history is honest.
 */
const gpuTaskSchema = new mongoose.Schema(
  {
    taskId: { type: String, required: true, unique: true },
    // jobId:stage:service - what makes two tasks "the same task".
    key: { type: String, index: true },
    jobId: { type: String, index: true },
    stage: { type: String },
    service: { type: String, required: true },
    label: { type: String },
    priority: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['queued', 'running', 'retrying', 'completed', 'failed', 'cancelled', 'abandoned'],
      default: 'queued',
      index: true,
    },
    attempts: { type: Number, default: 0 },
    enqueuedAt: { type: Date },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    // Touched while the task is queued or running; silence means its process died.
    heartbeatAt: { type: Date },
    waitMs: { type: Number },
    runMs: { type: Number },
    admittedUnderPressure: { type: Boolean, default: false },
    worker: { type: String },
    error: {
      code: String,
      message: String,
    },
    // History is for diagnosis, not an archive.
    expireAt: { type: Date, default: () => new Date(Date.now() + 14 * 24 * 3600 * 1000), index: { expires: 0 } },
  },
  { timestamps: true }
);

module.exports = mongoose.models.GpuTask || mongoose.model('GpuTask', gpuTaskSchema);
