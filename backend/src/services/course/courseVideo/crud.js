const CourseVideo = require('../../../models/CourseVideo');
const CourseService = require('../CourseService');
const LoggerService = require('../../common/LoggerService');
const SocketService = require('../../common/SocketService');
const LMStudioService = require('../../common/LMStudioService');
const courseQueue = require('../../../queues/courseQueue');
const { VIDEO_STATUS, STAGE_STATUS, SOCKET_EVENTS } = require('../../../constants');

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
    additionalInstructions: data.additionalInstructions || '',
    fastAudio: data.fastAudio ?? false,
    avatarEnabled: data.avatarEnabled ?? false,
    avatarPosition: data.avatarEnabled ? data.avatarPosition || 'bottom-right' : null,
    status: VIDEO_STATUS.DRAFT,
  });

  // Update course status
  await CourseService.recalculateStatus(courseId);

  LoggerService.info('Course video created', {
    videoId: video._id,
    courseId,
    title: video.title,
    order,
    avatarEnabled: video.avatarEnabled,
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
  return LMStudioService.generateCurriculum(title, topic);
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
  const { voice, style, duration, additionalInstructions, fastAudio, resolution } = options;

  if (!Array.isArray(lessons) || lessons.length === 0) {
    throw { status: 400, message: 'lessons must be a non-empty array' };
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
 * curriculum (see LMStudioService.generateCurriculum). This is
 * course-level, not a lesson: exactly one per course, given order -1 so
 * it always sorts before every numbered lesson without shifting their
 * order values, and flagged isPromo so buildScriptPrompt uses the
 * promotional prompt instead of the standard lesson one. Calling this
 * again (e.g. curriculum regenerated) replaces the existing promo video's
 * title/topic rather than creating a duplicate.
 */
async function createPromoVideo(courseId, promo, options = {}) {
  const { voice, style, duration, additionalInstructions, fastAudio, resolution } = options;

  if (!promo || !promo.topic) {
    throw { status: 400, message: 'promo.topic is required' };
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
    additionalInstructions: additionalInstructions || '',
    fastAudio: fastAudio ?? false,
    status: VIDEO_STATUS.DRAFT,
  });

  await CourseService.recalculateStatus(courseId);

  LoggerService.info('Course promo video created', { courseId, videoId: video._id });
  SocketService.emitToCourse(courseId, SOCKET_EVENTS.COURSE_VIDEO_CREATED, { bulk: false, count: 1 });

  return video;
}

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
    throw { status: 404, message: 'Video not found' };
  }
  return video;
}

// Which stage-status field each single-video generation action gates on.
// 'retry' has no field of its own - it re-runs whichever stage is
// recorded as failed, gated by video.status below instead.
const STAGE_FIELD_FOR_ACTION = {
  'generate-script': 'scriptStatus',
  'regenerate-script': 'scriptStatus',
  'generate-audio': 'audioStatus',
  render: 'videoStatus',
};

/**
 * Guard against double-dispatching the same generation action - e.g. a
 * double-clicked "Generate Script" button, or a retried frontend request,
 * queueing two BullMQ jobs for the same video/stage. With the worker at
 * concurrency:1 those would run back-to-back rather than in parallel, but
 * the second run still wastes an LLM/TTS/render call and can race writes
 * to the video document. Marks the stage Queued immediately (same as
 * prepareBulkJobs does for bulk actions) so a second call sees it's
 * already in flight and is rejected instead of piling on another job.
 */
async function claimStage(videoId, action) {
  const video = await CourseVideo.findById(videoId);
  if (!video) {
    throw { status: 404, message: 'Video not found' };
  }

  if (action === 'retry') {
    if (video.status !== VIDEO_STATUS.FAILED) {
      throw { status: 409, message: `Video is in ${video.status} state, not Failed` };
    }
    return video;
  }

  const field = STAGE_FIELD_FOR_ACTION[action];
  if (field) {
    const current = video[field];
    if (current === STAGE_STATUS.QUEUED || current === STAGE_STATUS.PROCESSING) {
      throw { status: 409, message: `${action} is already ${current} for this video` };
    }
    video[field] = STAGE_STATUS.QUEUED;
    await video.save();
  }

  return video;
}

// Fields the client is allowed to edit via update(). Everything else
// (status, approved, courseId, script, error, retryCount, ...) is
// pipeline-managed state and must not be settable through this endpoint.
const UPDATABLE_FIELDS = ['title', 'topic', 'duration', 'voice', 'style', 'resolution', 'additionalInstructions', 'fastAudio', 'avatarEnabled', 'avatarPosition'];

/**
 * Update a video.
 */
async function update(videoId, data) {
  const existing = await CourseVideo.findById(videoId).select('avatarEnabled voice').lean();
  if (!existing) {
    throw { status: 404, message: 'Video not found' };
  }

  const updateData = {};
  for (const field of UPDATABLE_FIELDS) {
    if (data[field] !== undefined) updateData[field] = data[field];
  }

  const avatarEnabled = updateData.avatarEnabled ?? existing.avatarEnabled;
  if (avatarEnabled && !updateData.avatarPosition) {
    updateData.avatarPosition = updateData.avatarPosition ?? 'bottom-right';
  }
  // Whether the currently-generated avatar clip (if any) is still valid:
  // only when the avatar stays enabled and the voice - which determines
  // which default portrait's gender it was animated from - hasn't
  // changed. Any other transition invalidates it, so the next render
  // regenerates via AvatarService (see renderVideo's avatar step).
  const voice = updateData.voice ?? existing.voice;
  const keepExistingAvatarClip = avatarEnabled && existing.avatarEnabled && voice === existing.voice;
  if (!keepExistingAvatarClip) {
    updateData.avatarVideoUrl = '';
  }

  const video = await CourseVideo.findByIdAndUpdate(
    videoId,
    { $set: updateData },
    { new: true, runValidators: true }
  );
  if (!video) {
    throw { status: 404, message: 'Video not found' };
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
    throw { status: 404, message: 'Video not found' };
  }

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
    throw { status: 400, message: 'videoIds must be a non-empty array' };
  }

  const videos = await CourseVideo.find({ _id: { $in: videoIds } });
  if (videos.length === 0) {
    throw { status: 404, message: 'No videos found to delete' };
  }

  const deletedIds = videos.map((v) => v._id.toString());
  await CourseVideo.deleteMany({ _id: { $in: deletedIds } });

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

/**
 * Stop a running lesson. Marks it CANCELLED immediately and removes any
 * not-yet-started jobs for it from the queue (e.g. the audio/render legs
 * of a 'generate-full' chain that haven't run yet). If a stage is already
 * mid-flight, there's no way to kill the in-progress external call
 * directly - the worker itself checks for CANCELLED at each stage's
 * checkpoints (see bailIfCancelled in shared.js) and bails as soon as it
 * notices, same pattern as VideoService.stop for the standalone VideoJob
 * pipeline.
 */
async function stop(videoId) {
  const video = await CourseVideo.findById(videoId);
  if (!video) {
    throw { status: 404, message: 'Video not found' };
  }

  const terminalStatuses = [VIDEO_STATUS.COMPLETED, VIDEO_STATUS.FAILED, VIDEO_STATUS.CANCELLED];
  if (terminalStatuses.includes(video.status)) {
    throw { status: 400, message: `Video is in ${video.status} state and cannot be stopped - it isn't running.` };
  }

  const previousStatus = video.status;
  video.status = VIDEO_STATUS.CANCELLED;
  video.error = {
    message: 'Stopped by user',
    step: previousStatus,
    retryCount: video.error?.retryCount || 0,
  };
  // Mark whichever stage(s) were in flight as cancelled too, for the
  // per-stage Script/Audio/Video columns in the lesson table.
  const inFlightStages = [STAGE_STATUS.PROCESSING, STAGE_STATUS.QUEUED];
  if (inFlightStages.includes(video.scriptStatus)) video.scriptStatus = STAGE_STATUS.CANCELLED;
  if (inFlightStages.includes(video.audioStatus)) video.audioStatus = STAGE_STATUS.CANCELLED;
  if (inFlightStages.includes(video.videoStatus)) video.videoStatus = STAGE_STATUS.CANCELLED;
  await video.save();

  // Course jobs don't reuse the videoId as the BullMQ jobId (a single
  // video can have multiple jobs queued back-to-back for 'generate-full'),
  // so find not-yet-started jobs by their data.videoId instead of a
  // direct getJob(id) lookup.
  try {
    const waitingJobs = await courseQueue.getJobs(['waiting', 'delayed', 'paused']);
    const toRemove = waitingJobs.filter((j) => j.data?.videoId === videoId);
    await Promise.all(toRemove.map((j) => j.remove()));
    if (toRemove.length > 0) {
      LoggerService.info('Removed not-yet-started course video jobs from queue', { videoId, count: toRemove.length });
    }
  } catch (queueErr) {
    LoggerService.warn('Could not remove queued course video jobs during stop', { videoId, error: queueErr.message });
  }

  SocketService.emitCourseVideoProgress(video, VIDEO_STATUS.CANCELLED, 0, 'Stopped by user');
  LoggerService.info('Course video stopped by user', { videoId, previousStatus });

  return video;
}

/**
 * Mark the relevant stage(s) Queued for a batch of videos and return the
 * ordered list of {videoId, action} jobs the caller should push to the
 * queue. Used for both single-row and multi-row (bulk) generation from
 * the lesson table - a single video is just a 1-element videoIds array.
 *
 * For 'generate-full', all three stages are marked Queued immediately
 * (they genuinely are, right away) and one video's script/audio/render
 * jobs are kept contiguous in the returned list. Combined with the
 * course-video-processing queue running at concurrency:1, this makes
 * audio start only once that same video's script job has fully finished,
 * without needing a dedicated composite worker action.
 */
async function prepareBulkJobs(videoIds, action) {
  const stageActions = action === 'generate-full'
    ? ['generate-script', 'generate-audio', 'render']
    : [action];

  const stageField = {
    'generate-script': 'scriptStatus',
    'generate-audio': 'audioStatus',
    render: 'videoStatus',
  };

  // Videos that don't meet the queued stage's prerequisite (script
  // approved before audio, audio present before render) are skipped
  // rather than queued - the server-side backstop for the same gating the
  // lesson table's buttons apply client-side, so it holds even if a
  // request bypasses the UI. 'generate-script'/'generate-full' have no
  // prerequisite since they start the pipeline from the beginning.
  const jobs = [];
  const skipped = [];
  for (const videoId of videoIds) {
    const video = await CourseVideo.findById(videoId).select('approved audioUrl');
    if (!video) {
      skipped.push({ videoId, reason: 'Video not found' });
      continue;
    }
    if (action === 'generate-audio' && !video.approved) {
      skipped.push({ videoId, reason: 'Script must be approved before generating audio' });
      continue;
    }
    if (action === 'render' && !video.audioUrl) {
      skipped.push({ videoId, reason: 'Audio must be generated before rendering' });
      continue;
    }

    const updateData = {};
    for (const a of stageActions) {
      updateData[stageField[a]] = STAGE_STATUS.QUEUED;
      jobs.push({ videoId, action: a });
    }
    await CourseVideo.findByIdAndUpdate(videoId, { $set: updateData });
  }

  return { jobs, skipped };
}

module.exports = {
  create,
  previewCurriculum,
  createFromLessons,
  createPromoVideo,
  getByCourse,
  getAllByCourse,
  getById,
  claimStage,
  update,
  delete: deleteVideo,
  bulkDelete,
  stop,
  prepareBulkJobs,
};
