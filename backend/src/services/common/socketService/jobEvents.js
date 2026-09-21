const { SOCKET_EVENTS } = require('../../../constants');
const { state } = require('./state');
const { emitToJob } = require('./coreEmit');
const { publish } = require('./redisBridge');
const JobEventService = require('../JobEventService');

/**
 * Persist an event to the job's timeline, then emit it carrying the `seq`
 * it was stored under.
 *
 * Recording here rather than at each call site means one hook covers the
 * whole v1 pipeline in both processes - the API emits directly via
 * Socket.IO, the worker publishes over Redis, but both come through these
 * functions. The emit waits on the append (a single indexed upsert) so the
 * live payload carries the same seq the stored event has; that seq is what
 * lets a reconnecting client ask for exactly what it missed.
 *
 * JobEventService.append never throws and returns null if it failed, so the
 * emit always happens - a lost event record must not cost a live update.
 */
function record(jobId, type, data, dispatch) {
  JobEventService.append(jobId, type, data).then((event) => {
    dispatch(event ? { ...data, seq: event.seq } : data);
  });
}

/**
 * Emit job created event.
 */
function emitJobCreated(job) {
  const data = {
    jobId: job._id,
    status: job.status,
    progress: job.progress,
    topic: job.topic,
  };

  record(job._id, 'jobCreated', data, (payload) => {
    if (state.io) {
      state.io.emit(SOCKET_EVENTS.JOB_CREATED, payload);
    }
  });
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

  record(job._id, 'jobProgress', data, (payload) => {
    if (state.io) {
      emitToJob(job._id, SOCKET_EVENTS.JOB_PROGRESS, payload);
    } else {
      // We're in the worker process - publish via Redis
      publish(job._id, 'jobProgress', payload);
    }
  });
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
      // Surfaces whether this scene's TTS was served from CacheService
      // (see audioService/sceneSynthesis.js) instead of freshly generated -
      // lets the job timeline distinguish cache hits from real work.
      fromCache: audioData.fromCache || false,
    },
  };

  record(jobId, 'sceneAudioReady', data, (payload) => {
    if (state.io) {
      emitToJob(jobId, SOCKET_EVENTS.SCENE_AUDIO_READY, payload);
    } else {
      publish(jobId, 'sceneAudioReady', payload);
    }
  });
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

  record(job._id, 'jobCompleted', data, (payload) => {
    if (state.io) {
      emitToJob(job._id, SOCKET_EVENTS.JOB_COMPLETED, payload);
    } else {
      publish(job._id, 'jobCompleted', payload);
    }
  });
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

  record(job._id, 'jobFailed', data, (payload) => {
    if (state.io) {
      emitToJob(job._id, SOCKET_EVENTS.JOB_FAILED, payload);
    } else {
      publish(job._id, 'jobFailed', payload);
    }
  });
}

module.exports = {
  emitJobCreated,
  emitJobProgress,
  emitSceneAudioReady,
  emitJobCompleted,
  emitJobFailed,
};
