const CourseVideo = require('../../../models/CourseVideo');
const CourseService = require('../CourseService');
const LoggerService = require('../../common/LoggerService');
const SocketService = require('../../common/SocketService');
const { getStorageProvider } = require('../../storage/providers');
const { SOCKET_EVENTS } = require('../../../constants');
const { NotFoundError, ValidationError } = require('../../../utils/errors');

// Creating videos lives in create.js; claiming, stopping and bulk-queueing
// generation stages in stageControl.js. This file is reads, edits and deletes.

/**
 * Get all videos for a course.
 */
async function getByCourse(courseId, page = 1, limit = 50) {
  const skip = (page - 1) * limit;

  const [videos, total] = await Promise.all([
    CourseVideo.find({ courseId })
      .sort({ order: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CourseVideo.countDocuments({ courseId }),
  ]);

  return {
    videos,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get every video for a course, unpaginated - used by the course-level
 * "download all" endpoint, which needs the full set rather than one page.
 */
async function getAllByCourse(courseId) {
  return CourseVideo.find({ courseId }).sort({ order: 1 }).lean();
}

/**
 * Get a single video by ID.
 */
async function getById(videoId) {
  const video = await CourseVideo.findById(videoId);
  if (!video) {
    throw new NotFoundError('Video not found');
  }
  return video;
}

// Fields the client is allowed to edit via update(). Everything else
// (status, approved, courseId, script, error, retryCount, ...) is
// pipeline-managed state and must not be settable through this endpoint.
const UPDATABLE_FIELDS = ['title', 'topic', 'duration', 'voice', 'style', 'resolution', 'quality', 'additionalInstructions', 'fastAudio'];

/**
 * Update a video.
 */
async function update(videoId, data) {
  const existing = await CourseVideo.findById(videoId).select('_id').lean();
  if (!existing) {
    throw new NotFoundError('Video not found');
  }

  const updateData = {};
  for (const field of UPDATABLE_FIELDS) {
    if (data[field] !== undefined) updateData[field] = data[field];
  }

  const video = await CourseVideo.findByIdAndUpdate(
    videoId,
    { $set: updateData },
    { new: true, runValidators: true }
  );
  if (!video) {
    throw new NotFoundError('Video not found');
  }

  LoggerService.info('Course video updated', {
    videoId,
    title: video.title,
  });

  return video;
}

/**
 * Delete a video.
 */
async function deleteVideo(videoId) {
  const video = await CourseVideo.findByIdAndDelete(videoId);
  if (!video) {
    throw new NotFoundError('Video not found');
  }

  await getStorageProvider().deleteJob(videoId).catch(() => {});

  // Update course status
  await CourseService.recalculateStatus(video.courseId);

  LoggerService.info('Course video deleted', {
    videoId,
    courseId: video.courseId,
  });

  return { message: 'Video deleted successfully' };
}

/**
 * Delete multiple videos at once. Used by the course detail page's bulk
 * action bar - a single video is just a 1-element videoIds array.
 * Recalculates the course status once and emits a single bulk delete
 * socket event rather than one event per video (which would trigger a
 * refetch for every row).
 */
async function bulkDelete(videoIds) {
  if (!Array.isArray(videoIds) || videoIds.length === 0) {
    throw new ValidationError('videoIds must be a non-empty array');
  }

  const videos = await CourseVideo.find({ _id: { $in: videoIds } });
  if (videos.length === 0) {
    throw new NotFoundError('No videos found to delete');
  }

  const deletedIds = videos.map((v) => v._id.toString());
  await CourseVideo.deleteMany({ _id: { $in: deletedIds } });

  const storage = getStorageProvider();
  await Promise.all(deletedIds.map((id) => storage.deleteJob(id).catch(() => {})));

  // Recalculate status once per affected course (all rows in a bulk
  // delete from the course detail page will share one course, but handle
  // multiple defensively anyway).
  const courseIds = [...new Set(videos.map((v) => v.courseId.toString()))];
  for (const courseId of courseIds) {
    await CourseService.recalculateStatus(courseId);
  }

  // Single bulk event so the frontend refetches once, not once per row.
  SocketService.emitToCourse(courseIds[0], SOCKET_EVENTS.COURSE_VIDEO_DELETED, {
    bulk: true,
    count: deletedIds.length,
  });

  LoggerService.info('Bulk course videos deleted', {
    requested: videoIds.length,
    deleted: deletedIds.length,
    courseId: courseIds[0],
  });

  return { deleted: deletedIds.length, videoIds: deletedIds };
}

module.exports = {
  getByCourse,
  getAllByCourse,
  getById,
  update,
  delete: deleteVideo,
  bulkDelete,
};
