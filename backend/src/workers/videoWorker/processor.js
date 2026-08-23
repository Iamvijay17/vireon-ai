const config = require('../../config');
const LoggerService = require('../../services/common/LoggerService');
const ActivityLogService = require('../../services/common/ActivityLogService');
const VideoService = require('../../services/video/VideoService');
const SocketService = require('../../services/common/SocketService');
const { JOB_STATUS } = require('../../constants');
const { bailIfCancelled } = require('./shared');
const scriptStep = require('./scriptStep');
const audioStep = require('./audioStep');
const avatarStep = require('./avatarStep');
const renderStep = require('./renderStep');
const uploadStep = require('./uploadStep');

// A job actively pre-audio (not yet past GENERATING_AUDIO) that started as
// manual mode should pause right after audio completes rather than
// auto-continuing into avatar/render - see the fastGeneration check below.
const PRE_AUDIO_STATUSES = [
  JOB_STATUS.QUEUED,
  JOB_STATUS.SCRIPT_GENERATION,
  JOB_STATUS.SCRIPT_COMPLETED,
  JOB_STATUS.AWAITING_APPROVAL,
  JOB_STATUS.GENERATING_AUDIO,
];

/**
 * Video rendering pipeline: 9 steps run in sequence, each resumable
 * (skips work already persisted) so a crashed/restarted worker or a
 * paused-for-approval job picks up where it left off rather than
 * redoing completed work. Never throws for a user-triggered cancellation
 * (returns a `cancelled` result instead); does throw - and lets BullMQ
 * retry - for a genuine failure.
 */
async function processVideoJob(job) {
  const { jobId } = job.data;
  LoggerService.border(`🎬 Processing Job: ${jobId}`, 'event');

  // Get job details to check current state
  const videoJob = await VideoService.getById(jobId);
  const currentStatus = videoJob.status;

  // Tracks the current step for error reporting - shared by reference
  // with every step module so each can record where it was right before
  // doing its actual work, matching where the original inline pipeline
  // set this same variable.
  const ctx = { currentStep: null };

  try {
    // ── Step 1-3: Script Generation (only if starting fresh or restarting from QUEUED)
    const scriptPauseResult = await scriptStep.run(jobId, videoJob, currentStatus, ctx);
    if (scriptPauseResult) return scriptPauseResult;

    await bailIfCancelled(jobId);

    // ── Step 4: Audio Generation (skipped if all scenes already have audio files)
    await audioStep.run(jobId, videoJob, videoJob.script, ctx);

    // Catches a cancellation that landed after the last scene's audio
    // finished but before AUDIO_COMPLETED gets written below.
    await bailIfCancelled(jobId);

    // Re-fetch the job from DB to get updated scene durations from audio generation
    const updatedJob = await VideoService.getById(jobId);
    const script = updatedJob.script;

    await VideoService.updateStatus(jobId, JOB_STATUS.AUDIO_COMPLETED, { progress: 50 });
    SocketService.emitJobProgress({ _id: jobId, progress: 50, status: JOB_STATUS.AUDIO_COMPLETED, currentStep: JOB_STATUS.AUDIO_COMPLETED, currentScene: script.scenes.length });

    LoggerService.success('Audio generation complete', { files: script.scenes.length });
    await ActivityLogService.add(jobId, 'Audio generated successfully.');

    // Pause here for manual-mode jobs (fastGeneration: false): wait for
    // an explicit POST /:id/generate-render before spending image/render
    // resources, mirroring the script-approval pause above. Only pause the
    // first time we reach this point in a given run (currentStatus was
    // still pre-audio when this job started) - if we're resuming from a
    // manual generate-render trigger (or a restart mid-render), currentStatus
    // is already AUDIO_COMPLETED or later, so fall through and continue.
    if (!videoJob.fastGeneration && PRE_AUDIO_STATUSES.includes(currentStatus)) {
      LoggerService.info('Audio complete - pausing pipeline for manual render trigger (fastGeneration=false)', { jobId });
      return { success: true, jobId, awaitingRender: true };
    }

    await bailIfCancelled(jobId);

    // ── Step 5.5: Avatar Generation (optional)
    const avatarVideoUrl = await avatarStep.run(jobId, videoJob, ctx);

    await bailIfCancelled(jobId);

    // ── Step 6: Prepare Assets
    const assets = await renderStep.prepareAssets(jobId, videoJob, script, avatarVideoUrl, ctx);

    await bailIfCancelled(jobId);

    // ── Step 7: Render Video
    await renderStep.render(jobId, assets, ctx);

    await bailIfCancelled(jobId);

    // ── Step 8-9: Upload output, complete job, cleanup
    return await uploadStep.run(jobId, script, ctx);
  } catch (err) {
    if (err.cancelled) {
      // Status is already CANCELLED (set by VideoService.stop, which is
      // what triggered this bailout) - don't overwrite it with FAILED, and
      // don't re-throw, since a cancellation isn't something BullMQ should
      // retry.
      LoggerService.info(`Job ${jobId} stopped mid-pipeline at ${ctx.currentStep}`, { jobId });
      try {
        const cancelledJob = await VideoService.getById(jobId);
        SocketService.emitJobProgress(cancelledJob);
      } catch (dbErr) {
        LoggerService.error('Failed to read cancelled job status', { error: dbErr.message });
      }
      return { success: false, jobId, cancelled: true };
    }

    LoggerService.error(`Job ${jobId} failed`, {
      error: err.message,
      step: ctx.currentStep,
      stack: config.isDev ? err.stack : undefined,
    });

    // Mark job as failed in database with the actual step
    try {
      const failedJob = await VideoService.fail(jobId, err.message, ctx.currentStep || 'PROCESSING');
      SocketService.emitJobFailed(failedJob, err.message);
      await ActivityLogService.add(jobId, `${ctx.currentStep || 'Processing'} failed: ${err.message}`);
    } catch (dbErr) {
      LoggerService.error('Failed to update job status in DB', { error: dbErr.message });
    }

    // Re-throw so BullMQ can handle retries
    throw err;
  }
}

module.exports = { processVideoJob };
