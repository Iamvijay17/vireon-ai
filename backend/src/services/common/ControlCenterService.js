const VideoJob = require('../../models/VideoJob');
const { JobEvent } = require('../../models/JobEvent');
const MetricsService = require('./MetricsService');
const CacheLedger = require('../cache/CacheLedger');
const config = require('../../config');
const { JOB_STATUS } = require('../../constants');
const { STAGE_ORDER } = require('../pipeline/stages');

/**
 * The Control Center: one read-only view of how the pipeline is actually doing, built
 * only from data the system persists - no estimates dressed up as measurements.
 *
 *   VIDEOS     status counts of video jobs created in the window
 *   PIPELINE   per-stage run time (VideoJob.stages), average generation time, queue wait
 *   CACHE      hits / misses / hit rate / time saved per artifact kind (CacheEntry ledger)
 *   FAILURES   per-stage attempts and failures, top error codes, retries (JobEvent stage stream)
 *   WORKERS    BullMQ queue depth and counts, and how many workers are online
 *
 * Where the persisted data does not cover something it says so instead of guessing:
 * jobs that predate stage tracking are counted (`jobsWithoutStageData`) and left out of
 * the stage averages; a figure with nothing behind it is `null`, never 0.
 *
 * The pipelines are exported as functions of `since` so tests can pin exactly what is
 * asked of Mongo; the `shape*` functions are pure transforms of the rows that come back.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const STAGE_LABELS = Object.freeze({
  script: 'Script',
  audio: 'Voice (TTS)',
  images: 'Images',
  assets: 'Assets',
  render: 'Render',
  upload: 'Upload',
});

// Statuses in which the worker is doing something, or has a job queued for it.
const PROCESSING_STATUSES = Object.freeze([
  JOB_STATUS.QUEUED, JOB_STATUS.SCRIPT_GENERATION, JOB_STATUS.GENERATING_AUDIO, JOB_STATUS.GENERATING_IMAGES,
  JOB_STATUS.PREPARING_ASSETS, JOB_STATUS.RENDERING, JOB_STATUS.UPLOADING, JOB_STATUS.RETRY_SCHEDULED,
  JOB_STATUS.AUDIO_COMPLETED, JOB_STATUS.IMAGE_COMPLETED,
]);
// Waiting on a person, not on a machine.
const WAITING_STATUSES = Object.freeze([JOB_STATUS.AWAITING_APPROVAL, JOB_STATUS.SCRIPT_COMPLETED]);

const round1 = (n) => Math.round(n * 10) / 10;
const rate = (part, whole) => (whole > 0 ? round1((part / whole) * 100) : null);
const avg = (sum, count) => (count > 0 ? Math.round(sum / count) : null);

// ---- Mongo pipelines -------------------------------------------------------------------

const videoStatusPipeline = (since) => [
  { $match: { createdAt: { $gte: since } } },
  { $group: { _id: '$status', count: { $sum: 1 } } },
];

// "A run that did real timed work": completed, not merely reused, with a duration.
const TIMED = { $and: [{ $eq: ['$stages.v.status', 'completed'] }, { $ne: ['$stages.v.reused', true] }, { $gt: ['$stages.v.durationMs', 0] }] };

/** Per-stage totals from the stage state persisted on each job (VideoJob.stages). */
const stageTimingPipeline = (since) => [
  { $match: { createdAt: { $gte: since }, stages: { $type: 'object' } } },
  { $project: { stages: { $objectToArray: '$stages' } } },
  { $unwind: '$stages' },
  {
    $group: {
      _id: '$stages.k',
      jobs: { $sum: 1 },
      completed: { $sum: { $cond: [{ $eq: ['$stages.v.status', 'completed'] }, 1, 0] } },
      reused: { $sum: { $cond: [{ $eq: ['$stages.v.reused', true] }, 1, 0] } },
      timedRuns: { $sum: { $cond: [TIMED, 1, 0] } },
      totalMs: { $sum: { $cond: [TIMED, '$stages.v.durationMs', 0] } },
      maxMs: { $max: { $cond: [TIMED, '$stages.v.durationMs', null] } },
    },
  },
];

const jobsWithStageDataPipeline = (since) => [
  { $match: { createdAt: { $gte: since } } },
  { $group: { _id: { $cond: [{ $eq: [{ $type: '$stages' }, 'object'] }, 'with', 'without'] }, count: { $sum: 1 } } },
];

/** Working time of completed jobs: the sum of time in each active status (see AnalyticsService). */
const generationTimePipeline = (since, activeStatuses) => [
  { $match: { status: JOB_STATUS.COMPLETED, completedAt: { $gte: since } } },
  {
    $project: {
      activeMs: {
        $sum: {
          $map: {
            input: { $filter: { input: { $ifNull: ['$statusHistory', []] }, cond: { $in: ['$$this.from', activeStatuses] } } },
            in: { $ifNull: ['$$this.durationMs', 0] },
          },
        },
      },
    },
  },
  { $match: { activeMs: { $gt: 0 } } },
  { $group: { _id: null, avgMs: { $avg: '$activeMs' }, jobs: { $sum: 1 } } },
];

/** Stage starts / failures / completions from the job event stream (stageUpdate events). */
const stageEventPipeline = (since) => [
  { $match: { type: 'stageUpdate', at: { $gte: since } } },
  {
    $group: {
      _id: { stage: '$data.stage', status: '$data.status' },
      count: { $sum: 1 },
      // an attempt above 1 is a retry of that stage
      retries: { $sum: { $cond: [{ $gt: ['$data.attempt', 1] }, 1, 0] } },
    },
  },
];

const topErrorPipeline = (since, limit = 8) => [
  { $match: { type: 'stageUpdate', 'data.status': 'failed', at: { $gte: since } } },
  { $sort: { at: 1 } },
  {
    $group: {
      _id: { code: '$data.error.code', stage: '$data.stage' },
      count: { $sum: 1 },
      message: { $last: '$data.error.message' },
      retryable: { $last: '$data.error.retryable' },
      lastAt: { $max: '$at' },
    },
  },
  { $sort: { count: -1, lastAt: -1 } },
  { $limit: limit },
];

/** Failed jobs by error code (or, for jobs that predate structured errors, by the step that failed). */
const failedJobErrorPipeline = (since) => [
  { $match: { status: JOB_STATUS.FAILED, createdAt: { $gte: since } } },
  { $group: { _id: { $ifNull: ['$error.code', { $ifNull: ['$error.step', 'UNKNOWN'] }] }, count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 8 },
];

const retryPipeline = (since) => [
  { $match: { createdAt: { $gte: since }, 'statusHistory.to': JOB_STATUS.RETRY_SCHEDULED } },
  {
    $project: {
      retries: { $size: { $filter: { input: '$statusHistory', cond: { $eq: ['$$this.to', JOB_STATUS.RETRY_SCHEDULED] } } } },
    },
  },
  { $group: { _id: null, jobs: { $sum: 1 }, retries: { $sum: '$retries' } } },
];

// ---- Shapers (pure) ---------------------------------------------------------------------

function shapeVideos(statusRows, allTime) {
  const counts = Object.fromEntries(statusRows.map((r) => [r._id, r.count]));
  const sum = (statuses) => statuses.reduce((total, s) => total + (counts[s] || 0), 0);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const successful = counts[JOB_STATUS.COMPLETED] || 0;
  const failed = counts[JOB_STATUS.FAILED] || 0;
  const cancelled = counts[JOB_STATUS.CANCELLED] || 0;
  return {
    total,
    allTime,
    successful,
    failed,
    cancelled,
    processing: sum(PROCESSING_STATUSES),
    awaitingPerson: sum(WAITING_STATUSES),
    // Of the videos that reached an end state (finished, failed or stopped).
    successRate: rate(successful, successful + failed + cancelled),
    byStatus: statusRows.filter((r) => r._id).map((r) => ({ status: r._id, count: r.count })).sort((a, b) => b.count - a.count),
  };
}

function shapePipeline({ stageRows, generationRows, stageDataRows, queueWaitMs }) {
  const byKey = Object.fromEntries(stageRows.map((r) => [r._id, r]));
  const stages = STAGE_ORDER.map((key) => {
    const r = byKey[key];
    return {
      key,
      label: STAGE_LABELS[key],
      jobs: r?.jobs || 0,
      completed: r?.completed || 0,
      reused: r?.reused || 0,
      timedRuns: r?.timedRuns || 0,
      avgMs: avg(r?.totalMs || 0, r?.timedRuns || 0),
      maxMs: r?.maxMs ?? null,
    };
  });
  const counts = Object.fromEntries(stageDataRows.map((r) => [r._id, r.count]));
  return {
    avgGenerationMs: generationRows[0]?.avgMs != null ? Math.round(generationRows[0].avgMs) : null,
    generationSampleSize: generationRows[0]?.jobs || 0,
    avgQueueWaitMs: queueWaitMs == null ? null : Math.round(queueWaitMs),
    stages,
    // Jobs from before stage tracking exist but have no per-stage timing; they are left out, not guessed.
    jobsWithStageData: counts.with || 0,
    jobsWithoutStageData: counts.without || 0,
  };
}

function shapeFailures({ eventRows, topErrorRows, jobErrorRows, retryRows, totalJobs }) {
  const per = {};
  for (const row of eventRows) {
    const { stage, status } = row._id || {};
    if (!stage) continue;
    per[stage] = per[stage] || { started: 0, completed: 0, failed: 0, retries: 0, cancelled: 0 };
    if (status === 'running') {
      per[stage].started += row.count;
      per[stage].retries += row.retries; // a start with attempt > 1
    } else if (status === 'completed') per[stage].completed += row.count;
    else if (status === 'failed') per[stage].failed += row.count;
    else if (status === 'cancelled') per[stage].cancelled += row.count;
  }

  const byStage = STAGE_ORDER.map((key) => {
    const s = per[key] || { started: 0, completed: 0, failed: 0, retries: 0, cancelled: 0 };
    return {
      stage: key,
      label: STAGE_LABELS[key],
      attempts: s.started,
      failures: s.failed,
      retries: s.retries,
      // Of the attempts that ran to a result.
      failureRate: rate(s.failed, s.completed + s.failed),
    };
  });

  const retriedJobs = retryRows[0]?.jobs || 0;
  const totalRetries = retryRows[0]?.retries || 0;
  return {
    byStage,
    totalFailures: byStage.reduce((n, s) => n + s.failures, 0),
    topErrors: topErrorRows.map((r) => ({
      code: r._id.code || 'UNKNOWN',
      stage: r._id.stage || null,
      count: r.count,
      message: r.message || null,
      retryable: r.retryable ?? null,
      lastAt: r.lastAt || null,
    })),
    // Failed jobs by code - covers jobs that predate the stage event stream too.
    failedJobsByCode: jobErrorRows.map((r) => ({ code: String(r._id), count: r.count })),
    retries: {
      totalRetries,
      retriedJobs,
      avgRetriesPerRetriedJob: retriedJobs > 0 ? round1(totalRetries / retriedJobs) : null,
      avgRetriesPerJob: totalJobs > 0 ? Math.round((totalRetries / totalJobs) * 100) / 100 : null,
      retryRate: rate(retriedJobs, totalJobs),
    },
  };
}

function shapeQueue(counts = {}, workerCount, concurrency) {
  const n = (k) => counts[k] || 0;
  return {
    concurrency,
    workersOnline: workerCount,
    waiting: n('waiting'),
    delayed: n('delayed'),
    // Work that has been asked for and not yet started.
    depth: n('waiting') + n('delayed'),
    active: n('active'),
    completed: n('completed'),
    failed: n('failed'),
  };
}

// ---- Service ------------------------------------------------------------------------------

const defaultQueues = () => ({
  video: require('../../queues/videoQueue'),
  course: require('../../queues/courseQueue'),
});

async function queueSnapshot(queue, concurrency) {
  const [counts, workers] = await Promise.all([
    queue.getJobCounts('waiting', 'delayed', 'active', 'completed', 'failed').catch(() => null),
    queue.getWorkers().catch(() => null),
  ]);
  // Redis unreachable: say so instead of reporting an empty, healthy-looking queue.
  if (counts === null) return { available: false };
  return { available: true, ...shapeQueue(counts, Array.isArray(workers) ? workers.length : null, concurrency) };
}

/**
 * @param {object} [opts]
 * @param {number} [opts.days=30]
 * @param {() => {video:object, course:object}} [opts.queues]  injectable for tests
 */
async function getControlCenter({ days = 30, queues = defaultQueues } = {}) {
  const until = new Date();
  const since = new Date(until.getTime() - (days - 1) * DAY_MS);
  since.setUTCHours(0, 0, 0, 0);

  const activeStatuses = [JOB_STATUS.SCRIPT_GENERATION, JOB_STATUS.GENERATING_AUDIO, JOB_STATUS.GENERATING_IMAGES, JOB_STATUS.PREPARING_ASSETS, JOB_STATUS.RENDERING, JOB_STATUS.UPLOADING];

  const [
    statusRows, allTime, stageRows, stageDataRows, generationRows, queueWaitMs,
    eventRows, topErrorRows, jobErrorRows, retryRows, cache, legacyHitRate,
  ] = await Promise.all([
    VideoJob.aggregate(videoStatusPipeline(since)),
    VideoJob.estimatedDocumentCount(),
    VideoJob.aggregate(stageTimingPipeline(since)),
    VideoJob.aggregate(jobsWithStageDataPipeline(since)),
    VideoJob.aggregate(generationTimePipeline(since, activeStatuses)),
    MetricsService.getAverage('queue.wait'),
    JobEvent.aggregate(stageEventPipeline(since)),
    JobEvent.aggregate(topErrorPipeline(since)),
    VideoJob.aggregate(failedJobErrorPipeline(since)),
    VideoJob.aggregate(retryPipeline(since)),
    CacheLedger.stats({ days }),
    MetricsService.getRate('cache.hits', 'cache.misses'),
  ]);

  const videos = shapeVideos(statusRows, allTime);

  let workers;
  try {
    const q = queues();
    const [video, course] = await Promise.all([
      queueSnapshot(q.video, config.videoWorker.concurrency),
      queueSnapshot(q.course, 1),
    ]);
    workers = { video, course };
  } catch {
    workers = { video: { available: false }, course: { available: false } };
  }

  return {
    range: { days, since: since.toISOString(), until: until.toISOString() },
    videos,
    pipeline: shapePipeline({ stageRows, generationRows, stageDataRows, queueWaitMs }),
    cache: { ...cache, legacyTtsHitRate: legacyHitRate },
    failures: shapeFailures({ eventRows, topErrorRows, jobErrorRows, retryRows, totalJobs: videos.total }),
    workers,
  };
}

module.exports = {
  getControlCenter,
  pipelines: {
    videoStatusPipeline, stageTimingPipeline, jobsWithStageDataPipeline, generationTimePipeline,
    stageEventPipeline, topErrorPipeline, failedJobErrorPipeline, retryPipeline,
  },
  shape: { shapeVideos, shapePipeline, shapeFailures, shapeQueue },
  STAGE_LABELS,
};
