const CourseVideoService = require('../services/CourseVideoService');
const ActivityLogService = require('../services/ActivityLogService');
const courseQueue = require('../queues/courseQueue');
const LoggerService = require('../services/LoggerService');
const SocketService = require('../services/SocketService');
const { SOCKET_EVENTS } = require('../constants');

const VALID_BULK_ACTIONS = ['generate-script', 'generate-audio', 'render', 'generate-full'];

class CourseVideoController {
  /**
   * GET /api/course-videos/worker-status - Whether a course-video worker
   * process is currently listening on the queue. Backs the frontend's
   * running/offline indicator.
   */
  static async workerStatus(req, res, next) {
    try {
      const workers = await courseQueue.getWorkers();
      res.json({ running: workers.length > 0, count: workers.length });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/course-videos/bulk-generate - Queue a generation action for
   * one or more lessons. Used by both single-row and multi-row (bulk)
   * actions in the lesson table - a single lesson is just a 1-element
   * videoIds array. Marks the relevant stage(s) Queued immediately, then
   * dispatches jobs to the worker queue in order (one video's jobs stay
   * contiguous so, with the worker at concurrency:1, 'generate-full'
   * naturally chains script -> audio -> render per video).
   */
  static async bulkGenerate(req, res, next) {
    try {
      const { videoIds, action } = req.body;

      if (!Array.isArray(videoIds) || videoIds.length === 0) {
        throw { status: 400, message: 'videoIds must be a non-empty array' };
      }
      if (!VALID_BULK_ACTIONS.includes(action)) {
        throw { status: 400, message: `action must be one of: ${VALID_BULK_ACTIONS.join(', ')}` };
      }

      const jobs = await CourseVideoService.prepareBulkJobs(videoIds, action);

      for (const job of jobs) {
        await courseQueue.add(job.action, { videoId: job.videoId, action: job.action });
      }

      LoggerService.info('Bulk course video generation queued', {
        videos: videoIds.length,
        action,
        jobs: jobs.length,
      });

      res.json({ queued: videoIds.length, jobs: jobs.length });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/course-videos/:id - Get a single video
   */
  static async getById(req, res, next) {
    try {
      const video = await CourseVideoService.getById(req.params.id);
      res.json({ video });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/course-videos/:id - Update a video
   */
  static async update(req, res, next) {
    try {
      const video = await CourseVideoService.update(req.params.id, req.body);
      res.json({ video });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/course-videos/:id - Delete a video
   */
  static async delete(req, res, next) {
    try {
      const video = await CourseVideoService.getById(req.params.id);
      const courseId = video.courseId.toString();

      const result = await CourseVideoService.delete(req.params.id);

      SocketService.emitToCourse(courseId, SOCKET_EVENTS.COURSE_VIDEO_DELETED, {
        videoId: req.params.id,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/course-videos/:id/generate-script - Generate script
   * Dispatches to BullMQ worker - returns immediately.
   */
  static async generateScript(req, res, next) {
    try {
      const video = await CourseVideoService.getById(req.params.id);

      // Dispatch to worker queue instead of running in API process
      await courseQueue.add('generate-script', {
        videoId: req.params.id,
        action: 'generate-script',
      });

      LoggerService.info('Course video script generation dispatched to worker', {
        videoId: req.params.id,
      });

      res.json({
        videoId: video._id,
        status: 'Queued',
        message: 'Script generation has been queued',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/course-videos/:id/approve-script - Approve script
   */
  static async approveScript(req, res, next) {
    try {
      const video = await CourseVideoService.approveScript(req.params.id);
      res.json({ video });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/course-videos/:id/script - Update script (edit)
   */
  static async updateScript(req, res, next) {
    try {
      const { script } = req.body;
      const video = await CourseVideoService.updateScript(req.params.id, script);
      res.json({ video });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/course-videos/:id/regenerate-script - Regenerate script
   * Dispatches to BullMQ worker - returns immediately.
   */
  static async regenerateScript(req, res, next) {
    try {
      const video = await CourseVideoService.getById(req.params.id);

      // Dispatch to worker queue instead of running in API process
      await courseQueue.add('regenerate-script', {
        videoId: req.params.id,
        action: 'regenerate-script',
      });

      LoggerService.info('Course video script regeneration dispatched to worker', {
        videoId: req.params.id,
      });

      res.json({
        videoId: video._id,
        status: 'Queued',
        message: 'Script regeneration has been queued',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/course-videos/:id/generate-audio - Generate audio
   * Dispatches to BullMQ worker - returns immediately.
   */
  static async generateAudio(req, res, next) {
    try {
      const video = await CourseVideoService.getById(req.params.id);

      // Dispatch to worker queue instead of running in API process
      await courseQueue.add('generate-audio', {
        videoId: req.params.id,
        action: 'generate-audio',
      });

      LoggerService.info('Course video audio generation dispatched to worker', {
        videoId: req.params.id,
      });

      res.json({
        videoId: video._id,
        status: 'Queued',
        message: 'Audio generation has been queued',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/course-videos/:id/render - Render video
   * Dispatches to BullMQ worker - returns immediately.
   */
  static async render(req, res, next) {
    try {
      const video = await CourseVideoService.getById(req.params.id);

      // Dispatch to worker queue instead of running in API process
      await courseQueue.add('render', {
        videoId: req.params.id,
        action: 'render',
      });

      LoggerService.info('Course video rendering dispatched to worker', {
        videoId: req.params.id,
      });

      res.json({
        videoId: video._id,
        status: 'Queued',
        message: 'Rendering has been queued',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/course-videos/:id/activity-logs - Get activity logs
   */
  static async getActivityLogs(req, res, next) {
    try {
      const logs = await ActivityLogService.getByVideo(req.params.id);
      res.json({ logs });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/course-videos/:id/retry - Retry failed step
   * Dispatches to BullMQ worker - returns immediately.
   */
  static async retry(req, res, next) {
    try {
      const video = await CourseVideoService.getById(req.params.id);

      // Dispatch to worker queue instead of running in API process
      await courseQueue.add('retry', {
        videoId: req.params.id,
        action: 'retry',
      });

      LoggerService.info('Course video retry dispatched to worker', {
        videoId: req.params.id,
      });

      res.json({
        videoId: video._id,
        message: 'Retry has been queued',
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = CourseVideoController;