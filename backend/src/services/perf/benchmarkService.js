const mongoose = require('mongoose');
const PerfBenchmark = require('../../models/PerfBenchmark');
const { findBottleneck, compareRuns, peakResources } = require('./benchmarkAnalysis');
const { NotFoundError, ValidationError } = require('../../utils/errors');

/**
 * Read side of the benchmark history (written by scripts/benchPipeline.js). A run is returned
 * with its bottleneck explanation and peak memory computed from its own stored measurements.
 */

const present = (run) => ({
  id: String(run._id),
  label: run.label,
  jobId: run.jobId,
  status: run.status,
  startedAt: run.startedAt,
  finishedAt: run.finishedAt,
  totalMs: run.totalMs,
  queueWaitMs: run.queueWaitMs ?? null,
  activeMs: run.activeMs ?? null,
  workload: run.workload,
  settings: run.settings,
  hardware: run.hardware,
  versions: run.versions,
  ranking: run.ranking || [],
  stages: run.stages,
  peak: peakResources(run.stages || {}),
  bottleneck: findBottleneck(run.stages || {}, run.workload || {}),
  cache: run.cache ?? null,
  validation: run.validation ?? null,
  error: run.error ?? null,
  notes: run.notes,
});

async function list({ limit = 20 } = {}) {
  const rows = await PerfBenchmark.find({}).sort({ finishedAt: -1 }).limit(Math.min(Math.max(limit, 1), 100)).lean();
  return rows.map(present);
}

async function compare(beforeId, afterId) {
  if (![beforeId, afterId].every((id) => id && mongoose.isValidObjectId(id))) throw new ValidationError('Both "before" and "after" must be stored benchmark run ids.');
  const [before, after] = await Promise.all([PerfBenchmark.findById(beforeId).lean(), PerfBenchmark.findById(afterId).lean()]);
  if (!before || !after) throw new NotFoundError('Benchmark run not found.');
  return { before: present(before), after: present(after), comparison: compareRuns(before, after) };
}

module.exports = { list, compare, present };
