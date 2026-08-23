const fs = require('fs').promises;
const path = require('path');
const VideoJob = require('../../../models/VideoJob');
const LoggerService = require('../../common/LoggerService');
const { JOB_STATUS } = require('../../../constants');
const { getStepForResume, getResumeStep } = require('./resumeLogic');

/**
 * Re-render a completed job - resets to PREPARING_ASSETS state
 * so the pipeline re-runs from assets preparation, rendering, and upload.
 * Keeps the existing script and audio data intact.
 */
async function rerender(jobId) {
  const job = await VideoJob.findById(jobId);
  if (!job) {
    throw { status: 404, message: 'Job not found' };
  }

  // Only allow re-render from COMPLETED or FAILED states
  const rerenderableStates = [JOB_STATUS.COMPLETED, JOB_STATUS.FAILED];
  if (!rerenderableStates.includes(job.status)) {
    throw { status: 400, message: `Job is in ${job.status} state and cannot be re-rendered. Only COMPLETED or FAILED jobs can be re-rendered.` };
  }

  // Clean up old render and assets files so the worker re-creates them
  const jobDir = path.resolve(__dirname, '../../../../jobs', jobId);
  const renderDir = path.join(jobDir, 'render');
  const assetsPath = path.join(jobDir, 'assets.json');
  const propsPath = path.join(jobDir, 'render-props.json');

  // Delete render output and assets (keep audio and script)
  try { await fs.rm(renderDir, { recursive: true, force: true }); } catch {}
  try { await fs.unlink(assetsPath); } catch {}
  try { await fs.unlink(propsPath); } catch {}

  // Reset to PREPARING_ASSETS - keeps script and audio, re-runs from assets prep.
  // `error: undefined` in a plain update object is silently dropped by
  // Mongoose (undefined-valued keys never reach the $set), so the old
  // error would otherwise stick around forever - needs an explicit $unset.
  const updatedJob = await VideoJob.findByIdAndUpdate(
    jobId,
    {
      $set: {
        status: JOB_STATUS.PREPARING_ASSETS,
        progress: 60,
        currentStep: JOB_STATUS.PREPARING_ASSETS,
        videoUrl: '',
        thumbnailUrl: '',
        audioUrls: [],
      },
      $unset: { error: '' },
    },
    { new: true }
  );

  LoggerService.info('Video job re-rendering', {
    jobId,
    originalStatus: job.status,
    resumeStep: JOB_STATUS.PREPARING_ASSETS,
  });

  return updatedJob;
}

/**
 * Regenerate just the script step for a job that already has one (e.g.
 * awaiting approval, or completed) - clears the existing script/render
 * output and resets to QUEUED so the worker's `needsScriptGeneration`
 * check (script.scenes empty, or status === QUEUED) re-runs script
 * generation from scratch through ChunkedScriptService, picking up
 * whatever scene-count/prompt logic is current instead of reusing the
 * stale script already on the job. Downstream audio/render artifacts are
 * cleared too since they're tied to the old script's scene numbers and
 * would otherwise dangle against a script that no longer matches them.
 */
async function regenerateScript(jobId) {
  const job = await VideoJob.findById(jobId);
  if (!job) {
    throw { status: 404, message: 'Job not found' };
  }

  const terminalOrRunning = [JOB_STATUS.CANCELLED];
  if (terminalOrRunning.includes(job.status)) {
    throw { status: 400, message: `Job is in ${job.status} state and cannot regenerate its script.` };
  }

  const jobDir = path.resolve(__dirname, '../../../../jobs', jobId);
  // Delete generated audio/render output on disk (keep nothing to resume
  // from - a fresh script means fresh scene numbers/durations).
  try { await fs.rm(jobDir, { recursive: true, force: true }); } catch {}

  const updatedJob = await VideoJob.findByIdAndUpdate(
    jobId,
    {
      $set: {
        status: JOB_STATUS.QUEUED,
        progress: 0,
        currentStep: JOB_STATUS.QUEUED,
        script: null,
        videoUrl: '',
        thumbnailUrl: '',
        audioUrls: [],
      },
      $unset: { error: '' },
    },
    { new: true }
  );

  LoggerService.info('Video job script regeneration triggered', {
    jobId,
    previousStatus: job.status,
    previousSceneCount: job.script?.scenes?.length || 0,
  });

  return updatedJob;
}

/**
 * Stop a running job. Marks it CANCELLED immediately - if the job hasn't
 * started processing yet, the caller (VideoController.stop) also removes
 * it from the BullMQ queue so it never starts. If it's already mid-flight,
 * there's no way to kill the in-progress external call (LM Studio/TTS/
 * Remotion/upload) directly, so the worker itself checks for
 * CANCELLED at each step boundary and between per-scene iterations, and
 * bails out as soon as it notices - see videoWorker.js's `bailIfCancelled`.
 */
async function stop(jobId) {
  const job = await VideoJob.findById(jobId);
  if (!job) {
    throw { status: 404, message: 'Job not found' };
  }

  const terminalStates = [JOB_STATUS.COMPLETED, JOB_STATUS.FAILED, JOB_STATUS.CANCELLED];
  if (terminalStates.includes(job.status)) {
    throw { status: 400, message: `Job is in ${job.status} state and cannot be stopped - it isn't running.` };
  }

  const updatedJob = await VideoJob.findByIdAndUpdate(
    jobId,
    {
      status: JOB_STATUS.CANCELLED,
      currentStep: JOB_STATUS.CANCELLED,
      error: {
        message: 'Stopped by user',
        step: job.status,
        retryCount: job.error?.retryCount || 0,
      },
    },
    { new: true }
  );

  LoggerService.info('Video job stopped', { jobId, previousStatus: job.status });

  return updatedJob;
}

/**
 * Approve a script that's awaiting manual review.
 *
 * fastGeneration jobs: caller re-enqueues the 'render-video' BullMQ job
 * afterwards - the worker's own `needsScriptGeneration` check already
 * skips regeneration once status isn't QUEUED, so it resumes straight
 * into audio/image/render/upload, all automatic from here.
 *
 * Manual (fastGeneration: false) jobs: this only marks the script
 * approved (status -> SCRIPT_COMPLETED) and stops - audio generation is
 * a separate explicit step (see generateAudio below), like course videos.
 */
async function approve(jobId) {
  const job = await VideoJob.findById(jobId);
  if (!job) {
    throw { status: 404, message: 'Job not found' };
  }

  if (job.status !== JOB_STATUS.AWAITING_APPROVAL) {
    throw { status: 400, message: `Job is in ${job.status} state and cannot be approved. Only jobs awaiting approval can be approved.` };
  }

  if (!job.fastGeneration) {
    job.status = JOB_STATUS.SCRIPT_COMPLETED;
    job.progress = 20;
    job.currentStep = JOB_STATUS.SCRIPT_COMPLETED;
    await job.save();
  }

  LoggerService.info('Video job script approved', { jobId, fastGeneration: job.fastGeneration });
  return job;
}

/**
 * Manual mode only: trigger audio generation for an approved script.
 * Caller re-enqueues 'render-video' afterwards - the worker pauses again
 * right after audio completes (status stays AUDIO_COMPLETED) instead of
 * auto-continuing into images/render, since fastGeneration is false.
 */
async function generateAudio(jobId) {
  const job = await VideoJob.findById(jobId);
  if (!job) {
    throw { status: 404, message: 'Job not found' };
  }

  if (job.fastGeneration) {
    throw { status: 400, message: 'This job uses fast generation - audio runs automatically after approval.' };
  }

  if (job.status !== JOB_STATUS.SCRIPT_COMPLETED) {
    throw { status: 400, message: `Job is in ${job.status} state. Approve the script before generating audio.` };
  }

  LoggerService.info('Video job manual audio generation triggered', { jobId });
  return job;
}

/**
 * Manual mode only: trigger the final image/render/upload stage once
 * audio is ready. Caller re-enqueues 'render-video' afterwards.
 */
async function generateRender(jobId) {
  const job = await VideoJob.findById(jobId);
  if (!job) {
    throw { status: 404, message: 'Job not found' };
  }

  if (job.fastGeneration) {
    throw { status: 400, message: 'This job uses fast generation - rendering runs automatically after approval.' };
  }

  if (job.status !== JOB_STATUS.AUDIO_COMPLETED) {
    throw { status: 400, message: `Job is in ${job.status} state. Generate audio before rendering.` };
  }

  LoggerService.info('Video job manual render triggered', { jobId });
  return job;
}

/**
 * Restart a failed or stuck job - resume from the appropriate step.
 */
async function restart(jobId) {
  const job = await VideoJob.findById(jobId);
  if (!job) {
    throw { status: 404, message: 'Job not found' };
  }

  // Only allow restart from FAILED or stuck processing states
  const nonRestartableStates = [JOB_STATUS.COMPLETED];
  if (nonRestartableStates.includes(job.status)) {
    throw { status: 400, message: `Job is in ${job.status} state and cannot be restarted` };
  }

  // If job is in FAILED state, use error step to determine resume point
  // If job is stuck in a processing state, use current status to determine resume point
  const resumeInfo = job.status === JOB_STATUS.FAILED
    ? getResumeStep(job)
    : getStepForResume(job);

  // Update job to resume from the appropriate step.
  // `error: undefined` in a plain update object is silently dropped by
  // Mongoose (undefined-valued keys never reach the $set), so the old
  // error would otherwise stick around forever - needs an explicit $unset.
  const updatedJob = await VideoJob.findByIdAndUpdate(
    jobId,
    {
      $set: {
        status: resumeInfo.status,
        progress: resumeInfo.progress,
        currentStep: resumeInfo.currentStep,
      },
      $unset: { error: '' },
    },
    { new: true }
  );

  LoggerService.info('Video job restarted', {
    jobId,
    resumeStep: resumeInfo.status,
    originalStatus: job.status,
    failedStep: job.error?.step,
    hadScript: !!job.script?.scenes?.length,
    scenesWithAudio: job.script?.scenes?.filter(s => s.audio?.file)?.length || 0,
  });
  return updatedJob;
}

module.exports = {
  rerender,
  regenerateScript,
  stop,
  approve,
  generateAudio,
  generateRender,
  restart,
};
