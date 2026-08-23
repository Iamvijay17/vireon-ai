const VideoJob = require('../../../models/VideoJob');
const LoggerService = require('../../common/LoggerService');
const {
  JOB_STATUS,
  getAspectRatioForResolution,
  STANDALONE_VIDEO_DURATIONS,
  SHORTS_VIDEO_DURATIONS,
} = require('../../../constants');

// A job actively being worked on by the worker can't have its details
// edited underneath it - the same "actively processing" concern as
// restart/regenerateScript, but for every processing stage rather than just
// the active-BullMQ-lock check (editing during a paused stage like
// AWAITING_APPROVAL or AUDIO_COMPLETED is fine and expected).
const BUSY_STATUSES = [
  JOB_STATUS.SCRIPT_GENERATION,
  JOB_STATUS.GENERATING_AUDIO,
  JOB_STATUS.GENERATING_AVATAR,
  JOB_STATUS.GENERATING_IMAGES,
  JOB_STATUS.PREPARING_ASSETS,
  JOB_STATUS.RENDERING,
  JOB_STATUS.UPLOADING,
];

/**
 * Create a new video job.
 */
async function create(data) {
  const job = await VideoJob.create({
    topic: data.topic,
    type: data.type,
    language: data.language || 'english',
    voice: data.voice || 'female-1',
    hostVoice: data.hostVoice || '',
    guestVoice: data.guestVoice || '',
    hostName: data.hostName || '',
    guestName: data.guestName || '',
    duration: data.duration || 5,
    resolution: data.resolution || '1920x1080',
    // Not user-selectable - resolution alone determines it.
    aspectRatio: getAspectRatioForResolution(data.resolution || '1920x1080'),
    fastGeneration: data.fastGeneration ?? true,
    fastAudio: data.fastAudio ?? false,
    avatarEnabled: data.avatarEnabled ?? false,
    avatarPosition: data.avatarEnabled ? data.avatarPosition || 'bottom-right' : null,
    status: JOB_STATUS.QUEUED,
    progress: 0,
  });

  LoggerService.info('Video job created', {
    jobId: job._id,
    type: job.type,
    topic: job.topic,
    avatarEnabled: job.avatarEnabled,
  });

  return job;
}

/**
 * Get all jobs with pagination.
 */
async function getAllJobs(page = 1, limit = 20, filters = {}) {
  const skip = (page - 1) * limit;
  const query = {};

  if (filters.status) {
    query.status = filters.status;
  }
  if (filters.type) {
    query.type = filters.type;
  }
  if (filters.search) {
    query.topic = { $regex: filters.search, $options: 'i' };
  }

  const [jobs, total] = await Promise.all([
    VideoJob.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    VideoJob.countDocuments(query),
  ]);

  return {
    jobs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get a single job by ID.
 */
async function getById(jobId) {
  const job = await VideoJob.findById(jobId);
  if (!job) {
    throw { status: 404, message: 'Job not found' };
  }
  return job;
}

/**
 * Delete a job.
 */
async function deleteJob(jobId) {
  const job = await VideoJob.findByIdAndDelete(jobId);
  if (!job) {
    throw { status: 404, message: 'Job not found or already deleted' };
  }

  LoggerService.info('Video job deleted', { jobId });
  return { message: 'Job deleted successfully' };
}

/**
 * Delete multiple jobs at once. Used by the dashboard's bulk action bar -
 * a single job is just a 1-element jobIds array.
 */
async function bulkDelete(jobIds) {
  const result = await VideoJob.deleteMany({ _id: { $in: jobIds } });
  if (result.deletedCount === 0) {
    throw { status: 404, message: 'No jobs found to delete' };
  }

  LoggerService.info('Bulk video jobs deleted', {
    requested: jobIds.length,
    deleted: result.deletedCount,
  });

  return { message: 'Jobs deleted successfully', deletedCount: result.deletedCount };
}

/**
 * Update editable job details (topic, duration, language, voice(s),
 * names, resolution). Doesn't touch anything already generated - the
 * caller should regenerate the relevant stage afterward if they want it
 * to reflect the new values, same as course videos' edit modal.
 */
async function update(jobId, updates) {
  const job = await VideoJob.findById(jobId);
  if (!job) {
    throw { status: 404, message: 'Job not found' };
  }

  if (BUSY_STATUSES.includes(job.status)) {
    throw { status: 400, message: `Job is actively processing (${job.status}) and can't be edited right now.` };
  }

  // `type` isn't editable, so duration/resolution are re-validated against
  // the job's existing type - mirrors createVideoSchema's superRefine.
  const duration = updates.duration ?? job.duration;
  const resolution = updates.resolution ?? job.resolution;
  if (job.type === 'youtube_shorts') {
    if (!SHORTS_VIDEO_DURATIONS.includes(duration)) {
      throw { status: 400, message: `YouTube Shorts duration must be one of: ${SHORTS_VIDEO_DURATIONS.join(', ')}` };
    }
    if (getAspectRatioForResolution(resolution) !== '9:16') {
      throw { status: 400, message: 'YouTube Shorts must use a vertical resolution' };
    }
  } else if (!STANDALONE_VIDEO_DURATIONS.includes(duration)) {
    throw { status: 400, message: `Duration must be one of: ${STANDALONE_VIDEO_DURATIONS.join(', ')}` };
  }

  if (job.type === 'podcast') {
    const hostVoice = updates.hostVoice ?? job.hostVoice;
    const guestVoice = updates.guestVoice ?? job.guestVoice;
    if (!hostVoice) throw { status: 400, message: 'Host voice is required for podcast videos' };
    if (!guestVoice) throw { status: 400, message: 'Guest voice is required for podcast videos' };
  }

  // Whether the currently-generated avatar clip (if any) is still valid:
  // only when the avatar stays enabled and the voice - which determines
  // which default portrait's gender it was animated from - hasn't
  // changed. Any other transition (freshly enabling, disabling, or a
  // voice change while enabled) invalidates it, so the next render
  // regenerates via AvatarService (see videoWorker.js's GENERATING_AVATAR
  // step and AvatarService.resolveDefaultSourceImage).
  const wasAvatarEnabled = job.avatarEnabled;
  const previousVoice = job.voice;

  Object.assign(job, updates);
  job.duration = duration;
  job.resolution = resolution;

  if (job.avatarEnabled && !job.avatarPosition) {
    job.avatarPosition = 'bottom-right';
  }
  const keepExistingAvatarClip = job.avatarEnabled && wasAvatarEnabled && job.voice === previousVoice;
  if (!keepExistingAvatarClip) {
    job.avatarVideoUrl = '';
  }
  job.aspectRatio = getAspectRatioForResolution(resolution);
  await job.save();

  LoggerService.info('Video job details updated', { jobId, fields: Object.keys(updates) });
  return job;
}

module.exports = {
  BUSY_STATUSES,
  create,
  getAllJobs,
  getById,
  delete: deleteJob,
  bulkDelete,
  update,
};
