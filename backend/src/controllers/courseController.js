const CourseService = require('../services/CourseService');
const CourseVideoService = require('../services/CourseVideoService');
const CourseCurriculumService = require('../services/CourseCurriculumService');
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
   * POST /api/courses/:id/stop - Stop every not-yet-finished lesson in this
   * course at once.
   */
  static async stop(req, res, next) {
    try {
      // CourseVideoService.stop() already emits a per-video
      // courseVideoProgress event for each stopped lesson (see
      // CourseService.stopAll), so the frontend's existing per-video
      // listener picks up each row's new status without a separate
      // course-wide event here.
      const result = await CourseService.stopAll(req.params.id);
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

  /**
   * POST /api/courses/:id/generate-curriculum - Generate a full Udemy-style
   * curriculum via the LLM for review. Read-only: no CourseVideo records
   * are created here. The frontend shows the returned lessons as an
   * editable preview before the user approves creation.
   */
  static async generateCurriculum(req, res, next) {
    try {
      if (!req.body.title || !req.body.topic) {
        throw { status: 400, message: 'title and topic are required' };
      }

      const { subtitle, promo, lessons } = await CourseVideoService.previewCurriculum(req.body.title, req.body.topic);

      // Persist this generated structure to its own collection, separate
      // from Course.curriculumDraft (which only ever holds the latest
      // in-progress form state). One curriculum per course - this replaces
      // any existing snapshot for the course (see CourseCurriculumService.save).
      const curriculum = await CourseCurriculumService.save(req.params.id, {
        title: req.body.title,
        topic: req.body.topic,
        subtitle,
        promo,
        lessons,
      });

      res.json({ subtitle, promo, lessons, curriculum });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/courses/:id/curriculum-history - List previously generated
   * curriculum structures for a course, most recent first.
   */
  static async listCurriculumHistory(req, res, next) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;
      const result = await CourseCurriculumService.listByCourse(req.params.id, page, limit);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/courses/:id/curriculum-videos - Create one CourseVideo per
   * lesson from an approved (possibly user-edited) lesson list, the output
   * of generate-curriculum above. If `promo` is included in the body, also
   * creates/updates the course's single course-level trailer video (not a
   * lesson - see CourseVideoService.createPromoVideo).
   */
  static async createCurriculumVideos(req, res, next) {
    try {
      const { lessons, promo, voice, style, duration, additionalInstructions, fastAudio, resolution } = req.body;
      const options = { voice, style, duration, additionalInstructions, fastAudio, resolution };

      const videos = await CourseVideoService.createFromLessons(req.params.id, lessons, options);

      let promoVideo = null;
      if (promo && promo.topic) {
        promoVideo = await CourseVideoService.createPromoVideo(req.params.id, promo, options);
      }

      res.status(201).json({ videos, promoVideo });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/courses/:id/curriculum-draft - Autosave the in-progress
   * curriculum generation draft (form + generated lessons), so the frontend
   * can restore it after navigating away and back.
   */
  static async saveCurriculumDraft(req, res, next) {
    try {
      const draft = await CourseService.saveCurriculumDraft(req.params.id, req.body);
      res.json({ curriculumDraft: draft });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/courses/:id/curriculum-draft - Clear the draft, e.g. once
   * its lessons have been created into real CourseVideo records.
   */
  static async clearCurriculumDraft(req, res, next) {
    try {
      const result = await CourseService.clearCurriculumDraft(req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = CourseController;