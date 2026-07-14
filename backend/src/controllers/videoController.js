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
      const job = await VideoService.create(req.user._id, data);

      // Emit socket event
      SocketService.emitJobCreated(job);

      // Add to BullMQ queue for background processing
      await videoQueue.add('render-video', {
        jobId: job._id.toString(),
        userId: req.user._id.toString(),
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
   * GET /api/videos - Get all videos for the current user
   */
  static async list(req, res, next) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;
      const result = await VideoService.getUserJobs(req.user._id, page, limit);
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
      const job = await VideoService.getById(id, req.user._id);
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
      const result = await VideoService.delete(id, req.user._id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = VideoController;
