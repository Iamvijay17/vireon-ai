const config = require('../../config');
const LoggerService = require('../../services/common/LoggerService');
const ActivityLogService = require('../../services/common/ActivityLogService');
const MetricsService = require('../../services/common/MetricsService');
const VideoService = require('../../services/video/VideoService');
const SocketService = require('../../services/common/SocketService');
const videoQueue = require('../../queues/videoQueue');
const { JOB_STATUS } = require('../../constants');
const { decideRetry, describeRetry, describeExhausted, retryJobId } = require('../../services/common/retryPolicy');
const { runStage } = require('../../services/pipeline/stageRunner');
const { STAGES } = require('../../services/pipeline/stages');
const { toStructuredError } = require('../../services/pipeline/pipelineErrors');
const { bailIfCancelled } = require('./shared');
const cancellationBus = require('../../services/common/cancellationBus');
const { getResumeStep } = require('../../services/video/videoService/resumeLogic');
const scriptStep = require('./scriptStep');
const audioStep = require('./audioStep');
const imageStep = require('./imageStep');
const renderStep = require('./renderStep');
const uploadStep = require('./uploadStep');

// A job actively pre-audio (not yet past GENERATING_AUDIO) that started as
// manual mode should pause right after audio completes rather than
// auto-continuing into images/render - see the fastGeneration check below.
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
async function runVideoJob(job) {
  const { jobId } = job.data;
  const startedAt = Date.now();
  LoggerService.border(`🎬 Processing Job: ${jobId}`, 'event');
  LoggerService.info('[Pipeline] Started', { stage: 'pipeline', attemptsMade: job.attemptsMade });

  // Get job details to check current state
  let videoJob = await VideoService.getById(jobId);
  let currentStatus = videoJob.status;

  // Queue wait = time between job creation and a worker actually picking
  // it up - only meaningful the very first time a job is processed (a
  // resumed/retried job's createdAt no longer reflects "time spent
  // waiting", so this deliberately doesn't fire for those paths).
  if (currentStatus === JOB_STATUS.QUEUED) {
    MetricsService.recordDuration('queue.wait', Date.now() - videoJob.createdAt.getTime());
  }

  // This job's previous attempt failed but had retries left - it was
  // re-enqueued (with a backoff delay) still sitting at RETRY_SCHEDULED
  // rather than at an actual pipeline step. Resolve the real resume point
  // now, the same way a manual Restart click would (see
  // videoService/lifecycle.js's restart()), then continue as a normal
  // resume from there.
  // Read before the resume below: updateStatus() clears `error` (and with it
  // retryCount), so reading it at failure time would count every retry as
  // attempt 1 - the budget would never run out, and the next retry would
  // reuse the still-running attempt's BullMQ id and be silently dropped,
  // leaving the job at RETRY_SCHEDULED with nothing queued.
  const retriesTaken = videoJob.error?.retryCount || 0;

  if (currentStatus === JOB_STATUS.RETRY_SCHEDULED) {
    const resumeInfo = getResumeStep(videoJob);
    videoJob = await VideoService.updateStatus(jobId, resumeInfo.status, { progress: resumeInfo.progress });
    currentStatus = videoJob.status;
    LoggerService.info(`Job ${jobId} resuming automatic retry`, { resumeStatus: currentStatus });
  }

  // Tracks the current step for error reporting - shared by reference
  // with every step module so each can record where it was right before
  // doing its actual work, matching where the original inline pipeline
  // set this same variable. ctx.signal aborts the moment a Stop request
  // reaches this process (see cancellationBus) - audioStep/renderStep
  // thread it into their TTS/Remotion calls so cancellation interrupts
  // whatever's actually in flight instead of only being noticed at the
  // next bailIfCancelled checkpoint between steps.
  const abortController = new AbortController();
  const unregisterAbort = cancellationBus.register(jobId, abortController);
  const ctx = { currentStep: null, signal: abortController.signal };

  try {
    // A delayed automatic-retry job can fire after the user already hit
    // Stop while it was waiting - bail before touching the pipeline instead
    // of letting scriptStep re-run against a CANCELLED job (bailIfCancelled
    // below only guards the boundaries *between* steps, not this first one).
    await bailIfCancelled(jobId);

    // ── Step 1-3: Script Generation (only if starting fresh or restarting from QUEUED)
    const scriptPauseResult = await runStage(STAGES.SCRIPT, {
      jobId,
      ctx,
      fn: () => scriptStep.run(jobId, videoJob, currentStatus, ctx),
    });
    if (scriptPauseResult) {
      LoggerService.info('[Pipeline] Paused for script approval', { stage: 'pipeline', durationMs: Date.now() - startedAt });
      return scriptPauseResult;
    }

    // An auto-approved job generates its script in this very run and falls straight
    // through, so the copy fetched at the top has no script yet - reload it.
    if (videoJob.autoApprove && !videoJob.script?.scenes?.length) {
      videoJob = await VideoService.getById(jobId);
    }

    await bailIfCancelled(jobId);

    // ── Step 4: Audio Generation (skipped if all scenes already have audio files)
    await runStage(STAGES.AUDIO, { jobId, ctx, fn: () => audioStep.run(jobId, videoJob, videoJob.script, ctx) });

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

    // ── Step 5.7: Scene images (or their text-only fallbacks)
    await runStage(STAGES.IMAGES, { jobId, ctx, fn: () => imageStep.run(jobId, ctx) });

    await bailIfCancelled(jobId);

    // The image step rewrites scenes (image URLs, fallbacks to text), so the render
    // and upload below work from the script as it is now, not the pre-image copy.
    const renderScript = (await VideoService.getById(jobId)).script;

    // ── Step 6: Prepare Assets
    const assets = await runStage(STAGES.ASSETS, {
      jobId,
      ctx,
      fn: () => renderStep.prepareAssets(jobId, videoJob, renderScript, ctx),
    });

    await bailIfCancelled(jobId);

    // ── Step 7: Render Video
    await runStage(STAGES.RENDER, { jobId, ctx, fn: () => renderStep.render(jobId, assets, ctx, renderScript) });

    await bailIfCancelled(jobId);

    // ── Step 8-9: Upload output, complete job, cleanup
    const result = await runStage(STAGES.UPLOAD, { jobId, ctx, fn: () => uploadStep.run(jobId, renderScript, ctx) });
    LoggerService.info('[Pipeline] Completed', { stage: 'pipeline', totalDurationMs: Date.now() - startedAt });
    return result;
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

    const step = ctx.currentStep || 'PROCESSING';
    LoggerService.error(`Job ${jobId} failed`, {
      error: err.message,
      step,
      stack: config.isDev ? err.stack : undefined,
    });

    // stageRunner already classified anything a stage threw; this covers what
    // escaped outside a stage (the retry-resume lookup, a cancellation poll).
    // retryCount stores retries already taken, so the attempt that just
    // failed is one past it. See services/common/retryPolicy.js for the
    // budget/backoff rules both workers now share.
    const attempt = retriesTaken + 1;
    const structured = err.structured || toStructuredError(err, { stage: null, attempt, step });
    const { message: friendly, detail } = structured;
    const maxRetries = videoJob.maxRetries || 3;
    // A permanent failure (bad input, bad setup) is not retried - the same
    // attempt would fail the same way - so it goes straight to FAILED.
    const retry = decideRetry({ attempt, maxRetries, eligible: structured.retryable });

    if (retry.shouldRetry) {
      // Retries remain - schedule an automatic resume instead of leaving
      // this FAILED for a human to click Restart. A distinct BullMQ job id
      // (not the video job's own id) avoids colliding with this attempt's
      // still-finishing record, and returning normally (not throwing) below
      // means BullMQ marks *this* attempt 'completed' rather than 'failed' -
      // see videoQueue.js's comment for why that race matters.
      try {
        const scheduledJob = await VideoService.scheduleRetry(jobId, {
          message: friendly,
          detail,
          step,
          retryCount: attempt,
          nextRetryAt: retry.nextRetryAt,
          structured,
        });
        SocketService.emitJobProgress(scheduledJob);
        await ActivityLogService.add(
          jobId,
          describeRetry({ step, attempt, maxRetries, delayMs: retry.delayMs, reason: friendly })
        );
        // Same id videoQueueJobs.scheduledRetryId derives from the saved
        // nextRetryAt, so the recovery sweep can't queue it a second time.
        await videoQueue.add('render-video', { jobId }, {
          jobId: retryJobId(jobId, attempt, retry.nextRetryAt.getTime()),
          delay: retry.delayMs,
        });
        MetricsService.increment('job.retries');
      } catch (dbErr) {
        LoggerService.error('Failed to schedule automatic retry', { error: dbErr.message });
      }
      return { success: false, jobId, retryScheduled: true, attempt };
    }

    // Retries exhausted (or the failure is permanent) - mark job as terminally failed.
    try {
      const failedJob = await VideoService.fail(jobId, friendly, step, { detail, retryCount: attempt, structured });
      SocketService.emitJobFailed(failedJob, friendly);
      await ActivityLogService.add(
        jobId,
        structured.retryable
          ? describeExhausted({ step, attempt, reason: friendly })
          : `${step} failed and cannot be retried (${structured.code}): ${friendly}`
      );
    } catch (dbErr) {
      LoggerService.error('Failed to update job status in DB', { error: dbErr.message });
    }

    // Re-throw for logging parity with BullMQ's 'failed' listener. attempts:
    // 1 on the queue means BullMQ itself won't retry this.
    throw err;
  } finally {
    unregisterAbort();
  }
}

/**
 * Entry point for the BullMQ worker. Runs the pipeline inside a log context
 * so every line any module emits for this job - LLM, TTS, GPU lease,
 * ComfyUI, render, upload - carries its jobId without each call site
 * passing it (see LoggerService.runWithContext).
 */
function processVideoJob(job) {
  return LoggerService.runWithContext({ jobId: job.data.jobId }, () => runVideoJob(job));
}

module.exports = { processVideoJob };
