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
   * Update scene image URL.
   */
  static async updateSceneImage(jobId, sceneNumber, imageData) {
    const job = await VideoJob.findById(jobId);
    if (!job) throw { status: 404, message: 'Job not found' };

    const scene = job.script.scenes.find((s) => s.sceneNumber === sceneNumber);
    if (scene) {
      scene.imageUrl = imageData.imageUrl;
    }

    await job.save();
    return job;
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
      // The audio file duration is the actual scene duration
      scene.duration = audioData.duration;
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
   * Re-render a completed job - resets to PREPARING_ASSETS state
   * so the pipeline re-runs from assets preparation, rendering, and upload.
   * Keeps the existing script and audio data intact.
   */
  static async rerender(jobId) {
    const job = await VideoJob.findById(jobId);
    if (!job) {
      throw { status: 404, message: 'Job not found' };
    }

    // Only allow re-render from COMPLETED or FAILED states
    const rerenderableStates = [JOB_STATUS.COMPLETED, JOB_STATUS.FAILED];
    if (!rerenderableStates.includes(job.status)) {
      throw { status: 400, message: `Job is in ${job.status} state and cannot be re-rendered. Only COMPLETED or FAILED jobs can be re-rendered.` };
    }

    // Clean up old render and assets files so the worker re-creates them
    const fs = require('fs').promises;
    const path = require('path');
    const jobDir = path.resolve(__dirname, '../../jobs', jobId);
    const renderDir = path.join(jobDir, 'render');
    const assetsPath = path.join(jobDir, 'assets.json');
    const propsPath = path.join(jobDir, 'render-props.json');

    // Delete render output and assets (keep audio and script)
    try { await fs.rm(renderDir, { recursive: true, force: true }); } catch {}
    try { await fs.unlink(assetsPath); } catch {}
    try { await fs.unlink(propsPath); } catch {}

    // Reset to PREPARING_ASSETS - keeps script and audio, re-runs from assets prep
    const updatedJob = await VideoJob.findByIdAndUpdate(
      jobId,
      {
        status: JOB_STATUS.PREPARING_ASSETS,
        progress: 60,
        currentStep: JOB_STATUS.PREPARING_ASSETS,
        error: undefined,
        videoUrl: '',
        thumbnailUrl: '',
        scriptUrl: '',
        audioUrls: [],
        assetsUrl: '',
      },
      { new: true }
    );

    LoggerService.info('Video job re-rendering', {
      jobId,
      originalStatus: job.status,
      resumeStep: JOB_STATUS.PREPARING_ASSETS,
    });

    return updatedJob;
  }

  /**
   * Map step to resume status for jobs that are stuck.
   * When a job is stuck in a processing state, we resume from the next step.
   */
  static getStepForResume(job) {
    const currentStep = job.status;

    // Map current step to the next step to resume from
    const stepStatusMap = {
      [JOB_STATUS.SCRIPT_GENERATION]: { status: JOB_STATUS.QUEUED, progress: 0 },
      [JOB_STATUS.SCRIPT_COMPLETED]: { status: JOB_STATUS.SCRIPT_COMPLETED, progress: 20 },
      [JOB_STATUS.GENERATING_AUDIO]: { status: JOB_STATUS.GENERATING_AUDIO, progress: 40 },
      [JOB_STATUS.AUDIO_COMPLETED]: { status: JOB_STATUS.AUDIO_COMPLETED, progress: 50 },
      [JOB_STATUS.PREPARING_ASSETS]: { status: JOB_STATUS.PREPARING_ASSETS, progress: 60 },
      [JOB_STATUS.RENDERING]: { status: JOB_STATUS.RENDERING, progress: 80 },
      [JOB_STATUS.UPLOADING]: { status: JOB_STATUS.UPLOADING, progress: 90 },
    };

    // If we have specific current step info, use it
    if (stepStatusMap[currentStep]) {
      LoggerService.info('Resuming from current step', {
        currentStep,
        resumeStatus: stepStatusMap[currentStep].status,
      });

      return {
        status: stepStatusMap[currentStep].status,
        progress: stepStatusMap[currentStep].progress,
        currentStep: stepStatusMap[currentStep].status,
      };
    }

    // Fallback: Determine based on job state (script and audio files)
    if (job.script?.scenes?.length > 0) {
      const scenesWithAudio = job.script.scenes.filter(s => s.audio?.file);

      if (scenesWithAudio.length === job.script.scenes.length) {
        return {
          status: JOB_STATUS.PREPARING_ASSETS,
          progress: 60,
          currentStep: JOB_STATUS.PREPARING_ASSETS,
        };
      }

      return {
        status: JOB_STATUS.GENERATING_AUDIO,
        progress: 40,
        currentStep: JOB_STATUS.GENERATING_AUDIO,
      };
    }

    return {
      status: JOB_STATUS.QUEUED,
      progress: 0,
      currentStep: JOB_STATUS.QUEUED,
    };
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
      const scenesWithAudio = job.script.scenes.filter(s => s.audio?.file);

      if (scenesWithAudio.length === job.script.scenes.length) {
        return {
          status: JOB_STATUS.PREPARING_ASSETS,
          progress: 60,
          currentStep: JOB_STATUS.PREPARING_ASSETS,
        };
      }

      return {
        status: JOB_STATUS.GENERATING_AUDIO,
        progress: 40,
        currentStep: JOB_STATUS.GENERATING_AUDIO,
      };
    }

    return {
      status: JOB_STATUS.QUEUED,
      progress: 0,
      currentStep: JOB_STATUS.QUEUED,
    };
  }

  /**
   * Restart a failed or stuck job - resume from the appropriate step.
   */
  static async restart(jobId) {
    const job = await VideoJob.findById(jobId);
    if (!job) {
      throw { status: 404, message: 'Job not found' };
    }

    // Only allow restart from FAILED or stuck processing states
    const nonRestartableStates = [JOB_STATUS.COMPLETED];
    if (nonRestartableStates.includes(job.status)) {
      throw { status: 400, message: `Job is in ${job.status} state and cannot be restarted` };
    }

    // If job is in FAILED state, use error step to determine resume point
    // If job is stuck in a processing state, use current status to determine resume point
    const resumeInfo = job.status === JOB_STATUS.FAILED
      ? this.getResumeStep(job)
      : this.getStepForResume(job);

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
      originalStatus: job.status,
      failedStep: job.error?.step,
      hadScript: !!job.script?.scenes?.length,
      scenesWithAudio: job.script?.scenes?.filter(s => s.audio?.file)?.length || 0,
    });
    return updatedJob;
  }
}

module.exports = VideoService;