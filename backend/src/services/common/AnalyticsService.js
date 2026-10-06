const VideoJob = require('../../models/VideoJob');
const Course = require('../../models/Course');
const CourseVideo = require('../../models/CourseVideo');
const Asset = require('../../models/Asset');
const MetricsService = require('./MetricsService');
const config = require('../../config');
const videoQueue = require('../../queues/videoQueue');
const { JOB_STATUS, STAGE_STATUS } = require('../../constants');

const DAY_MS = 24 * 60 * 60 * 1000;

// Maps a job's raw JOB_STATUS names to the friendly per-video pipeline
// stages shown on the analytics page. A statusHistory entry's durationMs is
// the time spent in `entry.from` before moving to `entry.to`, so each stage
// sums the durationMs of every entry whose `from` falls in its bucket.
const STAGE_BUCKETS = [
  { key: 'planning', label: 'Planning', statuses: [JOB_STATUS.SCRIPT_GENERATION] },
  { key: 'tts', label: 'TTS', statuses: [JOB_STATUS.GENERATING_AUDIO] },
  { key: 'sceneBuild', label: 'Scene Build', statuses: [JOB_STATUS.GENERATING_IMAGES, JOB_STATUS.PREPARING_ASSETS] },
  { key: 'rendering', label: 'Rendering', statuses: [JOB_STATUS.RENDERING] },
  { key: 'upload', label: 'Upload', statuses: [JOB_STATUS.UPLOADING] },
];

// Statuses in which the worker is actually doing something. Time in any
// other status - queued, waiting for approval or a manual render click,
// waiting out a retry backoff - is waiting, not generating.
const ACTIVE_STATUSES = STAGE_BUCKETS.flatMap((b) => b.statuses);

/**
 * Time the worker spent working on a job: the sum of its time in each active
 * status. Wall-clock time (createdAt to updatedAt) is no use as a generation
 * time - it includes days waiting for a person, retry waits, and any later
 * edit that touches updatedAt.
 */
const activeProcessingMs = (statusHistory = []) =>
  statusHistory
    .filter((entry) => entry.from && ACTIVE_STATUSES.includes(entry.from))
    .reduce((sum, entry) => sum + (entry.durationMs || 0), 0);

const buildStageDurations = (statusHistory = []) =>
  STAGE_BUCKETS.map(({ key, label, statuses }) => {
    const durationMs = statusHistory
      .filter((entry) => entry.from && statuses.includes(entry.from))
      .reduce((sum, entry) => sum + (entry.durationMs || 0), 0);
    return { key, label, durationMs };
  });

const toDayKey = (date) => date.toISOString().slice(0, 10);

// Builds an ordered array of { date: 'YYYY-MM-DD', ... } covering every day
// in [since, now], so charts don't have gaps on days with zero activity.
const buildDayBuckets = (since, until) => {
  const days = [];
  for (let t = new Date(since); t <= until; t = new Date(t.getTime() + DAY_MS)) {
    days.push(toDayKey(t));
  }
  return days;
};

const countsByKey = (rows) => rows.reduce((acc, r) => ({ ...acc, [r._id]: r.count }), {});

/**
 * Read-only aggregation of platform metrics from the VideoJob/Course/
 * CourseVideo collections. Nothing here is persisted - every call recomputes
 * from current data, scoped to the requested trailing window (`days`).
 */
class AnalyticsService {
  static async getOverview(days = 30) {
    const until = new Date();
    const since = new Date(until.getTime() - (days - 1) * DAY_MS);
    since.setUTCHours(0, 0, 0, 0);

    const [
      totalVideoJobs,
      jobStatusRows,
      jobTypeRows,
      jobResolutionRows,
      jobVoiceRows,
      jobLayoutRows,
      avgGenerationRows,
      jobTrendRows,
      totalCourses,
      courseStatusRows,
      courseCategoryRows,
      totalCourseVideos,
      scriptStageRows,
      audioStageRows,
      videoStageRows,
      courseVideoTrendRows,
      recentFailedJobs,
      recentFailedCourseVideos,
      storageByCategory,
      avgTtsTimeMs,
      cacheHitRate,
      avgRenderTimeMs,
      avgQueueWaitMs,
      retryRows,
      workerJobCounts,
    ] = await Promise.all([
      VideoJob.countDocuments(),
      VideoJob.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      VideoJob.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]),
      VideoJob.aggregate([{ $group: { _id: '$resolution', count: { $sum: 1 } } }]),
      VideoJob.aggregate([{ $group: { _id: '$voice', count: { $sum: 1 } } }]),
      VideoJob.aggregate([{ $group: { _id: '$aspectRatio', count: { $sum: 1 } } }]),
      // Whole-pipeline working time (script -> upload, see
      // activeProcessingMs), distinct from avgRenderTimeMs below which times
      // only the Remotion render step itself (see MetricsService's
      // 'render.duration', recorded in RemotionService.renderVideo). Jobs with
      // no recorded active time (created before statusHistory existed) are
      // left out rather than averaged in as zero.
      VideoJob.aggregate([
        { $match: { status: JOB_STATUS.COMPLETED } },
        {
          $project: {
            activeMs: {
              $sum: {
                $map: {
                  input: { $filter: { input: { $ifNull: ['$statusHistory', []] }, cond: { $in: ['$$this.from', ACTIVE_STATUSES] } } },
                  in: { $ifNull: ['$$this.durationMs', 0] },
                },
              },
            },
          },
        },
        { $match: { activeMs: { $gt: 0 } } },
        { $group: { _id: null, avgMs: { $avg: '$activeMs' } } },
      ]),
      VideoJob.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, status: '$status' },
            count: { $sum: 1 },
          },
        },
      ]),
      Course.countDocuments(),
      Course.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Course.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
      CourseVideo.countDocuments(),
      CourseVideo.aggregate([{ $group: { _id: '$scriptStatus', count: { $sum: 1 } } }]),
      CourseVideo.aggregate([{ $group: { _id: '$audioStatus', count: { $sum: 1 } } }]),
      CourseVideo.aggregate([{ $group: { _id: '$videoStatus', count: { $sum: 1 } } }]),
      CourseVideo.aggregate([
        { $match: { renderedAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$renderedAt' } }, count: { $sum: 1 } } },
      ]),
      VideoJob.find({ status: JOB_STATUS.FAILED })
        .sort({ updatedAt: -1 })
        .limit(5)
        .select('topic type error updatedAt'),
      CourseVideo.find({
        $or: [{ scriptStatus: STAGE_STATUS.FAILED }, { audioStatus: STAGE_STATUS.FAILED }, { videoStatus: STAGE_STATUS.FAILED }],
      })
        .sort({ updatedAt: -1 })
        .limit(5)
        .select('title courseId scriptError audioError videoError updatedAt')
        .populate('courseId', 'title'),
      Asset.aggregate([{ $group: { _id: '$category', bytes: { $sum: '$size' } } }]),
      MetricsService.getAverage('tts.duration'),
      MetricsService.getRate('cache.hits', 'cache.misses'),
      MetricsService.getAverage('render.duration'),
      MetricsService.getAverage('queue.wait'),
      // Retries per job, read from statusHistory rather than the 'job.retries'
      // counter: the counter only ever grows and has no notion of which job
      // retried, so it can't give a share of jobs.
      VideoJob.aggregate([
        { $match: { 'statusHistory.to': JOB_STATUS.RETRY_SCHEDULED } },
        {
          $project: {
            retries: {
              $size: { $filter: { input: '$statusHistory', cond: { $eq: ['$$this.to', JOB_STATUS.RETRY_SCHEDULED] } } },
            },
          },
        },
        { $group: { _id: null, jobs: { $sum: 1 }, retries: { $sum: '$retries' } } },
      ]),
      videoQueue.getJobCounts('active', 'waiting', 'delayed').catch(() => ({})),
    ]);

    const jobStatusCounts = countsByKey(jobStatusRows);
    const completedJobs = jobStatusCounts[JOB_STATUS.COMPLETED] || 0;
    const failedJobs = jobStatusCounts[JOB_STATUS.FAILED] || 0;
    const activeJobs = totalVideoJobs - completedJobs - failedJobs;
    const resolvedJobs = completedJobs + failedJobs;

    const retriedJobs = retryRows[0]?.jobs || 0;
    const totalRetries = retryRows[0]?.retries || 0;

    const courseStatusCounts = countsByKey(courseStatusRows);
    const courseVideoStatusTotal = (rows) => rows.reduce((sum, r) => sum + r.count, 0);
    const completedCourseVideos = videoStageRows.find((r) => r._id === STAGE_STATUS.COMPLETED)?.count || 0;

    // Day-bucket the trend rows (which come back grouped per day+status /
    // per day) into a dense, gap-free series for the chart.
    const dayKeys = buildDayBuckets(since, until);
    const jobTrendByDay = {};
    for (const row of jobTrendRows) {
      const { day, status } = row._id;
      jobTrendByDay[day] = jobTrendByDay[day] || { created: 0, completed: 0, failed: 0 };
      jobTrendByDay[day].created += row.count;
      if (status === JOB_STATUS.COMPLETED) jobTrendByDay[day].completed += row.count;
      if (status === JOB_STATUS.FAILED) jobTrendByDay[day].failed += row.count;
    }
    const courseVideoTrendByDay = countsByKey(
      courseVideoTrendRows.map((r) => ({ _id: r._id, count: r.count }))
    );

    const trend = dayKeys.map((date) => ({
      date,
      jobsCreated: jobTrendByDay[date]?.created || 0,
      jobsCompleted: jobTrendByDay[date]?.completed || 0,
      jobsFailed: jobTrendByDay[date]?.failed || 0,
      courseVideosRendered: courseVideoTrendByDay[date] || 0,
    }));

    const toChartRows = (rows) => rows.filter((r) => r._id).map((r) => ({ label: r._id, count: r.count }));

    const storageRows = storageByCategory
      .filter((r) => r._id)
      .map((r) => ({ label: r._id, bytes: r.bytes || 0 }));
    const totalStorageBytes = storageRows.reduce((sum, r) => sum + r.bytes, 0);

    const failureEntries = (msg) => (msg && msg.trim() ? msg.trim() : null);

    const recentFailures = [
      ...recentFailedJobs.map((j) => ({
        source: 'videoJob',
        id: j._id,
        title: j.topic,
        subtitle: j.type,
        message: failureEntries(j.error?.message) || 'Job failed',
        occurredAt: j.updatedAt,
      })),
      ...recentFailedCourseVideos.map((v) => ({
        source: 'courseVideo',
        id: v._id,
        title: v.title,
        subtitle: v.courseId?.title || 'Course video',
        message:
          failureEntries(v.videoError?.message) ||
          failureEntries(v.audioError?.message) ||
          failureEntries(v.scriptError?.message) ||
          'Stage failed',
        occurredAt: v.updatedAt,
      })),
    ]
      .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
      .slice(0, 8);

    return {
      range: { days, since: since.toISOString(), until: until.toISOString() },
      summary: {
        totalVideos: totalVideoJobs + totalCourseVideos,
        totalVideoJobs,
        completedVideoJobs: completedJobs,
        failedVideoJobs: failedJobs,
        activeVideoJobs: activeJobs,
        jobSuccessRate: resolvedJobs ? Math.round((completedJobs / resolvedJobs) * 1000) / 10 : null,
        jobFailureRate: resolvedJobs ? Math.round((failedJobs / resolvedJobs) * 1000) / 10 : null,
        avgGenerationTimeMs: avgGenerationRows[0]?.avgMs ?? null,
        avgRenderTimeMs,
        avgTtsTimeMs,
        cacheHitRate,
        avgQueueWaitMs,
        totalStorageBytes,
        totalCourses,
        totalCourseVideos,
        completedCourseVideos,
        courseCompletionRate: totalCourseVideos ? Math.round((completedCourseVideos / totalCourseVideos) * 1000) / 10 : null,
        inProgressCourses: courseStatusCounts['In Progress'] || 0,
        completedCourses: courseStatusCounts['Completed'] || 0,
      },
      worker: {
        concurrency: config.videoWorker.concurrency,
        activeJobs: workerJobCounts.active || 0,
        waitingJobs: workerJobCounts.waiting || 0,
        delayedJobs: workerJobCounts.delayed || 0,
        totalRetries,
        retriedJobs,
        // Share of video jobs that needed at least one automatic retry (0-100).
        retryRate: totalVideoJobs ? Math.round((retriedJobs / totalVideoJobs) * 1000) / 10 : null,
      },
      trend,
      jobsByStatus: toChartRows(jobStatusRows),
      jobsByType: toChartRows(jobTypeRows),
      topTemplates: toChartRows(jobTypeRows),
      topVoices: toChartRows(jobVoiceRows),
      topLayouts: toChartRows(jobLayoutRows),
      jobsByResolution: toChartRows(jobResolutionRows),
      coursesByStatus: toChartRows(courseStatusRows),
      coursesByCategory: toChartRows(courseCategoryRows),
      storageByCategory: storageRows,
      courseVideoStages: {
        script: toChartRows(scriptStageRows),
        audio: toChartRows(audioStageRows),
        video: toChartRows(videoStageRows),
        totals: {
          script: courseVideoStatusTotal(scriptStageRows),
          audio: courseVideoStatusTotal(audioStageRows),
          video: courseVideoStatusTotal(videoStageRows),
        },
      },
      recentFailures,
    };
  }

  /**
   * Paginated per-video pipeline timing breakdown - reads each job's
   * statusHistory (see VideoJob.js) and buckets it into the friendly stages
   * shown on the analytics page (Planning, TTS, Scene Build,
   * Rendering, Upload), plus a total end-to-end duration.
   */
  static async getVideoMetrics({ page = 1, limit = 20, status } = {}) {
    const query = status ? { status } : {};
    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      VideoJob.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('topic type status createdAt updatedAt completedAt statusHistory')
        .lean(),
      VideoJob.countDocuments(query),
    ]);

    const rows = jobs.map((job) => {
      const stages = buildStageDurations(job.statusHistory);
      // Working time, so it adds up with the stage columns - see activeProcessingMs.
      const totalMs = activeProcessingMs(job.statusHistory) || null;
      return {
        id: job._id,
        topic: job.topic,
        type: job.type,
        status: job.status,
        createdAt: job.createdAt,
        totalMs,
        stages,
      };
    });

    return {
      rows,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }
}

module.exports = AnalyticsService;
module.exports.activeProcessingMs = activeProcessingMs;
module.exports.buildStageDurations = buildStageDurations;
