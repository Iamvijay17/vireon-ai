const CourseVideo = require('../../../models/CourseVideo');
const CourseService = require('../CourseService');
const LoggerService = require('../../common/LoggerService');
const SocketService = require('../../common/SocketService');
const LLMService = require('../../common/LLMService');
const { VIDEO_STATUS, SOCKET_EVENTS } = require('../../../constants');
const { ValidationError } = require('../../../utils/errors');

/**
 * Create a new video in a course.
 */
async function create(courseId, data) {
  // Get the next order number
  const lastVideo = await CourseVideo.findOne({ courseId })
    .sort({ order: -1 })
    .select('order');

  const order = (lastVideo?.order ?? -1) + 1;

  const video = await CourseVideo.create({
    courseId,
    title: data.title,
    topic: data.topic || data.title,
    order,
    duration: data.duration || 5,
    voice: data.voice || 'female-1',
    style: data.style || 'educational',
    resolution: data.resolution || '1920x1080',
    quality: data.quality || 'standard',
    additionalInstructions: data.additionalInstructions || '',
    fastAudio: data.fastAudio ?? false,
    status: VIDEO_STATUS.DRAFT,
  });

  // Update course status
  await CourseService.recalculateStatus(courseId);

  LoggerService.info('Course video created', {
    videoId: video._id,
    courseId,
    title: video.title,
    order,
  });

  return video;
}

/**
 * Generate a full Udemy-style curriculum via the LLM and return it for
 * review - no CourseVideo records are created yet. The caller (frontend)
 * shows this as an editable preview; the user can modify titles/topics,
 * remove lessons, or add their own before approving creation via
 * createFromLessons(). Purely a read: no DB writes, no socket emit.
 * Returns { subtitle, promo, lessons } - `promo` is the course-level
 * trailer pitch (title/topic/description), separate from `lessons`.
 */
async function previewCurriculum(title, topic) {
  return LLMService.generateCurriculum(title, topic);
}

/**
 * Create one CourseVideo (status Draft, all stages Pending) per lesson
 * from an approved/edited lesson list (the output of previewCurriculum,
 * possibly modified by the user). Does NOT trigger script/audio/render
 * generation - that's a separate, explicit action per the "AI only
 * builds structure, generation is manual/bulk" requirement. Always
 * appends after existing lessons, never replaces them.
 */
async function createFromLessons(courseId, lessons, options) {
  const { voice, style, duration, additionalInstructions, fastAudio, resolution, quality } = options;

  if (!Array.isArray(lessons) || lessons.length === 0) {
    throw new ValidationError('lessons must be a non-empty array');
  }

  const lastVideo = await CourseVideo.findOne({ courseId }).sort({ order: -1 }).select('order');
  let order = (lastVideo?.order ?? -1) + 1;

  const videos = [];
  for (const lesson of lessons) {
    const video = await CourseVideo.create({
      courseId,
      title: lesson.title || `Lesson ${order + 1}`,
      topic: lesson.topic || lesson.description || lesson.title || '',
      order: order++,
      duration: duration || 5,
      voice: voice || 'female-1',
      style: style || 'educational',
      resolution: resolution || '1920x1080',
      quality: quality || 'standard',
      additionalInstructions: additionalInstructions || '',
      fastAudio: fastAudio ?? false,
      status: VIDEO_STATUS.DRAFT,
    });
    videos.push(video);
  }

  await CourseService.recalculateStatus(courseId);

  LoggerService.info('Course curriculum videos created', {
    courseId,
    lessons: videos.length,
  });

  // Reuses the existing COURSE_VIDEO_CREATED event - CourseDetail.jsx
  // already listens for it and refetches the video list on receipt.
  SocketService.emitToCourse(courseId, SOCKET_EVENTS.COURSE_VIDEO_CREATED, {
    bulk: true,
    count: videos.length,
  });

  return videos;
}

/**
 * Create (or replace) the course's single promotional trailer video, from
 * the { title, topic, description } pitch generated alongside the
 * curriculum (see LLMService.generateCurriculum). This is
 * course-level, not a lesson: exactly one per course, given order -1 so
 * it always sorts before every numbered lesson without shifting their
 * order values, and flagged isPromo so buildDirectorBrief uses the
 * promotional prompt instead of the standard lesson one. Calling this
 * again (e.g. curriculum regenerated) replaces the existing promo video's
 * title/topic rather than creating a duplicate.
 */
async function createPromoVideo(courseId, promo, options = {}) {
  const { voice, style, duration, additionalInstructions, fastAudio, resolution, quality } = options;

  if (!promo || !promo.topic) {
    throw new ValidationError('promo.topic is required');
  }

  const existing = await CourseVideo.findOne({ courseId, isPromo: true });

  if (existing) {
    existing.title = promo.title || existing.title;
    existing.topic = promo.topic;
    await existing.save();

    LoggerService.info('Course promo video updated', { courseId, videoId: existing._id });
    SocketService.emitToCourse(courseId, SOCKET_EVENTS.COURSE_VIDEO_CREATED, { bulk: false, count: 1 });

    return existing;
  }

  const video = await CourseVideo.create({
    courseId,
    title: promo.title || 'Course Trailer',
    topic: promo.topic,
    isPromo: true,
    order: -1,
    duration: duration || 5,
    voice: voice || 'female-1',
    style: style || 'educational',
    resolution: resolution || '1920x1080',
    quality: quality || 'standard',
    additionalInstructions: additionalInstructions || '',
    fastAudio: fastAudio ?? false,
    status: VIDEO_STATUS.DRAFT,
  });

  await CourseService.recalculateStatus(courseId);

  LoggerService.info('Course promo video created', { courseId, videoId: video._id });
  SocketService.emitToCourse(courseId, SOCKET_EVENTS.COURSE_VIDEO_CREATED, { bulk: false, count: 1 });

  return video;
}

module.exports = { create, previewCurriculum, createFromLessons, createPromoVideo };
