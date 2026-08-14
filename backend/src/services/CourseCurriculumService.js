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
   */
  static async save(courseId, { title, topic, lessons, source = 'ai-generated' }) {
    if (!Array.isArray(lessons) || lessons.length === 0) {
      throw { status: 400, message: 'lessons must be a non-empty array' };
    }

    const curriculum = await CourseCurriculum.create({
      courseId,
      title,
      topic,
      lessons,
      source,
    });

    LoggerService.info('Course curriculum structure saved', {
      curriculumId: curriculum._id,
      courseId,
      lessons: lessons.length,
    });

    return curriculum;
  }

  /**
   * List saved curriculum structures for a course, most recent first.
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
