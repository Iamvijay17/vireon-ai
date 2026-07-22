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
      await videoQueue.add('render-video', {
        jobId: job._id.toString(),
      });

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
      const result = await VideoService.getAllJobs(page, limit);
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
      await videoQueue.add('render-video', {
        jobId: job._id.toString(),
      });

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
   * review and resume the pipeline into audio/image/render.
   */
  static async approve(req, res, next) {
    try {
      const { id } = validate(jobIdSchema)({ id: req.params.id });
      const job = await VideoService.approve(id);

      // Emit socket event
      SocketService.emitJobCreated(job);

      // Re-add to BullMQ queue for background processing - the worker will
      // skip script generation since the job is no longer QUEUED.
      await videoQueue.add('render-video', {
        jobId: job._id.toString(),
      });

      LoggerService.info('Video job approved and queued for processing', {
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
      await videoQueue.add('render-video', {
        jobId: job._id.toString(),
      });

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
}

module.exports = VideoController;
