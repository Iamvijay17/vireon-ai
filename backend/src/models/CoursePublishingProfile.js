const mongoose = require('mongoose');

/**
 * Publishing-only metadata for a course: the things a Udemy course page asks
 * for that the Course model has no reason to carry (subtitle, learning
 * objectives, prerequisites, audience) plus how lessons are grouped into
 * sections, and the defaults a YouTube upload starts from. One document per
 * course; absent until the user first saves it.
 */
const sectionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 1000 },
    // CourseVideo ids, in the order they appear in the section.
    lessonIds: { type: [String], default: [] },
  },
  { _id: false }
);

const coursePublishingProfileSchema = new mongoose.Schema(
  {
    _id: { type: String }, // = Course._id
    ownerId: { type: String, required: true, index: true },
    subtitle: { type: String, default: '', trim: true, maxlength: 300 },
    description: { type: String, default: '', trim: true, maxlength: 10000 },
    level: { type: String, enum: ['All Levels', 'Beginner', 'Intermediate', 'Expert'], default: 'All Levels' },
    learningObjectives: { type: [String], default: [] },
    prerequisites: { type: [String], default: [] },
    intendedAudience: { type: [String], default: [] },
    sections: { type: [sectionSchema], default: [] },
    youtubeDefaults: {
      categoryId: { type: String, default: '27' },
      language: { type: String, default: '' },
      tags: { type: [String], default: [] },
      privacyStatus: { type: String, enum: ['private', 'unlisted', 'public'], default: 'private' },
      madeForKids: { type: Boolean, default: false },
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

module.exports = mongoose.model('CoursePublishingProfile', coursePublishingProfileSchema);
