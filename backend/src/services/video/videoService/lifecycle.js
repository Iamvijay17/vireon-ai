const fs = require('fs').promises;
const path = require('path');
const VideoJob = require('../../../models/VideoJob');
const LoggerService = require('../../common/LoggerService');
const { JOB_STATUS } = require('../../../constants');
const { assertTransitionAllowed } = require('../../../constants/jobTransitions');
const { NotFoundError, ValidationError } = require('../../../utils/errors');
const { getStepForResume, getResumeStep } = require('./resumeLogic');
const cancellationBus = require('../../common/cancellationBus');
const { prepareSceneForImage } = require('../../image/sceneImages');
const { IMAGE_SCENE_FIELDS } = require('../../image/fields');
const stageTracker = require('../../pipeline/stageTracker');
const { STAGES } = require('../../pipeline/stages');

/**
 * Re-render a completed job - resets to PREPARING_ASSETS state
 * so the pipeline re-runs from assets preparation, rendering, and upload.
 * Keeps the existing script and audio data intact.
 */
async function rerender(jobId) {
  const job = await VideoJob.findById(jobId);
  if (!job) {
    throw new NotFoundError('Job not found');
  }

  // Only allow re-render from COMPLETED, FAILED or SCRIPT_COMPLETED (edited after a finished render)
  assertTransitionAllowed(job, 'rerender', (status) => `Job is in ${status} state and cannot be re-rendered. Only COMPLETED, FAILED or SCRIPT_COMPLETED jobs can be re-rendered.`);

  // Delete assets/props so the worker regenerates them with the latest
  // scene data (prepareAssets always does this anyway - see renderStep.js).
  // Deliberately does NOT touch render/ here: renderStep.render() compares
  // the freshly-prepared assets against that existing video.mp4's recorded
  // fingerprint (RemotionService.isRenderCurrent) and skips re-rendering
  // when nothing actually changed since the last render - eagerly deleting
  // it here used to destroy that video.mp4 before the check could ever see
  // it, forcing every "Re-render" click to pay for a full Remotion render
  // (often minutes) even when no scene/image/template had changed.
  // renderStep.render() deletes render/ itself, right before it actually
  // decides a real re-render is needed.
  const jobDir = path.resolve(__dirname, '../../../../jobs', jobId);
  const assetsPath = path.join(jobDir, 'assets.json');
  const propsPath = path.join(jobDir, 'render-props.json');

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

  await stageTracker.invalidate(jobId, STAGES.ASSETS);

  LoggerService.info('Video job re-rendering', {
    jobId,
    originalStatus: job.status,
    resumeStep: JOB_STATUS.PREPARING_ASSETS,
  });

  return updatedJob;
}

/**
 * Re-roll one scene's picture - optionally from a new prompt. The scene's old
 * image is cleared and its variant bumped (so the generator makes a different
 * picture rather than serving the cached one), then the job resumes at the image
 * step, which only has this scene to do before the video is rendered again.
 *
 * A podcast's turns share one cover image, so re-rolling it re-rolls it for every
 * turn that shares that prompt.
 */
async function regenerateSceneImage(jobId, sceneNumber, { prompt } = {}) {
  const job = await VideoJob.findById(jobId);
  if (!job) {
    throw new NotFoundError('Job not found');
  }

  assertTransitionAllowed(job, 'regenerateImage', (status) => `Job is in ${status} state. Images can be regenerated once the video has been rendered.`);

  const scenes = job.script.scenes;
  const target = scenes.find((s) => s.sceneNumber === sceneNumber);
  if (!target) {
    throw new NotFoundError(`Scene ${sceneNumber} not found`);
  }

  const targetPlain = target.toObject();
  const prepared = prepareSceneForImage(targetPlain, prompt);
  if (!prepared) {
    throw new ValidationError('This scene has no image prompt. Send a "prompt" describing the image to generate.');
  }

  // Which scenes change: just this one, or every podcast turn sharing its cover.
  const sharedPrompt = targetPlain.sceneType === 'podcast' ? targetPlain.imagePrompt : null;
  for (const scene of scenes) {
    const isTarget = scene.sceneNumber === sceneNumber;
    const sharesCover = sharedPrompt && scene.sceneType === 'podcast' && scene.imagePrompt === sharedPrompt;
    if (!isTarget && !sharesCover) continue;

    const next = isTarget ? prepared : prepareSceneForImage(scene.toObject(), prepared.imagePrompt);
    for (const field of IMAGE_SCENE_FIELDS) {
      if (field in next) scene[field] = next[field];
    }
  }
  await job.save();

  // Same cleanup as a re-render: stale props must not be reused. render/ is left
  // for renderStep, which decides by fingerprint whether it really must re-render.
  const jobDir = path.resolve(__dirname, '../../../../jobs', jobId);
  try { await fs.unlink(path.join(jobDir, 'assets.json')); } catch {}
  try { await fs.unlink(path.join(jobDir, 'render-props.json')); } catch {}

  const updatedJob = await VideoJob.findByIdAndUpdate(
    jobId,
    {
      $set: {
        status: JOB_STATUS.GENERATING_IMAGES,
        progress: 56,
        currentStep: JOB_STATUS.GENERATING_IMAGES,
        videoUrl: '',
        thumbnailUrl: '',
        audioUrls: [],
      },
      $unset: { error: '' },
    },
    { new: true }
  );

  await stageTracker.invalidate(jobId, STAGES.IMAGES);

  LoggerService.info('Video job regenerating a scene image', { jobId, sceneNumber, newPrompt: Boolean(prompt) });
  return updatedJob;
}

/**
 * Regenerate just the script step for a job that already has one (e.g.
 * awaiting approval, or completed) - clears the existing script/render
 * output and resets to QUEUED so the worker's `needsScriptGeneration`
 * check (script.scenes empty, or status === QUEUED) re-runs script
 * generation from scratch through AIDirectorService, picking up
 * whatever scene-count/prompt logic is current instead of reusing the
 * stale script already on the job. Downstream audio/render artifacts are
 * cleared too since they're tied to the old script's scene numbers and
 * would otherwise dangle against a script that no longer matches them.
 */
async function regenerateScript(jobId) {
  const job = await VideoJob.findById(jobId);
  if (!job) {
    throw new NotFoundError('Job not found');
  }

  assertTransitionAllowed(job, 'regenerateScript', (status) => `Job is in ${status} state and cannot regenerate its script.`);

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

  await stageTracker.invalidate(jobId, STAGES.SCRIPT);

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
 * there's no general way to kill an in-progress external call (Ollama/
 * upload) directly, so the worker itself checks for CANCELLED at each step
 * boundary and between per-scene iterations, and bails out as soon as it
 * notices - see videoWorker/shared.js's `bailIfCancelled`. The TTS and
 * Remotion calls specifically also get an immediate abort signal via
 * cancellationBus below (see workers/videoWorker/processor.js's ctx.signal),
 * since those are the steps long enough for a user to notice Stop "not
 * working" while it waits out a checkpoint.
 */
async function stop(jobId) {
  const job = await VideoJob.findById(jobId);
  if (!job) {
    throw new NotFoundError('Job not found');
  }

  assertTransitionAllowed(job, 'stop', (status) => `Job is in ${status} state and cannot be stopped - it isn't running.`);

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

  cancellationBus.requestCancel(jobId);

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
    throw new NotFoundError('Job not found');
  }

  assertTransitionAllowed(job, 'approve', (status) => `Job is in ${status} state and cannot be approved. Only jobs awaiting approval can be approved.`);

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
    throw new NotFoundError('Job not found');
  }

  if (job.fastGeneration) {
    throw new ValidationError('This job uses fast generation - audio runs automatically after approval.');
  }

  assertTransitionAllowed(job, 'generateAudio', (status) => `Job is in ${status} state. Approve the script before generating audio.`);

  // Redo after a first take (e.g. the voice was changed): the worker's audio step only
  // synthesizes scenes that have no audio file, so drop the old files and rewind to the
  // pre-audio state - the worker then pauses again after audio, like the first run.
  if (job.status === JOB_STATUS.AUDIO_COMPLETED) {
    for (const scene of job.script.scenes) {
      if (!scene.audio) continue;
      scene.audio.file = '';
      scene.audio.speechTimeline = undefined;
      scene.audio.segments = undefined;
      scene.audio.ttsMeta = undefined;
    }
    job.status = JOB_STATUS.SCRIPT_COMPLETED;
    job.progress = 20;
    job.currentStep = JOB_STATUS.SCRIPT_COMPLETED;
    await job.save();
    await stageTracker.invalidate(jobId, STAGES.AUDIO);
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
    throw new NotFoundError('Job not found');
  }

  if (job.fastGeneration) {
    throw new ValidationError('This job uses fast generation - rendering runs automatically after approval.');
  }

  assertTransitionAllowed(job, 'generateRender', (status) => `Job is in ${status} state. Generate audio before rendering.`);

  LoggerService.info('Video job manual render triggered', { jobId });
  return job;
}

/**
 * Restart a failed or stuck job - resume from the appropriate step.
 */
async function restart(jobId) {
  const job = await VideoJob.findById(jobId);
  if (!job) {
    throw new NotFoundError('Job not found');
  }

  // Only allow restart from FAILED or stuck processing states
  assertTransitionAllowed(job, 'restart', (status) => `Job is in ${status} state and cannot be restarted`);

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
  regenerateSceneImage,
  regenerateScript,
  stop,
  approve,
  generateAudio,
  generateRender,
  restart,
};
