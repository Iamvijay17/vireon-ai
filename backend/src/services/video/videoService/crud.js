const VideoJob = require('../../../models/VideoJob');
const LoggerService = require('../../common/LoggerService');
const JobEventService = require('../../common/JobEventService');
const {
  JOB_STATUS,
  getAspectRatioForResolution,
  STANDALONE_VIDEO_DURATIONS,
  SHORTS_VIDEO_DURATIONS,
} = require('../../../constants');
const { NotFoundError, ValidationError } = require('../../../utils/errors');

// A job actively being worked on by the worker can't have its details
// edited underneath it - the same "actively processing" concern as
// restart/regenerateScript, but for every processing stage rather than just
// the active-BullMQ-lock check (editing during a paused stage like
// AWAITING_APPROVAL or AUDIO_COMPLETED is fine and expected).
const BUSY_STATUSES = [
  JOB_STATUS.SCRIPT_GENERATION,
  JOB_STATUS.GENERATING_AUDIO,
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
    quality: data.quality || 'standard',
    // Not user-selectable - resolution alone determines it.
    aspectRatio: getAspectRatioForResolution(data.resolution || '1920x1080'),
    fontPairing: data.fontPairing || 'default',
    captionAnimation: data.captionAnimation || 'fadeInUp',
    fastGeneration: data.fastGeneration ?? true,
    fastAudio: data.fastAudio ?? false,
    voiceProfile: data.voiceProfile || '',
    voiceStyle: data.voiceStyle || '',
    status: JOB_STATUS.QUEUED,
    progress: 0,
  });

  LoggerService.info('Video job created', {
    jobId: job._id,
    type: job.type,
    topic: job.topic,
  });

  return job;
}

/**
 * Aggregation pipeline for the list endpoint. A job's `script` (every scene's
 * narration/visual prompts) is ~90% of its size and `statusHistory` another
 * ~7%, but list pages only need whether scenes exist and which have audio
 * (see frontend v2/lib/pipelineStages.js, render/RenderQueue.jsx). Trimming it
 * here, inside the query, also cuts the Atlas -> server transfer, not just the
 * response to the browser. The full document is still served by getById.
 */
function buildListPipeline(query, skip, limit) {
  return [
    { $match: query },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $addFields: {
        script: {
          $cond: [
            { $ifNull: ['$script', false] },
            {
              $mergeObjects: [
                '$script',
                {
                  scenes: {
                    $map: {
                      input: { $ifNull: ['$script.scenes', []] },
                      as: 'scene',
                      in: { sceneNumber: '$$scene.sceneNumber', audio: { file: '$$scene.audio.file' } },
                    },
                  },
                },
              ],
            },
            '$$REMOVE',
          ],
        },
      },
    },
    { $project: { statusHistory: 0 } },
  ];
}

/**
 * Get all jobs with pagination (slimmed list items - see buildListPipeline).
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
    VideoJob.aggregate(buildListPipeline(query, skip, limit)),
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
    throw new NotFoundError('Job not found');
  }
  return job;
}

/**
 * Delete a job.
 */
async function deleteJob(jobId) {
  const job = await VideoJob.findByIdAndDelete(jobId);
  if (!job) {
    throw new NotFoundError('Job not found or already deleted');
  }

  await JobEventService.deleteByJob(jobId);

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
    throw new NotFoundError('No jobs found to delete');
  }

  await JobEventService.deleteByJob(jobIds);

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
    throw new NotFoundError('Job not found');
  }

  if (BUSY_STATUSES.includes(job.status)) {
    throw new ValidationError(`Job is actively processing (${job.status}) and can't be edited right now.`);
  }

  // `type` isn't editable, so duration/resolution are re-validated against
  // the job's existing type - mirrors createVideoSchema's superRefine.
  const duration = updates.duration ?? job.duration;
  const resolution = updates.resolution ?? job.resolution;
  if (job.type === 'youtube_shorts') {
    if (!SHORTS_VIDEO_DURATIONS.includes(duration)) {
      throw new ValidationError(`YouTube Shorts duration must be one of: ${SHORTS_VIDEO_DURATIONS.join(', ')}`);
    }
    if (getAspectRatioForResolution(resolution) !== '9:16') {
      throw new ValidationError('YouTube Shorts must use a vertical resolution');
    }
  } else if (!STANDALONE_VIDEO_DURATIONS.includes(duration)) {
    throw new ValidationError(`Duration must be one of: ${STANDALONE_VIDEO_DURATIONS.join(', ')}`);
  }

  if (job.type === 'podcast') {
    const hostVoice = updates.hostVoice ?? job.hostVoice;
    const guestVoice = updates.guestVoice ?? job.guestVoice;
    if (!hostVoice) throw new ValidationError('Host voice is required for podcast videos');
    if (!guestVoice) throw new ValidationError('Guest voice is required for podcast videos');
  }

  Object.assign(job, updates);
  job.duration = duration;
  job.resolution = resolution;

  job.aspectRatio = getAspectRatioForResolution(resolution);
  await job.save();

  LoggerService.info('Video job details updated', { jobId, fields: Object.keys(updates) });
  return job;
}

module.exports = {
  BUSY_STATUSES,
  create,
  getAllJobs,
  buildListPipeline,
  getById,
  delete: deleteJob,
  bulkDelete,
  update,
};
