const VideoJob = require('../../models/VideoJob');
const VideoService = require('../../services/video/VideoService');
const SocketService = require('../../services/common/SocketService');
const ActivityLogService = require('../../services/common/ActivityLogService');
const LoggerService = require('../../services/common/LoggerService');
const stageTracker = require('../../services/pipeline/stageTracker');
const { JobStalledError, toStructuredError } = require('../../services/pipeline/pipelineErrors');
const { IN_FLIGHT_VIDEO_STATUSES } = require('../../constants/jobTransitions');

/**
 * Safety net for a BullMQ job that failed WITHOUT the processor getting to say
 * why: the stalled-job limit (a worker lost its lock more than maxStalledCount
 * times) or an exception thrown before the processor's own try block. In both
 * the Mongo document is left in a mid-pipeline status that no live process owns,
 * so it would look "in progress" until the next restart sweep.
 *
 * Every other failure has already been recorded by the processor (the job is
 * FAILED / RETRY_SCHEDULED by the time BullMQ reports it), which is why this is
 * a no-op for them - it only acts on a job still marked in flight.
 *
 * Marks it FAILED with a retryable JOB_STALLED error and closes the stage that
 * was running, so Restart resumes at that stage with everything before it kept.
 */
async function recordUnhandledFailure(bullJob, err) {
  const jobId = bullJob?.data?.jobId;
  if (!jobId) return null;

  try {
    const job = await VideoJob.findById(jobId).select('status error').lean();
    if (!job || !IN_FLIGHT_VIDEO_STATUSES.includes(job.status)) return null;

    const stalled = /stalled/i.test(String(err?.message || ''));
    const reason = stalled
      ? 'The worker stopped responding while processing this job. Click Restart Job to resume.'
      : 'The job was interrupted before it could finish. Click Restart Job to resume.';
    const structured = toStructuredError(new JobStalledError(reason), {
      stage: null,
      attempt: (job.error?.retryCount || 0) + 1,
    });
    const interruptedStage = await stageTracker.markInterrupted(jobId, structured);
    const failed = await VideoService.fail(jobId, reason, job.status, {
      detail: String(err?.message || reason),
      retryCount: structured.attempt,
      structured: { ...structured, stage: interruptedStage || structured.stage },
    });

    SocketService.emitJobFailed(failed, reason);
    await ActivityLogService.add(jobId, `Worker failure outside the pipeline (${stalled ? 'stalled' : 'unexpected'}) - marked failed`);
    LoggerService.warn('Recovered a job BullMQ failed outside the pipeline', {
      jobId, previousStatus: job.status, stage: interruptedStage, stalled,
    });
    return failed;
  } catch (dbErr) {
    LoggerService.error('Could not record an unhandled worker failure', { jobId, error: dbErr.message });
    return null;
  }
}

module.exports = { recordUnhandledFailure };
