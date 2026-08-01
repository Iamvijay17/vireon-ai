const VideoJob = require('../models/VideoJob');
const Course = require('../models/Course');
const CourseVideo = require('../models/CourseVideo');
const { JOB_STATUS, STAGE_STATUS } = require('../constants');

const DAY_MS = 24 * 60 * 60 * 1000;

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
      avgRenderRows,
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
    ] = await Promise.all([
      VideoJob.countDocuments(),
      VideoJob.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      VideoJob.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]),
      VideoJob.aggregate([{ $group: { _id: '$resolution', count: { $sum: 1 } } }]),
      VideoJob.aggregate([
        { $match: { status: JOB_STATUS.COMPLETED } },
        { $project: { durationMs: { $subtract: ['$updatedAt', '$createdAt'] } } },
        { $group: { _id: null, avgMs: { $avg: '$durationMs' } } },
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
    ]);

    const jobStatusCounts = countsByKey(jobStatusRows);
    const completedJobs = jobStatusCounts[JOB_STATUS.COMPLETED] || 0;
    const failedJobs = jobStatusCounts[JOB_STATUS.FAILED] || 0;
    const activeJobs = totalVideoJobs - completedJobs - failedJobs;
    const resolvedJobs = completedJobs + failedJobs;

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
        totalVideoJobs,
        completedVideoJobs: completedJobs,
        failedVideoJobs: failedJobs,
        activeVideoJobs: activeJobs,
        jobSuccessRate: resolvedJobs ? Math.round((completedJobs / resolvedJobs) * 1000) / 10 : null,
        avgRenderTimeMs: avgRenderRows[0]?.avgMs ?? null,
        totalCourses,
        totalCourseVideos,
        completedCourseVideos,
        courseCompletionRate: totalCourseVideos ? Math.round((completedCourseVideos / totalCourseVideos) * 1000) / 10 : null,
        inProgressCourses: courseStatusCounts['In Progress'] || 0,
        completedCourses: courseStatusCounts['Completed'] || 0,
      },
      trend,
      jobsByStatus: toChartRows(jobStatusRows),
      jobsByType: toChartRows(jobTypeRows),
      jobsByResolution: toChartRows(jobResolutionRows),
      coursesByStatus: toChartRows(courseStatusRows),
      coursesByCategory: toChartRows(courseCategoryRows),
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
}

module.exports = AnalyticsService;
