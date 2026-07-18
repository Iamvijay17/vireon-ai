const CourseVideoService = require('../services/CourseVideoService');
const courseQueue = require('../queues/courseQueue');
const LoggerService = require('../services/LoggerService');

class CourseVideoController {
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
      const result = await CourseVideoService.delete(req.params.id);
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