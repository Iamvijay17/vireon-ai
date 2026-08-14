const mongoose = require('mongoose');
const { generateCourseCurriculumId } = require('../utils/id');

// One lesson entry in a generated Udemy-style curriculum. Mirrors the shape
// LMStudioService.generateCurriculum returns (see that file), so a stored
// document can be replayed straight into CourseVideoService.createFromLessons
// without reshaping.
const lessonSchema = new mongoose.Schema(
  {
    order: { type: Number, required: true },
    title: { type: String, required: true, trim: true },
    topic: { type: String, default: '' },
    description: { type: String, default: '' },
  },
  { _id: false }
);

// The course-level promotional trailer pitch (see LMStudioService.generateCurriculum) -
// one per course, not a lesson, so it isn't numbered/reordered with the lesson list.
const promoSchema = new mongoose.Schema(
  {
    title: { type: String, default: '' },
    topic: { type: String, default: '' },
    description: { type: String, default: '' },
  },
  { _id: false }
);

/**
 * The saved snapshot of a course's AI-generated (or user-edited) Udemy-style
 * structure, kept separately from Course.curriculumDraft (the transient
 * in-progress form state). One document per course - CourseCurriculumService.save()
 * upserts on courseId, so regenerating replaces this course's existing
 * snapshot in place rather than creating a new history row. There is no
 * schema-level unique index on courseId (to avoid breaking on any duplicate
 * rows left over from before this became upsert-based) - one-per-course is
 * enforced at the application layer in CourseCurriculumService.save().
 */
const courseCurriculumSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: generateCourseCurriculumId,
    },
    courseId: {
      type: String,
      ref: 'Course',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    topic: {
      type: String,
      default: '',
    },
    // Course-level tagline (e.g. shown under the course title), distinct
    // from any per-lesson text - generated alongside the lesson list.
    subtitle: {
      type: String,
      default: '',
    },
    // Course-level promo trailer pitch, separate from the lesson list.
    promo: {
      type: promoSchema,
      default: () => ({}),
    },
    lessons: {
      type: [lessonSchema],
      default: [],
    },
    source: {
      type: String,
      enum: ['ai-generated', 'manual'],
      default: 'ai-generated',
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

courseCurriculumSchema.index({ courseId: 1, createdAt: -1 });

module.exports = mongoose.model('CourseCurriculum', courseCurriculumSchema);
