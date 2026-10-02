const VideoJob = require('../../models/VideoJob');
const Course = require('../../models/Course');
const AudioGeneration = require('../../models/AudioGeneration');
const VideoService = require('../video/VideoService');
const CourseService = require('../course/CourseService');
const { JOB_STATUS, COURSE_STATUS } = require('../../constants');

// AudioGeneration has no queue/cancel/retry concept - generation is
// synchronous (see audioController.js), so it only ever supports view/delete.
const TERMINAL_VIDEO_STATUSES = [JOB_STATUS.COMPLETED, JOB_STATUS.FAILED, JOB_STATUS.CANCELLED];
const TERMINAL_COURSE_STATUSES = [COURSE_STATUS.COMPLETED, COURSE_STATUS.ARCHIVED];

// Cap on how many docs of each type are pulled into the in-memory merge for
// a cross-type ("all") listing. This app is single-user/local scale, so an
// in-memory merge+sort is simpler and safer than a cross-schema
// $unionWith aggregation - this cap just keeps a single "all" request bounded.
const MERGE_FETCH_CAP = 200;

function normalizeVideo(job) {
  return {
    id: job._id,
    type: 'video',
    title: job.topic,
    status: job.status,
    progress: job.progress || 0,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    error: job.error?.message || null,
    meta: { videoType: job.type, resolution: job.resolution },
    capabilities: {
      canCancel: !TERMINAL_VIDEO_STATUSES.includes(job.status),
      canRetry: job.status === JOB_STATUS.FAILED || job.status === JOB_STATUS.CANCELLED,
      canDelete: true,
    },
  };
}

function normalizeCourse(course) {
  const progress = course.videoCount > 0
    ? Math.round((course.completedVideoCount / course.videoCount) * 100)
    : 0;
  return {
    id: course._id,
    type: 'course',
    title: course.title,
    status: course.status,
    progress,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
    error: null,
    meta: { videoCount: course.videoCount, completedVideoCount: course.completedVideoCount },
    capabilities: {
      // Retry stays per-lesson (POST /api/course-videos/:id/retry) - there's
      // no course-level "retry everything" concept today.
      canCancel: !TERMINAL_COURSE_STATUSES.includes(course.status),
      canRetry: false,
      canDelete: true,
    },
  };
}

function normalizeAudio(record) {
  const title = record.text?.length > 60 ? `${record.text.slice(0, 60)}...` : record.text;
  return {
    id: record._id,
    type: 'audio',
    title: title || `${record.mode === 'dialogue' ? 'Dialogue' : 'Audio'} generation`,
    status: record.status,
    progress: record.status === 'COMPLETED' ? 100 : record.status === 'FAILED' ? 0 : 50,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    error: record.error || null,
    meta: { mode: record.mode, duration: record.duration },
    capabilities: {
      canCancel: false,
      canRetry: false,
      canDelete: true,
    },
  };
}

function buildVideoQuery(filters) {
  const query = {};
  if (filters.status) query.status = filters.status;
  if (filters.search) query.topic = { $regex: filters.search, $options: 'i' };
  return query;
}

function buildCourseQuery(filters) {
  const query = {};
  if (filters.status) query.status = filters.status;
  if (filters.search) query.title = { $regex: filters.search, $options: 'i' };
  return query;
}

function buildAudioQuery(filters) {
  const query = {};
  if (filters.status) query.status = filters.status;
  if (filters.search) query.text = { $regex: filters.search, $options: 'i' };
  return query;
}

/**
 * List jobs across one or all of the three job types (video/course/audio),
 * normalized into one shape. A single `type` filter delegates straight to
 * that type's own DB-level pagination (same as its dedicated list endpoint);
 * `type=all` (default) fetches a bounded page from each type, merges, sorts
 * by updatedAt, then paginates in memory - see MERGE_FETCH_CAP above.
 */
async function listJobs({ type, status, search, page = 1, limit = 20 } = {}) {
  const filters = { status, search };

  if (type === 'video') {
    const result = await VideoService.getAllJobs(page, limit, filters);
    return {
      jobs: result.jobs.map(normalizeVideo),
      pagination: result.pagination,
    };
  }

  if (type === 'course') {
    const result = await CourseService.getAll(page, limit, filters);
    return {
      jobs: result.courses.map(normalizeCourse),
      pagination: result.pagination,
    };
  }

  if (type === 'audio') {
    const skip = (page - 1) * limit;
    const query = buildAudioQuery(filters);
    const [items, total] = await Promise.all([
      AudioGeneration.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AudioGeneration.countDocuments(query),
    ]);
    return {
      jobs: items.map(normalizeAudio),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  // type === 'all' (or unset): merge all three types in memory.
  const [videos, courses, audios] = await Promise.all([
    VideoJob.find(buildVideoQuery(filters)).sort({ updatedAt: -1 }).limit(MERGE_FETCH_CAP).lean(),
    Course.find(buildCourseQuery(filters)).sort({ updatedAt: -1 }).limit(MERGE_FETCH_CAP).lean(),
    AudioGeneration.find(buildAudioQuery(filters)).sort({ updatedAt: -1 }).limit(MERGE_FETCH_CAP).lean(),
  ]);

  const merged = [
    ...videos.map(normalizeVideo),
    ...courses.map(normalizeCourse),
    ...audios.map(normalizeAudio),
  ].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  const total = merged.length;
  const start = (page - 1) * limit;
  const jobs = merged.slice(start, start + limit);

  return {
    jobs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

module.exports = {
  listJobs,
  normalizeVideo,
  normalizeCourse,
  normalizeAudio,
};
