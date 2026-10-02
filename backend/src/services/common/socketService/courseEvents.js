const { SOCKET_EVENTS, VIDEO_STATUS } = require('../../../constants');
const { state } = require('./state');
const { publishToCourse } = require('./redisBridge');

/**
 * Emit event to a specific course room.
 * In the main process, emits via Socket.IO directly.
 * In the worker process, publishes via Redis pub/sub.
 */
function emitToCourse(courseId, event, data) {
  // Add videoId/courseId to data for forwarding
  const eventData = {
    ...data,
    courseId,
  };

  if (state.io) {
    state.io.to(`course:${courseId}`).emit(event, eventData);
  } else {
    // We're in the worker process - publish via Redis
    publishToCourse(courseId, event, eventData);
  }
}

/**
 * Emit course video progress update.
 * In the main process, emits via Socket.IO directly.
 * In the worker process, publishes via Redis pub/sub.
 */
function emitCourseVideoProgress(video, status, progress, message) {
  const data = {
    videoId: video._id,
    status,
    progress,
    currentStep: status,
    message,
  };

  if (state.io) {
    state.io.to(`course:${video.courseId.toString()}`).emit(SOCKET_EVENTS.COURSE_VIDEO_PROGRESS, data);
  } else {
    publishToCourse(video.courseId.toString(), 'courseVideoProgress', data);
  }
}

/**
 * Emit course video script ready event.
 * In the main process, emits via Socket.IO directly.
 * In the worker process, publishes via Redis pub/sub.
 */
function emitCourseVideoScriptReady(video, message) {
  const data = {
    videoId: video._id,
    status: video.status,
    script: video.script,
    message,
  };

  if (state.io) {
    state.io.to(`course:${video.courseId.toString()}`).emit(SOCKET_EVENTS.COURSE_VIDEO_SCRIPT_READY, data);
  } else {
    publishToCourse(video.courseId.toString(), 'courseVideoScriptReady', data);
  }
}

/**
 * Emit course video audio ready event.
 * In the main process, emits via Socket.IO directly.
 * In the worker process, publishes via Redis pub/sub.
 */
function emitCourseVideoAudioReady(video, message) {
  const data = {
    videoId: video._id,
    status: video.status,
    audioUrl: video.audioUrl,
    audioDuration: video.audioDuration,
    message,
  };

  if (state.io) {
    state.io.to(`course:${video.courseId.toString()}`).emit(SOCKET_EVENTS.COURSE_VIDEO_AUDIO_READY, data);
  } else {
    publishToCourse(video.courseId.toString(), 'courseVideoAudioReady', data);
  }
}

/**
 * Emit a single course video scene's audio-ready event, as soon as that
 * scene finishes (rather than waiting for the whole batch to complete),
 * so the course video detail page can show each scene's player as it
 * becomes available instead of only after every scene is done.
 * In the main process, emits via Socket.IO directly.
 * In the worker process, publishes via Redis pub/sub.
 */
function emitCourseVideoSceneAudioReady(video, sceneNumber, audioData) {
  const data = {
    videoId: video._id,
    sceneNumber,
    audio: {
      file: audioData.file,
      duration: audioData.duration,
    },
  };

  if (state.io) {
    state.io.to(`course:${video.courseId.toString()}`).emit(SOCKET_EVENTS.COURSE_VIDEO_SCENE_AUDIO_READY, data);
  } else {
    publishToCourse(video.courseId.toString(), 'courseVideoSceneAudioReady', data);
  }
}

/**
 * Emit course video render ready event.
 * In the main process, emits via Socket.IO directly.
 * In the worker process, publishes via Redis pub/sub.
 */
function emitCourseVideoRenderReady(video, message) {
  const data = {
    videoId: video._id,
    status: video.status,
    renderUrl: video.renderUrl,
    message,
  };

  if (state.io) {
    state.io.to(`course:${video.courseId.toString()}`).emit(SOCKET_EVENTS.COURSE_VIDEO_RENDER_READY, data);
  } else {
    publishToCourse(video.courseId.toString(), 'courseVideoRenderReady', data);
  }
}

/**
 * Emit a generic "this video's record changed" event, used after the
 * automatic cloud upload swaps local paths for GitHub URLs so the
 * frontend knows to refetch the video (script/audioUrl/renderUrl all
 * potentially changed at once).
 * In the main process, emits via Socket.IO directly.
 * In the worker process, publishes via Redis pub/sub.
 */
function emitCourseVideoUpdated(video, message) {
  const data = {
    videoId: video._id,
    status: video.status,
    message,
  };

  if (state.io) {
    state.io.to(`course:${video.courseId.toString()}`).emit(SOCKET_EVENTS.COURSE_VIDEO_UPDATED, data);
  } else {
    publishToCourse(video.courseId.toString(), 'courseVideoUpdated', data);
  }
}

/**
 * Emit course video failed event.
 * In the main process, emits via Socket.IO directly.
 * In the worker process, publishes via Redis pub/sub.
 */
function emitCourseVideoFailed(video, error, step) {
  const data = {
    videoId: video._id,
    status: VIDEO_STATUS.FAILED,
    error: error || video.error?.message,
    step,
  };

  if (state.io) {
    state.io.to(`course:${video.courseId.toString()}`).emit(SOCKET_EVENTS.JOB_FAILED, data);
  } else {
    publishToCourse(video.courseId.toString(), 'jobFailed', data);
  }
}

module.exports = {
  emitToCourse,
  emitCourseVideoProgress,
  emitCourseVideoScriptReady,
  emitCourseVideoAudioReady,
  emitCourseVideoSceneAudioReady,
  emitCourseVideoRenderReady,
  emitCourseVideoUpdated,
  emitCourseVideoFailed,
};
