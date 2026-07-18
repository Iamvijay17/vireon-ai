const Course = require('../models/Course');
const CourseVideo = require('../models/CourseVideo');
const LoggerService = require('./LoggerService');
const { COURSE_STATUS } = require('../constants');

/**
 * Service for managing courses.
 * Single Responsibility: Course CRUD and lifecycle management.
 */
class CourseService {
  /**
   * Create a new course.
   */
  static async create(data) {
    const course = await Course.create({
      title: data.title,
      description: data.description || '',
      category: data.category || 'Other',
      difficulty: data.difficulty || 'Beginner',
      language: data.language || 'english',
      thumbnail: data.thumbnail || '',
      status: COURSE_STATUS.DRAFT,
    });

    LoggerService.info('Course created', {
      courseId: course._id,
      title: course.title,
    });

    return course;
  }

  /**
   * Get all courses with pagination.
   */
  static async getAll(page = 1, limit = 20, filters = {}) {
    const skip = (page - 1) * limit;
    const query = {};

    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.category) {
      query.category = filters.category;
    }
    if (filters.search) {
      query.$or = [
        { title: { $regex: filters.search, $options: 'i' } },
        { description: { $regex: filters.search, $options: 'i' } },
      ];
    }

    const [courses, total] = await Promise.all([
      Course.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Course.countDocuments(query),
    ]);

    return {
      courses,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single course by ID with video summary.
   */
  static async getById(courseId) {
    const course = await Course.findById(courseId);
    if (!course) {
      throw { status: 404, message: 'Course not found' };
    }

    // Get video counts by status
    const statusCounts = await CourseVideo.aggregate([
      { $match: { courseId: course._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const videoStatusSummary = {};
    statusCounts.forEach((s) => {
      videoStatusSummary[s._id] = s.count;
    });

    return {
      course,
      videoStatusSummary,
    };
  }

  /**
   * Update a course.
   */
  static async update(courseId, data) {
    const course = await Course.findByIdAndUpdate(
      courseId,
      { $set: data },
      { new: true, runValidators: true }
    );
    if (!course) {
      throw { status: 404, message: 'Course not found' };
    }

    LoggerService.info('Course updated', {
      courseId,
      title: course.title,
    });

    return course;
  }

  /**
   * Delete a course and all its videos.
   */
  static async delete(courseId) {
    const course = await Course.findByIdAndDelete(courseId);
    if (!course) {
      throw { status: 404, message: 'Course not found' };
    }

    // Delete all videos in this course
    await CourseVideo.deleteMany({ courseId });

    LoggerService.info('Course deleted', { courseId });

    return { message: 'Course deleted successfully' };
  }

  /**
   * Update course status based on its videos.
   */
  static async recalculateStatus(courseId) {
    const course = await Course.findById(courseId);
    if (!course) return;

    const videos = await CourseVideo.find({ courseId });
    const totalVideos = videos.length;
    const completedVideos = videos.filter(
      (v) => v.status === 'Completed'
    ).length;

    let status = COURSE_STATUS.DRAFT;
    if (totalVideos > 0) {
      if (completedVideos === totalVideos) {
        status = COURSE_STATUS.COMPLETED;
      } else {
        status = COURSE_STATUS.IN_PROGRESS;
      }
    }

    course.videoCount = totalVideos;
    course.completedVideoCount = completedVideos;
    course.status = status;
    await course.save();

    return course;
  }
}

module.exports = CourseService;