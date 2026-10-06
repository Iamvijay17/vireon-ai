const LoggerService = require('../services/common/LoggerService');
const VideoService = require('../services/video/VideoService');
const SocketService = require('../services/common/SocketService');
const { JOB_STATUS, VIDEO_STATUS, STAGE_STATUS, SOCKET_EVENTS } = require('../constants');

// Boot-time (and, for stranded retries, periodic) recovery sweeps: put
// records a crashed or restarted process left mid-flight back into a state
// that is either moving again or honestly marked failed. Run from
// server.js's startServer() once the database is connected.

// Audio Studio generation (backend/src/controllers/audioController.js) is
// fully synchronous per-request, not queued like video jobs - so a record
// left in PENDING status can only mean the process died mid-generation
// (crash, restart, nodemon reload) while a client was waiting on it. Nothing
// resumes it, so it would otherwise sit there forever looking "in progress".
// Sweep those into FAILED on every boot so the history list reflects reality
// and the user can just regenerate instead of watching a stuck spinner. No
// queue to check here (there's no BullMQ job backing a synchronous request),
// so unlike the video/course sweeps below, every PENDING record found at
// boot is unconditionally orphaned. Marks records one at a time (rather than
// AudioGeneration.updateMany) and emits AUDIO_STUDIO_FAILED per record so a
// client still watching that job's socket room sees the same failure event
// audioController.generate's own catch block would have sent it.
async function reapOrphanedAudioGenerations() {
  const AudioGeneration = require('../models/AudioGeneration');
  const message = 'Generation was interrupted by a server restart. Please try again.';

  const stuck = await AudioGeneration.find({ status: 'PENDING' });
  for (const record of stuck) {
    record.status = 'FAILED';
    record.error = message;
    await record.save();
    SocketService.emitToJob(record._id, SOCKET_EVENTS.AUDIO_STUDIO_FAILED, { id: record._id, error: message });
  }

  if (stuck.length > 0) {
    LoggerService.warn(`Marked ${stuck.length} orphaned audio generation(s) as failed after restart`);
  }
}

// Video jobs run their entire pipeline (script -> audio -> images ->
// render -> upload) inside a single BullMQ job execution (see
// videoWorker/processor.js) that writes its current step to Mongo as it
// goes, purely for progress display. If the process hosting that execution
// dies (crash, restart, `ensureRedis` spinning up a fresh unpersisted local
// Redis) the Mongo doc is left pointing at whatever step it was on, with no
// guarantee BullMQ still has a matching job to resume it - so on every boot,
// for each job sitting in one of these transient "actively processing"
// statuses, check whether a live BullMQ job still backs it (active/waiting/
// delayed/paused all mean the worker will still pick it up normally) and
// only reap the ones that don't. Reaping means FAILED, not auto-retried -
// same reasoning as the audio sweep above: surface it as failed so the user
// can hit Restart Job (which already knows how to resume each of these
// statuses - see resumeLogic.js's getStepForResume) instead of it silently
// looking "in progress" forever.
const STUCK_VIDEO_STATUSES = [
  JOB_STATUS.QUEUED,
  JOB_STATUS.SCRIPT_GENERATION,
  JOB_STATUS.GENERATING_AUDIO,
  JOB_STATUS.GENERATING_IMAGES,
  JOB_STATUS.PREPARING_ASSETS,
  JOB_STATUS.RENDERING,
  JOB_STATUS.UPLOADING,
];

async function reapStuckVideoJobs() {
  const VideoJob = require('../models/VideoJob');
  const videoQueue = require('../queues/videoQueue');
  const ActivityLogService = require('../services/common/ActivityLogService');

  const videoQueueJobs = require('../services/video/videoQueueJobs');

  const candidates = await VideoJob.find({ status: { $in: STUCK_VIDEO_STATUSES } });
  let reaped = 0;

  for (const job of candidates) {
    // findLiveJobs, not getJob(job._id): an automatic retry runs under its
    // own `:retry:` id, and looking only at the base id would reap a retry
    // that is legitimately mid-run.
    try {
      if ((await videoQueueJobs.findLiveJobs(job._id)).length > 0) {
        continue; // Worker will still pick this up normally - not orphaned.
      }
      const finished = await videoQueue.getJob(job._id);
      if (finished) await finished.remove().catch(() => {});
    } catch (err) {
      LoggerService.warn('Could not check BullMQ state for stuck job during boot sweep', { jobId: job._id, error: err.message });
      continue;
    }

    const previousStatus = job.status;
    const failedJob = await VideoService.fail(
      job._id,
      'Job was interrupted by a server restart. Click Restart Job to resume.',
      previousStatus
    );
    SocketService.emitJobFailed(failedJob, failedJob.error.message);
    await ActivityLogService.add(job._id, `Interrupted by server restart while ${previousStatus} - marked failed`);
    reaped += 1;
  }

  if (reaped > 0) {
    LoggerService.warn(`Marked ${reaped} stuck video job(s) as failed after restart`);
  }
}

// A RETRY_SCHEDULED job is waiting for a delayed BullMQ job to bring it back.
// If that job is gone (Redis lost it, or a bug dropped it - see the retry id
// note in retryPolicy.js) nothing will ever move the job again, so queue the
// retry it is waiting for. Unlike the sweep above this resumes rather than
// fails: the job still had retries left. Runs at boot and on an interval,
// since a stranded retry needs no restart to happen. Safe to run from more
// than one process at once - see videoQueueJobs.scheduledRetryId.
const RETRY_SWEEP_MS = 5 * 60 * 1000;

async function recoverStrandedRetries() {
  const VideoJob = require('../models/VideoJob');
  const videoQueueJobs = require('../services/video/videoQueueJobs');
  const ActivityLogService = require('../services/common/ActivityLogService');

  const candidates = await VideoJob.find({ status: JOB_STATUS.RETRY_SCHEDULED }).lean();
  let recovered = 0;

  for (const job of candidates) {
    try {
      if (await videoQueueJobs.ensureScheduledRetry(job)) {
        await ActivityLogService.add(job._id, 'Scheduled retry was missing from the queue - re-queued it');
        recovered += 1;
      }
    } catch (err) {
      LoggerService.warn('Could not recover stranded retry', { jobId: job._id, error: err.message });
    }
  }

  if (recovered > 0) {
    LoggerService.warn(`Re-queued ${recovered} video job(s) stranded at RETRY_SCHEDULED`);
  }

  await recoverStrandedCourseRetries();
}

// Course videos have the same automatic-retry state (see
// courseVideoWorker.js's outer catch) and so the same failure mode: if the
// delayed BullMQ job is gone, the lesson sits at Retry Scheduled forever.
async function recoverStrandedCourseRetries() {
  const CourseVideo = require('../models/CourseVideo');
  const courseQueueJobs = require('../services/course/courseQueueJobs');
  const ActivityLogService = require('../services/common/ActivityLogService');

  const candidates = await CourseVideo.find({ status: VIDEO_STATUS.RETRY_SCHEDULED }).lean();
  let recovered = 0;

  for (const video of candidates) {
    try {
      const action = await courseQueueJobs.ensureScheduledRetry(video);
      if (action) {
        await ActivityLogService.add(video._id, `Scheduled retry was missing from the queue - re-queued ${action}`);
        recovered += 1;
      } else if (!courseQueueJobs.actionForRetry(video)) {
        LoggerService.warn('Stranded course retry has no known step to re-run', { videoId: video._id, step: video.error?.step });
      }
    } catch (err) {
      LoggerService.warn('Could not recover stranded course retry', { videoId: video._id, error: err.message });
    }
  }

  if (recovered > 0) {
    LoggerService.warn(`Re-queued ${recovered} course video(s) stranded at Retry Scheduled`);
  }
}

// Same problem as STUCK_VIDEO_STATUSES above, for course videos - each
// stage (script/audio/render) is a single BullMQ job execution (see
// courseVideoWorker.js) that can be interrupted mid-flight. Unlike
// videoQueue, courseQueue jobs aren't keyed by the video's id (see the
// `courseQueue.add(...)` call sites in courseVideoController.js - no
// `{ jobId }` option), so there's no direct getJob(videoId) lookup;
// instead this pulls every job BullMQ still considers live and matches on
// `job.data.videoId`. Maps each stuck status to the step label and
// per-stage field (scriptStatus/audioStatus/videoStatus) that
// retryStep/scriptPipeline/audioPipeline/renderPipeline already use, so a
// reaped video looks exactly like one that failed normally and Retry
// (retry.js's retryStep) picks it up the same way.
const STUCK_COURSE_VIDEO_STEP = {
  [VIDEO_STATUS.GENERATING_SCRIPT]: { step: 'Script Generation', stageField: 'scriptStatus' },
  [VIDEO_STATUS.GENERATING_AUDIO]: { step: 'Audio Generation', stageField: 'audioStatus' },
  [VIDEO_STATUS.GENERATING_SCENES]: { step: 'Rendering', stageField: 'videoStatus' },
  [VIDEO_STATUS.GENERATING_IMAGES]: { step: 'Rendering', stageField: 'videoStatus' },
  [VIDEO_STATUS.RENDERING_VIDEO]: { step: 'Rendering', stageField: 'videoStatus' },
  [VIDEO_STATUS.UPLOADING]: { step: 'Rendering', stageField: 'videoStatus' },
};

async function reapStuckCourseVideoJobs() {
  const CourseVideo = require('../models/CourseVideo');
  const courseQueue = require('../queues/courseQueue');
  const ActivityLogService = require('../services/common/ActivityLogService');

  const stuckStatuses = Object.keys(STUCK_COURSE_VIDEO_STEP);
  const candidates = await CourseVideo.find({ status: { $in: stuckStatuses } });
  if (candidates.length === 0) return;

  let liveVideoIds = new Set();
  try {
    const liveJobs = await courseQueue.getJobs(['active', 'waiting', 'delayed', 'paused'], 0, -1);
    liveVideoIds = new Set(liveJobs.map((j) => j.data?.videoId));
  } catch (err) {
    LoggerService.warn('Could not check BullMQ state for stuck course video jobs during boot sweep', { error: err.message });
    return;
  }

  let reaped = 0;
  for (const video of candidates) {
    if (liveVideoIds.has(video._id)) continue; // Worker will still pick this up normally - not orphaned.

    const { step, stageField } = STUCK_COURSE_VIDEO_STEP[video.status];
    const message = 'Video was interrupted by a server restart. Click Retry to resume.';

    video.status = VIDEO_STATUS.FAILED;
    video[stageField] = STAGE_STATUS.FAILED;
    video.error = {
      message,
      step,
      retryCount: video.error?.retryCount || 0,
    };
    await video.save();

    SocketService.emitCourseVideoFailed(video, message, step);
    await ActivityLogService.add(video._id, `Interrupted by server restart during ${step} - marked failed`);
    reaped += 1;
  }

  if (reaped > 0) {
    LoggerService.warn(`Marked ${reaped} stuck course video job(s) as failed after restart`);
  }
}

// Lessons stopped by the user whose stage was later re-queued used to keep
// their overall CANCELLED status (see liftCancelled in
// courseVideo/crud.js), so the worker bailed immediately and the stage sat
// at Queued/Processing forever. Normalise those leftovers to Cancelled so
// the Pipeline column agrees with the Status badge and the stage can be
// re-run.
async function healCancelledStageStatuses() {
  const CourseVideo = require('../models/CourseVideo');
  const inFlight = [STAGE_STATUS.QUEUED, STAGE_STATUS.PROCESSING];
  let healed = 0;
  for (const field of ['scriptStatus', 'audioStatus', 'videoStatus']) {
    const res = await CourseVideo.updateMany(
      { status: VIDEO_STATUS.CANCELLED, [field]: { $in: inFlight } },
      { $set: { [field]: STAGE_STATUS.CANCELLED } }
    );
    healed += res.modifiedCount || 0;
  }
  if (healed > 0) {
    LoggerService.warn(`Reset ${healed} stale in-flight stage(s) on cancelled course videos`);
  }
}

module.exports = {
  RETRY_SWEEP_MS,
  reapOrphanedAudioGenerations,
  reapStuckVideoJobs,
  recoverStrandedRetries,
  recoverStrandedCourseRetries,
  reapStuckCourseVideoJobs,
  healCancelledStageStatuses,
};
