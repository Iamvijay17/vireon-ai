const CourseVideo = require('../../../models/CourseVideo');
const LoggerService = require('../../common/LoggerService');
const SocketService = require('../../common/SocketService');
const courseQueue = require('../../../queues/courseQueue');
const { VIDEO_STATUS, STAGE_STATUS } = require('../../../constants');
const { ConflictError, NotFoundError, ValidationError } = require('../../../utils/errors');

// Which stage-status field each single-video generation action gates on.
// 'retry' has no field of its own - it re-runs whichever stage is
// recorded as failed, gated by video.status below instead.
const STAGE_FIELD_FOR_ACTION = {
  'generate-script': 'scriptStatus',
  'regenerate-script': 'scriptStatus',
  'generate-audio': 'audioStatus',
  render: 'videoStatus',
};

/**
 * The status a CANCELLED video had before it was stopped, inferred from its
 * completed stages. stop() only flips in-flight stages to Cancelled, so any
 * stage that already finished still reads Completed.
 */
function statusBeforeCancel(video) {
  if (video.videoStatus === STAGE_STATUS.COMPLETED) return VIDEO_STATUS.COMPLETED;
  if (video.audioStatus === STAGE_STATUS.COMPLETED) return VIDEO_STATUS.AUDIO_GENERATED;
  if (video.approved) return VIDEO_STATUS.APPROVED;
  if (video.script?.scenes?.length) return VIDEO_STATUS.WAITING_FOR_APPROVAL;
  return VIDEO_STATUS.DRAFT;
}

/**
 * Re-queueing a stopped lesson must also lift its overall CANCELLED status.
 * The worker's bailIfCancelled checkpoint (see shared.js) keys off
 * `status`, so a re-queued job against a still-CANCELLED video exits at once
 * without touching the stage - leaving the lesson stuck as Cancelled with
 * its stage Queued forever.
 */
async function liftCancelled(videoId) {
  const video = await CourseVideo.findById(videoId).select('status scriptStatus audioStatus videoStatus approved script.scenes');
  if (!video || video.status !== VIDEO_STATUS.CANCELLED) return;

  await CourseVideo.updateOne(
    { _id: videoId, status: VIDEO_STATUS.CANCELLED },
    { $set: { status: statusBeforeCancel(video), error: { message: '', step: '', retryCount: 0 } } }
  );
}

/**
 * Guard against double-dispatching the same generation action - e.g. a
 * double-clicked "Generate Script" button, or a retried frontend request,
 * queueing two BullMQ jobs for the same video/stage. With the worker at
 * concurrency:1 those would run back-to-back rather than in parallel, but
 * the second run still wastes an LLM/TTS/render call and can race writes
 * to the video document. Marks the stage Queued immediately (same as
 * prepareBulkJobs does for bulk actions) so a second call sees it's
 * already in flight and is rejected instead of piling on another job.
 */
async function claimStage(videoId, action) {
  const video = await CourseVideo.findById(videoId);
  if (!video) {
    throw new NotFoundError('Video not found');
  }

  if (action === 'retry') {
    if (video.status !== VIDEO_STATUS.FAILED) {
      throw new ConflictError(`Video is in ${video.status} state, not Failed`);
    }
    return video;
  }

  const field = STAGE_FIELD_FOR_ACTION[action];
  if (field) {
    const current = video[field];
    if (current === STAGE_STATUS.QUEUED || current === STAGE_STATUS.PROCESSING) {
      throw new ConflictError(`${action} is already ${current} for this video`);
    }
    if (video.status === VIDEO_STATUS.CANCELLED) {
      video.status = statusBeforeCancel(video);
      video.error = { message: '', step: '', retryCount: 0 };
    }
    video[field] = STAGE_STATUS.QUEUED;
    await video.save();
  }

  return video;
}

/**
 * Stop a running lesson. Marks it CANCELLED immediately and removes any
 * not-yet-started jobs for it from the queue (e.g. the audio/render legs
 * of a 'generate-full' chain that haven't run yet). If a stage is already
 * mid-flight, there's no way to kill the in-progress external call
 * directly - the worker itself checks for CANCELLED at each stage's
 * checkpoints (see bailIfCancelled in shared.js) and bails as soon as it
 * notices, same pattern as VideoService.stop for the standalone VideoJob
 * pipeline.
 */
async function stop(videoId) {
  const video = await CourseVideo.findById(videoId);
  if (!video) {
    throw new NotFoundError('Video not found');
  }

  const terminalStatuses = [VIDEO_STATUS.COMPLETED, VIDEO_STATUS.FAILED, VIDEO_STATUS.CANCELLED];
  if (terminalStatuses.includes(video.status)) {
    throw new ValidationError(`Video is in ${video.status} state and cannot be stopped - it isn't running.`);
  }

  const previousStatus = video.status;
  video.status = VIDEO_STATUS.CANCELLED;
  video.error = {
    message: 'Stopped by user',
    step: previousStatus,
    retryCount: video.error?.retryCount || 0,
  };
  // Mark whichever stage(s) were in flight as cancelled too, for the
  // per-stage Script/Audio/Video columns in the lesson table.
  const inFlightStages = [STAGE_STATUS.PROCESSING, STAGE_STATUS.QUEUED];
  if (inFlightStages.includes(video.scriptStatus)) video.scriptStatus = STAGE_STATUS.CANCELLED;
  if (inFlightStages.includes(video.audioStatus)) video.audioStatus = STAGE_STATUS.CANCELLED;
  if (inFlightStages.includes(video.videoStatus)) video.videoStatus = STAGE_STATUS.CANCELLED;
  await video.save();

  // Course jobs don't reuse the videoId as the BullMQ jobId (a single
  // video can have multiple jobs queued back-to-back for 'generate-full'),
  // so find not-yet-started jobs by their data.videoId instead of a
  // direct getJob(id) lookup.
  try {
    const waitingJobs = await courseQueue.getJobs(['waiting', 'delayed', 'paused']);
    const toRemove = waitingJobs.filter((j) => j.data?.videoId === videoId);
    await Promise.all(toRemove.map((j) => j.remove()));
    if (toRemove.length > 0) {
      LoggerService.info('Removed not-yet-started course video jobs from queue', { videoId, count: toRemove.length });
    }
  } catch (queueErr) {
    LoggerService.warn('Could not remove queued course video jobs during stop', { videoId, error: queueErr.message });
  }

  SocketService.emitCourseVideoProgress(video, VIDEO_STATUS.CANCELLED, 0, 'Stopped by user');
  LoggerService.info('Course video stopped by user', { videoId, previousStatus });

  return video;
}

/**
 * Mark the relevant stage(s) Queued for a batch of videos and return the
 * ordered list of {videoId, action} jobs the caller should push to the
 * queue. Used for both single-row and multi-row (bulk) generation from
 * the lesson table - a single video is just a 1-element videoIds array.
 *
 * For 'generate-full', all three stages are marked Queued immediately
 * (they genuinely are, right away) and one video's script/audio/render
 * jobs are kept contiguous in the returned list. Combined with the
 * course-video-processing queue running at concurrency:1, this makes
 * audio start only once that same video's script job has fully finished,
 * without needing a dedicated composite worker action.
 */
async function prepareBulkJobs(videoIds, action) {
  const stageActions = action === 'generate-full'
    ? ['generate-script', 'generate-audio', 'render']
    : [action];

  const stageField = {
    'generate-script': 'scriptStatus',
    'generate-audio': 'audioStatus',
    render: 'videoStatus',
  };

  // Videos that don't meet the queued stage's prerequisite (script
  // approved before audio, audio present before render) are skipped
  // rather than queued - the server-side backstop for the same gating the
  // lesson table's buttons apply client-side, so it holds even if a
  // request bypasses the UI. 'generate-script'/'generate-full' have no
  // prerequisite since they start the pipeline from the beginning.
  const jobs = [];
  const skipped = [];
  for (const videoId of videoIds) {
    const video = await CourseVideo.findById(videoId).select('approved audioUrl');
    if (!video) {
      skipped.push({ videoId, reason: 'Video not found' });
      continue;
    }
    if (action === 'generate-audio' && !video.approved) {
      skipped.push({ videoId, reason: 'Script must be approved before generating audio' });
      continue;
    }
    if (action === 'render' && !video.audioUrl) {
      skipped.push({ videoId, reason: 'Audio must be generated before rendering' });
      continue;
    }

    const updateData = {};
    for (const a of stageActions) {
      updateData[stageField[a]] = STAGE_STATUS.QUEUED;
      jobs.push({ videoId, action: a });
    }
    await liftCancelled(videoId);
    await CourseVideo.findByIdAndUpdate(videoId, { $set: updateData });
  }

  return { jobs, skipped };
}

module.exports = { claimStage, stop, prepareBulkJobs };
