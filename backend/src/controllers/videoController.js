const VideoService = require('../services/VideoService');
const videoQueue = require('../queues/videoQueue');
const LoggerService = require('../services/LoggerService');
const SocketService = require('../services/SocketService');
const { validate, createVideoSchema, jobIdSchema } = require('../validators');

class VideoController {
  /**
   * POST /api/videos - Create a new video job
   * Returns immediately with job ID - rendering happens in background.
   */
  static async create(req, res, next) {
    try {
      const data = validate(createVideoSchema)(req.body);
      const job = await VideoService.create(data);

      // Emit socket event
      SocketService.emitJobCreated(job);

      // Add to BullMQ queue for background processing
      // Explicit jobId (matching our own Mongo _id) so a later /stop call
      // can look this BullMQ job up by id and remove it if still queued.
      await videoQueue.add(
        'render-video',
        { jobId: job._id.toString() },
        { jobId: job._id.toString() }
      );

      LoggerService.info('Video job queued for processing', {
        jobId: job._id,
        queue: 'video-rendering',
      });

      res.status(201).json({
        jobId: job._id,
        status: job.status,
        progress: job.progress,
        createdAt: job.createdAt,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/videos - Get all videos
   */
  static async list(req, res, next) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;
      const filters = {
        status: req.query.status,
        type: req.query.type,
        search: req.query.search,
      };
      const result = await VideoService.getAllJobs(page, limit, filters);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/videos/:id - Get a single video job
   */
  static async getById(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const job = await VideoService.getById(id);
      res.json({ job });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/videos/:id - Delete a video job
   */
  static async delete(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const result = await VideoService.delete(id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/videos/:id/restart - Restart a failed job
   */
  static async restart(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const job = await VideoService.restart(id);

      // Emit socket event
      SocketService.emitJobCreated(job);

      // Re-add to BullMQ queue for background processing
      // Explicit jobId (matching our own Mongo _id) so a later /stop call
      // can look this BullMQ job up by id and remove it if still queued.
      await videoQueue.add(
        'render-video',
        { jobId: job._id.toString() },
        { jobId: job._id.toString() }
      );

      LoggerService.info('Video job restarted for processing', {
        jobId: job._id,
        queue: 'video-rendering',
      });

      res.json({
        jobId: job._id,
        status: job.status,
        progress: job.progress,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/videos/:id/approve - Approve a script that's awaiting manual
   * review. Fast-generation jobs resume straight into audio/image/render;
   * manual jobs stop here until /generate-audio is called explicitly.
   */
  static async approve(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const job = await VideoService.approve(id);

      // Emit socket event
      SocketService.emitJobCreated(job);

      if (job.fastGeneration) {
        // Re-add to BullMQ queue for background processing - the worker will
        // skip script generation since the job is no longer QUEUED.
        await videoQueue.add('render-video', {
          jobId: job._id.toString(),
        });

        LoggerService.info('Video job approved and queued for processing', {
          jobId: job._id,
          queue: 'video-rendering',
        });
      } else {
        LoggerService.info('Video job script approved (manual mode) - awaiting Generate Audio', {
          jobId: job._id,
        });
      }

      res.json({
        jobId: job._id,
        status: job.status,
        progress: job.progress,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/videos/:id/generate-audio - Manual mode only: trigger audio
   * generation for an approved script.
   */
  static async generateAudio(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const job = await VideoService.generateAudio(id);

      SocketService.emitJobCreated(job);

      // Explicit jobId (matching our own Mongo _id) so a later /stop call
      // can look this BullMQ job up by id and remove it if still queued.
      await videoQueue.add(
        'render-video',
        { jobId: job._id.toString() },
        { jobId: job._id.toString() }
      );

      LoggerService.info('Video job audio generation queued (manual mode)', {
        jobId: job._id,
        queue: 'video-rendering',
      });

      res.json({
        jobId: job._id,
        status: job.status,
        progress: job.progress,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/videos/:id/generate-render - Manual mode only: trigger the
   * final image/render/upload stage once audio is ready.
   */
  static async generateRender(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const job = await VideoService.generateRender(id);

      SocketService.emitJobCreated(job);

      // Explicit jobId (matching our own Mongo _id) so a later /stop call
      // can look this BullMQ job up by id and remove it if still queued.
      await videoQueue.add(
        'render-video',
        { jobId: job._id.toString() },
        { jobId: job._id.toString() }
      );

      LoggerService.info('Video job render queued (manual mode)', {
        jobId: job._id,
        queue: 'video-rendering',
      });

      res.json({
        jobId: job._id,
        status: job.status,
        progress: job.progress,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/videos/:id/rerender - Re-render a completed or failed job
   * Resets to PREPARING_ASSETS state and re-runs rendering + upload.
   * Keeps existing script and audio data intact.
   */
  static async rerender(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const job = await VideoService.rerender(id);

      // Emit socket event
      SocketService.emitJobCreated(job);

      // Add to BullMQ queue for background processing
      // Explicit jobId (matching our own Mongo _id) so a later /stop call
      // can look this BullMQ job up by id and remove it if still queued.
      await videoQueue.add(
        'render-video',
        { jobId: job._id.toString() },
        { jobId: job._id.toString() }
      );

      LoggerService.info('Video job queued for re-rendering', {
        jobId: job._id,
        queue: 'video-rendering',
      });

      res.json({
        jobId: job._id,
        status: job.status,
        progress: job.progress,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/videos/:id/stop - Stop a running job. Marks it CANCELLED and
   * removes it from BullMQ if it hasn't started processing yet. A job that's
   * already actively running can't be removed from the queue mid-flight -
   * the worker itself notices the CANCELLED status at its next checkpoint
   * (see videoWorker.js) and stops there instead.
   */
  static async stop(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const job = await VideoService.stop(id);

      try {
        const bullJob = await videoQueue.getJob(id);
        if (bullJob) {
          const state = await bullJob.getState();
          if (['waiting', 'delayed', 'paused'].includes(state)) {
            await bullJob.remove();
            LoggerService.info('Removed not-yet-started job from queue', { jobId: id, state });
          }
        }
      } catch (queueErr) {
        LoggerService.warn('Could not remove queued job during stop', { jobId: id, error: queueErr.message });
      }

      SocketService.emitJobProgress(job);

      LoggerService.info('Video job stopped by user', { jobId: id });

      res.json({
        jobId: job._id,
        status: job.status,
        progress: job.progress,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = VideoController;
