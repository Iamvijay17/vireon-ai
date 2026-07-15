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
  static async create(data) {
    const job = await VideoJob.create({
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
   * Get all jobs with pagination.
   */
  static async getAllJobs(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [jobs, total] = await Promise.all([
      VideoJob.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      VideoJob.countDocuments(),
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
  static async getById(jobId) {
    const job = await VideoJob.findById(jobId);
    if (!job) {
      throw { status: 404, message: 'Job not found' };
    }
    return job;
  }

  /**
   * Delete a job.
   */
  static async delete(jobId) {
    const job = await VideoJob.findByIdAndDelete(jobId);
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

  /**
   * Map error step to resume status.
   * When a step fails, we resume from the beginning of that step.
   */
  static getResumeStep(job) {
    const failedStep = job.error?.step;

    // Map error step to resume status
    // When a step fails, we resume from that same step to retry it
    const stepStatusMap = {
      [JOB_STATUS.SCRIPT_GENERATION]: { status: JOB_STATUS.QUEUED, progress: 0 },
      [JOB_STATUS.SCRIPT_COMPLETED]: { status: JOB_STATUS.QUEUED, progress: 0 },
      [JOB_STATUS.GENERATING_AUDIO]: { status: JOB_STATUS.GENERATING_AUDIO, progress: 40 },
      [JOB_STATUS.AUDIO_COMPLETED]: { status: JOB_STATUS.PREPARING_ASSETS, progress: 60 },
      [JOB_STATUS.PREPARING_ASSETS]: { status: JOB_STATUS.PREPARING_ASSETS, progress: 60 },
      [JOB_STATUS.RENDERING]: { status: JOB_STATUS.RENDERING, progress: 80 },
      [JOB_STATUS.UPLOADING]: { status: JOB_STATUS.UPLOADING, progress: 90 },
    };

    // If we have specific error step info, use it
    if (failedStep && stepStatusMap[failedStep]) {
      LoggerService.info('Resuming from failed step', {
        failedStep,
        resumeStatus: stepStatusMap[failedStep].status,
      });
      
      return {
        status: stepStatusMap[failedStep].status,
        progress: stepStatusMap[failedStep].progress,
        currentStep: stepStatusMap[failedStep].status,
      };
    }

    // Fallback: Determine based on job state (script and audio files)
    if (job.script?.scenes?.length > 0) {
      // Check if any audio files exist - if so, we can resume from audio step
      const scenesWithAudio = job.script.scenes.filter(s => s.audio?.file);
      
      if (scenesWithAudio.length === job.script.scenes.length) {
        // All audio done - resume from PREPARING_ASSETS
        return {
          status: JOB_STATUS.PREPARING_ASSETS,
          progress: 60,
          currentStep: JOB_STATUS.PREPARING_ASSETS,
        };
      }
      
      // Some or no audio - resume from GENERATING_AUDIO
      return {
        status: JOB_STATUS.GENERATING_AUDIO,
        progress: 40,
        currentStep: JOB_STATUS.GENERATING_AUDIO,
      };
    }
    
    // No script - start from beginning
    return {
      status: JOB_STATUS.QUEUED,
      progress: 0,
      currentStep: JOB_STATUS.QUEUED,
    };
  }

  /**
   * Restart a failed job - resume from the failed step.
   */
  static async restart(jobId) {
    const job = await VideoJob.findById(jobId);
    if (!job) {
      throw { status: 404, message: 'Job not found' };
    }

    if (job.status !== JOB_STATUS.FAILED) {
      throw { status: 400, message: `Job is not in FAILED state (current: ${job.status})` };
    }

    // Determine resume step based on job state
    const resumeInfo = this.getResumeStep(job);

    // Update job to resume from the appropriate step
    const updatedJob = await VideoJob.findByIdAndUpdate(
      jobId,
      {
        status: resumeInfo.status,
        progress: resumeInfo.progress,
        currentStep: resumeInfo.currentStep,
        error: undefined,
      },
      { new: true }
    );

    LoggerService.info('Video job restarted', {
      jobId,
      resumeStep: resumeInfo.status,
      failedStep: job.error?.step,
      hadScript: !!job.script?.scenes?.length,
      scenesWithAudio: job.script?.scenes?.filter(s => s.audio?.file)?.length || 0,
    });
    return updatedJob;
  }
}

module.exports = VideoService;
