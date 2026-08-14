const CourseCurriculum = require('../models/CourseCurriculum');
const LoggerService = require('./LoggerService');

/**
 * Service for persisting generated Udemy-style course structures.
 * Single Responsibility: CourseCurriculum CRUD (read history / write a new
 * snapshot). Generation itself lives in LMStudioService/CourseVideoService.
 */
class CourseCurriculumService {
  /**
   * Save a generated (or user-edited) curriculum snapshot for a course.
   * One curriculum per course: regenerating replaces the existing snapshot
   * in place (upsert on courseId) rather than piling up history rows - the
   * frontend already gates regeneration behind an explicit "this will
   * replace the current lesson list" confirm (see CourseDetail.jsx's
   * handleRegenerateCurriculum), so by the time this is called the user has
   * already agreed to overwrite.
   */
  static async save(courseId, { title, topic, subtitle = '', promo = null, lessons, source = 'ai-generated' }) {
    if (!Array.isArray(lessons) || lessons.length === 0) {
      throw { status: 400, message: 'lessons must be a non-empty array' };
    }

    const curriculum = await CourseCurriculum.findOneAndUpdate(
      { courseId },
      { courseId, title, topic, subtitle, promo: promo || undefined, lessons, source },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    LoggerService.info('Course curriculum structure saved', {
      curriculumId: curriculum._id,
      courseId,
      lessons: lessons.length,
    });

    return curriculum;
  }

  /**
   * Get the course's single saved curriculum structure, or null if none has
   * been generated yet.
   */
  static async getByCourse(courseId) {
    return CourseCurriculum.findOne({ courseId }).lean();
  }

  /**
   * List saved curriculum structures for a course, most recent first.
   * Since save() upserts (one curriculum per course), this returns at most
   * one result - kept as a paginated list for API/frontend compatibility.
   */
  static async listByCourse(courseId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [curricula, total] = await Promise.all([
      CourseCurriculum.find({ courseId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      CourseCurriculum.countDocuments({ courseId }),
    ]);

    return {
      curricula,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single saved curriculum structure by id.
   */
  static async getById(curriculumId) {
    const curriculum = await CourseCurriculum.findById(curriculumId).lean();
    if (!curriculum) {
      throw { status: 404, message: 'Course curriculum not found' };
    }
    return curriculum;
  }
}

module.exports = CourseCurriculumService;
