const VideoJob = require('../models/VideoJob');
const LoggerService = require('./LoggerService');
const { JOB_STATUS } = require('../constants');

/**
 * Service for managing video jobs.
 * Single Responsibility: Video job CRUD and lifecycle management.
 */
class VideoService {
  /**
   * Create a new video job.
   */
  static async create(userId, data) {
    const job = await VideoJob.create({
      userId,
      topic: data.topic,
      type: data.type,
      language: data.language || 'english',
      voice: data.voice || 'female-1',
      resolution: data.resolution || '1920x1080',
      aspectRatio: data.aspectRatio || '16:9',
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
   * Get all jobs for a user with pagination.
   */
  static async getUserJobs(userId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [jobs, total] = await Promise.all([
      VideoJob.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      VideoJob.countDocuments({ userId }),
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
  static async getById(jobId, userId) {
    const query = { _id: jobId };
    if (userId) query.userId = userId;

    const job = await VideoJob.findOne(query);
    if (!job) {
      throw { status: 404, message: 'Job not found' };
    }
    return job;
  }

  /**
   * Delete a job.
   */
  static async delete(jobId, userId) {
    const job = await VideoJob.findOneAndDelete({ _id: jobId, userId });
    if (!job) {
      throw { status: 404, message: 'Job not found or already deleted' };
    }

    LoggerService.info('Video job deleted', { jobId });
    return { message: 'Job deleted successfully' };
  }

  /**
   * Update job status with progress.
   */
  static async updateStatus(jobId, status, extra = {}) {
    const update = {
      status,
      progress: extra.progress ?? 0,
      currentStep: status,
      ...extra,
    };

    if (extra.error) {
      update.error = {
        message: extra.error,
        step: status,
        retryCount: extra.retryCount || 0,
      };
    }

    const job = await VideoJob.findByIdAndUpdate(jobId, update, { new: true });
    return job;
  }

  /**
   * Update job with script data.
   */
  static async updateScript(jobId, script) {
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
   * Update scene audio data.
   */
  static async updateSceneAudio(jobId, sceneNumber, audioData) {
    const job = await VideoJob.findById(jobId);
    if (!job) throw { status: 404, message: 'Job not found' };

    const scene = job.script.scenes.find((s) => s.sceneNumber === sceneNumber);
    if (scene) {
      scene.audio.file = audioData.file;
      scene.audio.duration = audioData.duration;
    }

    await job.save();
    return job;
  }

  /**
   * Complete a job with final URLs.
   */
  static async complete(jobId, urls) {
    return VideoJob.findByIdAndUpdate(
      jobId,
      {
        status: JOB_STATUS.COMPLETED,
        progress: 100,
        currentStep: JOB_STATUS.COMPLETED,
        videoUrl: urls.videoUrl || '',
        thumbnailUrl: urls.thumbnailUrl || '',
        scriptUrl: urls.scriptUrl || '',
        audioUrls: urls.audioUrls || [],
        assetsUrl: urls.assetsUrl || '',
      },
      { new: true }
    );
  }

  /**
   * Mark job as failed.
   */
  static async fail(jobId, errorMessage, step) {
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
}

module.exports = VideoService;
