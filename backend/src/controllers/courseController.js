const CourseService = require('../services/CourseService');
const CourseVideoService = require('../services/CourseVideoService');
const LoggerService = require('../services/LoggerService');
const SocketService = require('../services/SocketService');
const { SOCKET_EVENTS } = require('../constants');

class CourseController {
  /**
   * POST /api/courses - Create a new course
   */
  static async create(req, res, next) {
    try {
      const course = await CourseService.create(req.body);

      SocketService.emitToAll(SOCKET_EVENTS.COURSE_UPDATED, {
        type: 'created',
        course,
      });

      res.status(201).json({ course });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/courses - Get all courses
   */
  static async list(req, res, next) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;
      const filters = {
        status: req.query.status,
        category: req.query.category,
        search: req.query.search,
      };

      const result = await CourseService.getAll(page, limit, filters);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/courses/:id - Get a single course
   */
  static async getById(req, res, next) {
    try {
      const result = await CourseService.getById(req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/courses/:id - Update a course
   */
  static async update(req, res, next) {
    try {
      const course = await CourseService.update(req.params.id, req.body);

      SocketService.emitToAll(SOCKET_EVENTS.COURSE_UPDATED, {
        type: 'updated',
        course,
      });

      res.json({ course });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/courses/:id - Delete a course
   */
  static async delete(req, res, next) {
    try {
      const result = await CourseService.delete(req.params.id);

      SocketService.emitToAll(SOCKET_EVENTS.COURSE_DELETED, {
        courseId: req.params.id,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/courses/:id/videos - Get all videos for a course
   */
  static async listVideos(req, res, next) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 50;
      const result = await CourseVideoService.getByCourse(req.params.id, page, limit);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/courses/:id/videos - Create a video in a course
   */
  static async createVideo(req, res, next) {
    try {
      const video = await CourseVideoService.create(req.params.id, req.body);

      SocketService.emitToCourse(req.params.id, SOCKET_EVENTS.COURSE_VIDEO_CREATED, {
        video,
      });

      res.status(201).json({ video });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = CourseController;