const JobAggregatorService = require('../services/job/jobAggregatorService');
const VideoService = require('../services/video/VideoService');
const CourseService = require('../services/course/CourseService');
const CourseVideoService = require('../services/course/CourseVideoService');
const AudioGeneration = require('../models/AudioGeneration');
const ActivityLogService = require('../services/common/ActivityLogService');
const { getPipelineTimeline } = require('../services/video/videoService/pipelineTimeline');
const videoQueue = require('../queues/videoQueue');
const LoggerService = require('../services/common/LoggerService');
const SocketService = require('../services/common/SocketService');
const { getStorageProvider } = require('../services/storage/providers');
const { ValidationError, NotFoundError } = require('../utils/errors');
const path = require('path');
const fs = require('fs').promises;

const VALID_TYPES = ['video', 'course', 'audio'];

function assertValidType(type) {
  if (!VALID_TYPES.includes(type)) {
    throw new ValidationError(`Invalid job type "${type}" - must be one of: ${VALID_TYPES.join(', ')}`);
  }
}

/**
 * Cancel a single job of the given type. Reuses each type's own
 * stop/cancel logic (queue interaction, ActivityLog, socket emits) rather
 * than reimplementing it - see videoController.stop / CourseController.stop
 * for the source of truth this mirrors.
 */
async function cancelOne(type, id) {
  assertValidType(type);

  if (type === 'video') {
    const job = await VideoService.stop(id);
    await ActivityLogService.add(id, 'Stopped by user');
    try {
      const bullJob = await videoQueue.getJob(id);
      if (bullJob) {
        const state = await bullJob.getState();
        if (['waiting', 'delayed', 'paused'].includes(state)) {
          await bullJob.remove();
        }
      }
    } catch (queueErr) {
      LoggerService.warn('Could not remove queued job during cancel', { jobId: id, error: queueErr.message });
    }
    SocketService.emitJobProgress(job);
    return job;
  }

  if (type === 'course') {
    return CourseService.stopAll(id);
  }

  throw { status: 400, message: 'Cancel is not supported for audio jobs (generation is synchronous)' };
}

/**
 * Retry/restart a single job of the given type. Only video jobs support a
 * unified retry today - course retry stays per-lesson (existing
 * /api/course-videos/:id/retry) since a course has no single "retry
 * everything" concept, and audio generation has no retry concept at all.
 */
async function retryOne(type, id) {
  assertValidType(type);

  if (type === 'video') {
    const existingBullJob = await videoQueue.getJob(id);
    if (existingBullJob && (await existingBullJob.getState()) === 'active') {
      throw { status: 400, message: 'Job is still actively being processed and cannot be restarted.' };
    }
    const job = await VideoService.restart(id);
    await ActivityLogService.add(id, 'Job restarted');
    SocketService.emitJobCreated(job);

    try {
      const existing = await videoQueue.getJob(id);
      if (existing) await existing.remove();
    } catch (err) {
      LoggerService.warn('Could not clear prior BullMQ record before re-queueing', { jobId: id, error: err.message });
    }
    await videoQueue.add('render-video', { jobId: id }, { jobId: id });
    return job;
  }

  throw { status: 400, message: `Retry is not supported for ${type} jobs from Job Management - use the ${type} page's own retry action` };
}

/**
 * Delete a single job of the given type, mirroring each type's own delete
 * endpoint (VideoController.delete / CourseController.delete / AudioController.remove).
 */
async function deleteOne(type, id) {
  assertValidType(type);

  if (type === 'video') {
    return VideoService.delete(id);
  }
  if (type === 'course') {
    return CourseService.delete(id);
  }

  const record = await AudioGeneration.findByIdAndDelete(id);
  if (!record) {
    throw new NotFoundError('Audio generation not found');
  }
  const audioDir = path.resolve(__dirname, '../../jobs/audio-studio', id);
  await fs.rm(audioDir, { recursive: true, force: true }).catch(() => {});
  await getStorageProvider().deleteJob(id).catch(() => {});
  return { message: 'Audio generation deleted' };
}

class JobController {
  /**
   * GET /api/jobs - Unified job list across video/course/audio jobs.
   */
  static async list(req, res, next) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;
      const { type, status, search } = req.query;

      if (type) assertValidType(type);

      const result = await JobAggregatorService.listJobs({ type, status, search, page, limit });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/jobs/:type/:id - Unified job detail. Video jobs include their
   * ActivityLog timeline; courses include their lesson list instead (no
   * single activity log spans a whole course); audio has neither.
   */
  static async getById(req, res, next) {
    try {
      const { type, id } = req.params;
      assertValidType(type);

      if (type === 'video') {
        const job = await VideoService.getById(id);
        const logs = await ActivityLogService.getByVideo(id);
        const pipeline = await getPipelineTimeline(job);
        return res.json({ job: JobAggregatorService.normalizeVideo(job), logs, pipeline });
      }

      if (type === 'course') {
        const { course, videoStatusSummary } = await CourseService.getById(id);
        const { videos } = await CourseVideoService.getByCourse(id, 1, 200);
        return res.json({
          job: JobAggregatorService.normalizeCourse(course),
          videoStatusSummary,
          lessons: videos,
        });
      }

      const record = await AudioGeneration.findById(id).lean();
      if (!record) {
        throw new NotFoundError('Audio generation not found');
      }
      return res.json({ job: JobAggregatorService.normalizeAudio(record), logs: [] });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/jobs/:type/:id/cancel
   */
  static async cancel(req, res, next) {
    try {
      const { type, id } = req.params;
      const job = await cancelOne(type, id);
      res.json({ job });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/jobs/:type/:id/retry
   */
  static async retry(req, res, next) {
    try {
      const { type, id } = req.params;
      const job = await retryOne(type, id);
      res.json({ job });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/jobs/bulk - body: { jobs: [{type, id}], action: 'cancel'|'retry'|'delete' }
   * Dispatches each item to the matching single-item handler above and
   * reports per-item success/failure, same "X/Y succeeded" shape the
   * frontend already shows for RenderQueue's bulk stop/regenerate.
   */
  static async bulkAction(req, res, next) {
    try {
      const { jobs, action } = req.body;
      if (!Array.isArray(jobs) || jobs.length === 0) {
        throw { status: 400, message: 'jobs must be a non-empty array of { type, id }' };
      }
      if (!['cancel', 'retry', 'delete'].includes(action)) {
        throw { status: 400, message: 'action must be one of: cancel, retry, delete' };
      }

      const handler = { cancel: cancelOne, retry: retryOne, delete: deleteOne }[action];
      const results = await Promise.allSettled(jobs.map((j) => handler(j.type, j.id)));

      const succeeded = [];
      const failed = [];
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          succeeded.push(jobs[i]);
        } else {
          failed.push({ ...jobs[i], message: result.reason?.message || 'Unknown error' });
        }
      });

      res.json({ succeeded, failed });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = JobController;
