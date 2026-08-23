const VideoJob = require('../../../models/VideoJob');
const { JOB_STATUS } = require('../../../constants');

/**
 * Update job status with progress.
 */
async function updateStatus(jobId, status, extra = {}) {
  const { error: errorMessage, retryCount, progress, ...rest } = extra;

  const update = {
    $set: {
      status,
      progress: progress ?? 0,
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
 * Update scene image URL.
 */
async function updateSceneImage(jobId, sceneNumber, imageData) {
  const job = await VideoJob.findById(jobId);
  if (!job) throw { status: 404, message: 'Job not found' };

  const scene = job.script.scenes.find((s) => s.sceneNumber === sceneNumber);
  if (scene) {
    scene.imageUrl = imageData.imageUrl;
  }

  await job.save();
  return job;
}

/**
 * Update scene audio data.
 */
async function updateSceneAudio(jobId, sceneNumber, audioData) {
  const job = await VideoJob.findById(jobId);
  if (!job) throw { status: 404, message: 'Job not found' };

  const scene = job.script.scenes.find((s) => s.sceneNumber === sceneNumber);
  if (scene) {
    scene.audio.file = audioData.file;
    scene.audio.duration = audioData.duration;
    scene.audio.captionTimestamps = audioData.captionTimestamps || null;
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
 * Persist the generated avatar overlay clip's path once AvatarService has
 * animated the job's source photo (see videoWorker.js's GENERATING_AVATAR
 * step).
 */
async function updateAvatar(jobId, avatarData) {
  return VideoJob.findByIdAndUpdate(
    jobId,
    { avatarVideoUrl: avatarData.url },
    { new: true }
  );
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
 * Mark job as failed.
 */
async function fail(jobId, errorMessage, step) {
  return VideoJob.findByIdAndUpdate(
    jobId,
    {
      status: JOB_STATUS.FAILED,
      currentStep: step,
      error: {
        message: errorMessage,
        step,
      },
    },
    { new: true }
  );
}

module.exports = {
  updateStatus,
  updateScript,
  updateSceneImage,
  updateSceneAudio,
  updateAvatar,
  complete,
  fail,
};
