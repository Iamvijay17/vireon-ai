const mongoose = require('mongoose');
const { COURSE_STATUS, CATEGORIES, DIFFICULTIES, LANGUAGES } = require('../constants');

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Course title is required'],
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    category: {
      type: String,
      enum: CATEGORIES,
      default: 'Other',
    },
    difficulty: {
      type: String,
      enum: DIFFICULTIES,
      default: 'Beginner',
    },
    language: {
      type: String,
      enum: LANGUAGES,
      default: 'english',
    },
    thumbnail: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: Object.values(COURSE_STATUS),
      default: COURSE_STATUS.DRAFT,
      index: true,
    },
    videoCount: {
      type: Number,
      default: 0,
    },
    completedVideoCount: {
      type: Number,
      default: 0,
    },
    // In-progress "Generate Udemy Course Structure" draft (form values +
    // AI-generated lessons not yet turned into CourseVideo records), so
    // navigating away and back doesn't force a full LLM-call regeneration.
    // Cleared once the lessons are actually created (see
    // CourseVideoService.createFromLessons caller in the controller).
    curriculumDraft: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
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

courseSchema.index({ status: 1, createdAt: -1 });
courseSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('Course', courseSchema);