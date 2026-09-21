const mongoose = require('mongoose');
const { VIDEO_TYPES, RESOLUTIONS, QUALITY_PRESETS, ASPECT_RATIOS, LANGUAGES, FONT_PAIRINGS, CAPTION_STYLES } = require('../constants');
const { generateVideoJobId } = require('../utils/id');
const sceneSchema = require('./schemas/sceneSchema');

/**
 * SCAFFOLDING - Phase 5 of the v2 architecture plan, additive only.
 *
 * Not read or written by any live route/controller/worker yet. VideoJob and
 * CourseVideo remain the real, authoritative models - this exists so the
 * Project/Render shape (Move 06 of the v2 plan: durable creative intent vs.
 * a render attempt) can be designed and validated against real data via
 * scripts/projectRenderMigrationPreview.js (read-only) before any actual
 * cutover is attempted. See memory / the v2 plan artifact for why the
 * cutover itself is deliberately not done in this pass: the v2 step-graph
 * engine (core/graph/) has never rendered a real job, and the Redis GPU
 * coordinator (core/leases/) isn't wired into the live GPU singleton -
 * both need to be proven before VideoJob/CourseVideo can be safely retired.
 *
 * A Project is the durable "recipe": topic, script, scene narration/voices,
 * style settings - the part that's identical whether you render it once or
 * re-render it five times with a different style variant. What it produces
 * is a Render (see Render.js), and a Project can have more than one.
 *
 * `kind` distinguishes the two shapes Project unifies (VideoJob's
 * standalone jobs and CourseVideo's lesson videos) so the migration
 * preview and any future dual-read code can tell them apart without a
 * second collection - `courseId`/`order`/`isPromo` only apply to
 * 'course-lesson'.
 */
const projectSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: generateVideoJobId,
    },
    // Not used for access control anywhere yet (this is a single-user app) -
    // the seam the v2 plan calls for keeping multi-tenancy from being a
    // rewrite later, at near-zero cost today.
    ownerId: {
      type: String,
      default: 'local',
      index: true,
    },
    kind: {
      type: String,
      enum: ['standalone', 'course-lesson'],
      required: true,
      index: true,
    },
    courseId: {
      type: String,
      ref: 'Course',
      default: null,
      index: true,
    },
    order: { type: Number, default: 0 },
    isPromo: { type: Boolean, default: false },

    topic: { type: String, required: true, trim: true, maxlength: 1000 },
    title: { type: String, default: '', trim: true, maxlength: 200 },
    // CourseVideo.style holds the same vocabulary as VideoJob.type
    // ('educational', 'business', ...) - one enum covers both kinds.
    type: {
      type: String,
      enum: VIDEO_TYPES,
      default: 'educational',
    },
    language: { type: String, enum: LANGUAGES, default: 'english' },

    voice: { type: String, default: 'female-1' },
    hostVoice: { type: String, default: '' },
    guestVoice: { type: String, default: '' },
    hostName: { type: String, default: '', trim: true, maxlength: 80 },
    guestName: { type: String, default: '', trim: true, maxlength: 80 },

    duration: { type: Number, default: 5 },
    resolution: { type: String, enum: RESOLUTIONS, default: '1920x1080' },
    quality: { type: String, enum: QUALITY_PRESETS, default: 'standard' },
    aspectRatio: { type: String, enum: ASPECT_RATIOS, default: '16:9' },
    fontPairing: { type: String, enum: FONT_PAIRINGS, default: 'default' },
    captionAnimation: { type: String, enum: CAPTION_STYLES, default: 'fadeInUp' },
    additionalInstructions: { type: String, default: '', maxlength: 1000 },

    fastGeneration: { type: Boolean, default: true },
    fastAudio: { type: Boolean, default: false },
    avatarEnabled: { type: Boolean, default: false },
    avatarPosition: {
      type: String,
      enum: ['top-left', 'top-right', 'bottom-left', 'bottom-right', null],
      default: null,
    },

    // The creative recipe, including per-scene generated artifacts
    // (scene.audio.file/duration/captionTimestamps, scene.imageUrl) inline
    // - same shape VideoJob/CourseVideo use today. Splitting narration
    // intent from generated artifacts at the scene level is a real design
    // decision for the actual cutover, not made here: scaffolding keeps
    // the proven shape rather than guessing at an unvalidated split.
    script: {
      title: { type: String, default: '' },
      description: { type: String, default: '' },
      tags: [String],
      thumbnailPrompt: { type: String, default: '' },
      scenes: [sceneSchema],
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

projectSchema.index({ kind: 1, courseId: 1, order: 1 });
projectSchema.index({ ownerId: 1, createdAt: -1 });

module.exports = mongoose.model('Project', projectSchema);
