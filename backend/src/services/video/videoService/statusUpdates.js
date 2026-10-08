const VideoJob = require('../../../models/VideoJob');
const { JOB_STATUS, JOB_STEPS } = require('../../../constants');
const { NotFoundError } = require('../../../utils/errors');
const { IMAGE_SCENE_FIELDS } = require('../../image/fields');

/**
 * Update job status with progress.
 */
async function updateStatus(jobId, status, extra = {}) {
  const { error: errorMessage, retryCount, progress, ...rest } = extra;

  const update = {
    $set: {
      status,
      // JOB_STEPS is the single source of truth for a status's canonical
      // progress percentage - callers only need to pass an explicit
      // `progress` for finer-grained (e.g. per-scene) interpolation.
      progress: progress ?? JOB_STEPS[status]?.progress ?? 0,
      currentStep: status,
      ...rest,
    },
  };

  if (errorMessage) {
    update.$set.error = {
      message: errorMessage,
      step: status,
      retryCount: retryCount || 0,
    };
  } else {
    // Every call site here represents a successful stage transition, not
    // a failure - clear any error left over from an earlier failed
    // attempt so the UI doesn't keep showing an error banner next to a
    // job that's now healthy again. `error: undefined` would be silently
    // dropped by Mongoose rather than clearing the field, hence $unset.
    update.$unset = { error: '' };
  }

  const job = await VideoJob.findByIdAndUpdate(jobId, update, { new: true });
  return job;
}

/**
 * Update job with script data.
 */
async function updateScript(jobId, script) {
  return VideoJob.findByIdAndUpdate(
    jobId,
    {
      script,
      status: JOB_STATUS.SCRIPT_COMPLETED,
      progress: 20,
      currentStep: JOB_STATUS.SCRIPT_COMPLETED,
    },
    { new: true }
  );
}

/**
 * Persist the scenes the image step changed. Matches by sceneNumber and copies
 * only IMAGE_SCENE_FIELDS, so it can run per image as they land without
 * clobbering audio the job already wrote.
 */
async function updateSceneImages(jobId, changedScenes) {
  const job = await VideoJob.findById(jobId);
  if (!job) throw new NotFoundError('Job not found');

  for (const changed of changedScenes) {
    const scene = job.script.scenes.find((s) => s.sceneNumber === changed.sceneNumber);
    if (!scene) continue;
    for (const field of IMAGE_SCENE_FIELDS) {
      if (field in changed) scene[field] = changed[field];
    }
  }

  await job.save();
  return job;
}

/**
 * Update scene audio data.
 */
async function updateSceneAudio(jobId, sceneNumber, audioData) {
  const job = await VideoJob.findById(jobId);
  if (!job) throw new NotFoundError('Job not found');

  const scene = job.script.scenes.find((s) => s.sceneNumber === sceneNumber);
  if (scene) {
    scene.audio.file = audioData.file;
    scene.audio.duration = audioData.duration;
    scene.audio.captionTimestamps = audioData.captionTimestamps || null;
    // Only the segmented pipeline supplies these; the legacy path leaves them untouched.
    if (audioData.segments) scene.audio.segments = audioData.segments;
    if (audioData.ttsMeta) scene.audio.ttsMeta = audioData.ttsMeta;
    // Canonical speech timeline: written only by the ENABLE_SPEECH_ALIGNMENT path.
    // A stale timeline for audio that no longer exists must never survive a regeneration.
    scene.audio.speechTimeline = audioData.speechTimeline || undefined;
    // The audio file duration is the actual scene duration
    scene.duration = audioData.duration;
    // `elements` was built at script-validation time, before audio (and
    // its real per-word timing) existed - copy it in now so templates that
    // read elements.captionTimestamps pick up real sync instead of null.
    if (scene.elements) {
      scene.elements.captionTimestamps = audioData.captionTimestamps || null;
      scene.markModified('elements');
    }
  }

  await job.save();
  return job;
}

/**
 * Record per-segment narration state on a scene without touching its audio
 * file or duration - used when a scene's TTS partly failed, so the UI can
 * show which segments need a retry. See services/audio/pipeline.
 */
async function updateSceneSegments(jobId, sceneNumber, segments) {
  const job = await VideoJob.findById(jobId);
  if (!job) throw new NotFoundError('Job not found');

  const scene = job.script.scenes.find((s) => s.sceneNumber === sceneNumber);
  if (scene) {
    scene.audio.segments = segments;
    await job.save();
  }
  return job;
}

/**
 * Complete a job with final URLs.
 */
async function complete(jobId, urls) {
  return VideoJob.findByIdAndUpdate(
    jobId,
    {
      status: JOB_STATUS.COMPLETED,
      progress: 100,
      currentStep: JOB_STATUS.COMPLETED,
      videoUrl: urls.videoUrl || '',
      thumbnailUrl: urls.thumbnailUrl || '',
      audioUrls: urls.audioUrls || [],
    },
    { new: true }
  );
}

/**
 * The structured-failure fields (services/pipeline/pipelineErrors.js) as they
 * are stored on `VideoJob.error`. Empty when the caller has none - older call
 * sites keep working.
 */
function structuredFields(structured) {
  if (!structured) return {};
  return {
    code: structured.code,
    stage: structured.stage,
    retryable: structured.retryable,
    attempt: structured.attempt,
    timestamp: structured.timestamp ? new Date(structured.timestamp) : new Date(),
  };
}

/**
 * Mark job as failed (terminal - retries exhausted or none configured).
 */
async function fail(jobId, errorMessage, step, { detail, retryCount, structured } = {}) {
  return VideoJob.findByIdAndUpdate(
    jobId,
    {
      $set: {
        status: JOB_STATUS.FAILED,
        currentStep: step,
        error: {
          message: errorMessage,
          detail: detail ?? errorMessage,
          step,
          retryCount: retryCount ?? 0,
          ...structuredFields(structured),
        },
      },
      $unset: { nextRetryAt: '' },
    },
    { new: true }
  );
}

/**
 * Mark a failed step as retry-pending: the worker will automatically
 * re-enter the pipeline (see videoWorker/processor.js) after `nextRetryAt`
 * instead of requiring a manual Restart click. Unlike `fail()`, this is not
 * terminal - `retryCount` here is the attempt number just consumed.
 */
async function scheduleRetry(jobId, { message, detail, step, retryCount, nextRetryAt, structured }) {
  return VideoJob.findByIdAndUpdate(
    jobId,
    {
      $set: {
        status: JOB_STATUS.RETRY_SCHEDULED,
        currentStep: step,
        nextRetryAt,
        error: {
          message,
          detail: detail ?? message,
          step,
          retryCount,
          ...structuredFields(structured),
        },
      },
    },
    { new: true }
  );
}

module.exports = {
  updateStatus,
  updateScript,
  updateSceneImages,
  updateSceneAudio,
  updateSceneSegments,
  complete,
  fail,
  scheduleRetry,
};
