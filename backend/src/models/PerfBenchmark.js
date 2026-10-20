const mongoose = require('mongoose');

/**
 * One measured pipeline run, recorded by scripts/benchPipeline.js so a later change can be
 * compared with it (services/perf/benchmarkAnalysis.js#compareRuns). Additive collection:
 * nothing else reads or writes it, and dropping it loses history only.
 *
 * `hardware`, `versions` and `settings` are snapshots taken when the run finished, so a run
 * stays interpretable after the machine or the models change. `stages` is the job's own
 * persisted stage record (duration, attempt, reused, measured resources).
 */
const perfBenchmarkSchema = new mongoose.Schema(
  {
    label: { type: String, default: '', trim: true, maxlength: 120 },
    // What was measured: a full pipeline run, or one component in isolation.
    kind: { type: String, enum: ['pipeline', 'component'], default: 'pipeline' },
    jobId: { type: String, default: null, index: true },
    status: { type: String, required: true }, // the job's final status
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
    // Wall time from submission to the terminal status, which includes queue wait.
    totalMs: { type: Number, required: true },
    queueWaitMs: { type: Number, default: null },

    hardware: { type: mongoose.Schema.Types.Mixed, default: null },
    versions: { type: mongoose.Schema.Types.Mixed, default: null },
    settings: { type: mongoose.Schema.Types.Mixed, default: null },
    workload: { type: mongoose.Schema.Types.Mixed, default: null },
    stages: { type: mongoose.Schema.Types.Mixed, default: null },

    // Change in the cache ledger's hit/miss counters while the run was in flight, by kind.
    // null when the ledger could not be read before and after.
    cache: { type: mongoose.Schema.Types.Mixed, default: null },
    // The post-render quality gate's verdict for the produced file (null if it did not run).
    validation: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: mongoose.Schema.Types.Mixed, default: null },
    notes: { type: String, default: '', maxlength: 2000 },
  },
  { timestamps: true }
);

perfBenchmarkSchema.index({ finishedAt: -1 });

module.exports = mongoose.models.PerfBenchmark || mongoose.model('PerfBenchmark', perfBenchmarkSchema);
