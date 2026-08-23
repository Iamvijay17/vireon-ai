const CourseVideoService = require('../services/course/CourseVideoService');
const ActivityLogService = require('../services/common/ActivityLogService');
const courseQueue = require('../queues/courseQueue');
const LoggerService = require('../services/common/LoggerService');
const SocketService = require('../services/common/SocketService');
const { SOCKET_EVENTS } = require('../constants');
const { validate, idSchema, idArraySchema } = require('../validators');
const { getStorageProvider } = require('../services/storage/providers');
const { sanitizeFilename } = require('../utils/filename');

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
      const { action } = req.body;
      const { videoIds } = validate(idArraySchema)(req.body);

      if (!VALID_BULK_ACTIONS.includes(action)) {
        throw { status: 400, message: `action must be one of: ${VALID_BULK_ACTIONS.join(', ')}` };
      }

      const { jobs, skipped } = await CourseVideoService.prepareBulkJobs(videoIds, action);

      for (const job of jobs) {
        await courseQueue.add(job.action, { videoId: job.videoId, action: job.action });
      }

      LoggerService.info('Bulk course video generation queued', {
        videos: videoIds.length,
        action,
        jobs: jobs.length,
        skipped: skipped.length,
      });

      res.json({ queued: videoIds.length - skipped.length, jobs: jobs.length, skipped });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/course-videos/:id - Get a single video
   */
  static async getById(req, res, next) {
    try {
      const { id } = validate(idSchema)({ id: req.params.id });
      const video = await CourseVideoService.getById(id);
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
      const { id } = validate(idSchema)({ id: req.params.id });
      const video = await CourseVideoService.update(id, req.body);
      res.json({ video });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/course-videos/bulk-delete - Delete multiple videos at once.
   * Used by the course detail page's bulk action bar - a single video is
   * just a 1-element videoIds array.
   */
  static async bulkDelete(req, res, next) {
    try {
      const { videoIds } = validate(idArraySchema)(req.body);
      const result = await CourseVideoService.bulkDelete(videoIds);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/course-videos/:id - Delete a video
   */
  static async delete(req, res, next) {
    try {
      const { id } = validate(idSchema)({ id: req.params.id });
      const video = await CourseVideoService.getById(id);
      const courseId = video.courseId.toString();

      const result = await CourseVideoService.delete(id);

      SocketService.emitToCourse(courseId, SOCKET_EVENTS.COURSE_VIDEO_DELETED, {
        videoId: id,
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
      const { id } = validate(idSchema)({ id: req.params.id });
      const video = await CourseVideoService.claimStage(id, 'generate-script');

      // Dispatch to worker queue instead of running in API process
      await courseQueue.add('generate-script', {
        videoId: id,
        action: 'generate-script',
      });

      LoggerService.info('Course video script generation dispatched to worker', {
        videoId: id,
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
      const { id } = validate(idSchema)({ id: req.params.id });
      const video = await CourseVideoService.approveScript(id);
      res.json({ video });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/course-videos/bulk-approve-script - Approve scripts for
   * multiple videos at once. Synchronous (no worker queue involved), so
   * unlike bulk-generate this doesn't need the worker to be running.
   */
  static async bulkApproveScript(req, res, next) {
    try {
      const { videoIds } = validate(idArraySchema)(req.body);

      const result = await CourseVideoService.bulkApproveScripts(videoIds);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/course-videos/:id/script - Update script (edit)
   */
  static async updateScript(req, res, next) {
    try {
      const { id } = validate(idSchema)({ id: req.params.id });
      const { script } = req.body;
      const video = await CourseVideoService.updateScript(id, script);
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
      const { id } = validate(idSchema)({ id: req.params.id });
      const video = await CourseVideoService.claimStage(id, 'regenerate-script');

      // Dispatch to worker queue instead of running in API process
      await courseQueue.add('regenerate-script', {
        videoId: id,
        action: 'regenerate-script',
      });

      LoggerService.info('Course video script regeneration dispatched to worker', {
        videoId: id,
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
      const { id } = validate(idSchema)({ id: req.params.id });
      const video = await CourseVideoService.claimStage(id, 'generate-audio');

      // Dispatch to worker queue instead of running in API process
      await courseQueue.add('generate-audio', {
        videoId: id,
        action: 'generate-audio',
      });

      LoggerService.info('Course video audio generation dispatched to worker', {
        videoId: id,
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
      const { id } = validate(idSchema)({ id: req.params.id });
      const video = await CourseVideoService.claimStage(id, 'render');

      // Dispatch to worker queue instead of running in API process
      await courseQueue.add('render', {
        videoId: id,
        action: 'render',
      });

      LoggerService.info('Course video rendering dispatched to worker', {
        videoId: id,
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
      const { id } = validate(idSchema)({ id: req.params.id });
      const logs = await ActivityLogService.getByVideo(id);
      res.json({ logs });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/course-videos/:id/stop - Stop this lesson's in-progress
   * generation. Marks it CANCELLED and removes any not-yet-started jobs for
   * it from the queue; an already-running stage notices at its next
   * checkpoint (see CourseVideoService.bailIfCancelled) and stops there.
   */
  static async stop(req, res, next) {
    try {
      const { id } = validate(idSchema)({ id: req.params.id });
      const video = await CourseVideoService.stop(id);
      res.json({ video });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/course-videos/:id/scenes/:sceneNumber/regenerate-audio -
   * Regenerate just one scene's audio instead of the whole lesson's.
   * Runs synchronously (not queued) since it's a single TTS call.
   */
  static async regenerateSceneAudio(req, res, next) {
    try {
      const { id } = validate(idSchema)({ id: req.params.id });
      const sceneNumber = parseInt(req.params.sceneNumber, 10);
      if (!Number.isInteger(sceneNumber) || sceneNumber < 1) {
        throw { status: 400, message: 'sceneNumber must be a positive integer' };
      }

      const result = await CourseVideoService.regenerateSceneAudio(id, sceneNumber);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/course-videos/:id/download - Stream the rendered video file,
   * named after the video's title instead of MinIO's internal fileName.
   */
  static async download(req, res, next) {
    try {
      const { id } = validate(idSchema)({ id: req.params.id });
      const video = await CourseVideoService.getById(id);

      if (!video.renderUrl) {
        throw { status: 404, message: 'This video has not been rendered yet' };
      }

      const storage = getStorageProvider();
      const { bucket, key } = storage.parsePublicUrl(video.renderUrl);
      const stream = await storage.getObjectStream(bucket, key);

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(video.title)}.mp4"`);
      stream.on('error', next);
      stream.pipe(res);
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
      const { id } = validate(idSchema)({ id: req.params.id });
      const video = await CourseVideoService.claimStage(id, 'retry');

      // Dispatch to worker queue instead of running in API process
      await courseQueue.add('retry', {
        videoId: id,
        action: 'retry',
      });

      LoggerService.info('Course video retry dispatched to worker', {
        videoId: id,
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