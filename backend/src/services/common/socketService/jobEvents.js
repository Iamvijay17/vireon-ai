const { SOCKET_EVENTS } = require('../../../constants');
const { state } = require('./state');
const { emitToJob } = require('./coreEmit');
const { publish } = require('./redisBridge');

/**
 * Emit job created event.
 */
function emitJobCreated(job) {
  if (state.io) {
    state.io.emit(SOCKET_EVENTS.JOB_CREATED, {
      jobId: job._id,
      status: job.status,
      progress: job.progress,
      topic: job.topic,
    });
  }
}

/**
 * Emit job progress update.
 * In the main process, emits via Socket.IO directly.
 * In the worker process, publishes via Redis pub/sub.
 */
function emitJobProgress(job) {
  const data = {
    jobId: job._id,
    progress: job.progress,
    status: job.status,
    currentStep: job.currentStep,
    currentScene: job.currentScene,
  };

  if (state.io) {
    emitToJob(job._id, SOCKET_EVENTS.JOB_PROGRESS, data);
  } else {
    // We're in the worker process - publish via Redis
    publish(job._id, 'jobProgress', data);
  }
}

/**
 * Emit a single scene's audio-ready event, as soon as that scene finishes
 * (rather than waiting for the whole batch of scenes to complete).
 * In the main process, emits via Socket.IO directly.
 * In the worker process, publishes via Redis pub/sub.
 */
function emitSceneAudioReady(jobId, sceneNumber, audioData) {
  const data = {
    jobId,
    sceneNumber,
    audio: {
      file: audioData.file,
      duration: audioData.duration,
    },
  };

  if (state.io) {
    emitToJob(jobId, SOCKET_EVENTS.SCENE_AUDIO_READY, data);
  } else {
    publish(jobId, 'sceneAudioReady', data);
  }
}

/**
 * Emit job completed event.
 */
function emitJobCompleted(job) {
  const data = {
    jobId: job._id,
    progress: 100,
    status: job.status,
    videoUrl: job.videoUrl,
    thumbnailUrl: job.thumbnailUrl,
  };

  if (state.io) {
    emitToJob(job._id, SOCKET_EVENTS.JOB_COMPLETED, data);
  } else {
    publish(job._id, 'jobCompleted', data);
  }
}

/**
 * Emit job failed event.
 */
function emitJobFailed(job, error) {
  const data = {
    jobId: job._id,
    status: job.status,
    error: error || job.error?.message,
  };

  if (state.io) {
    emitToJob(job._id, SOCKET_EVENTS.JOB_FAILED, data);
  } else {
    publish(job._id, 'jobFailed', data);
  }
}

module.exports = {
  emitJobCreated,
  emitJobProgress,
  emitSceneAudioReady,
  emitJobCompleted,
  emitJobFailed,
};
