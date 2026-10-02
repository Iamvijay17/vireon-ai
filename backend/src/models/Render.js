const mongoose = require('mongoose');

/**
 * SCAFFOLDING - Phase 5 of the v2 architecture plan, additive only. See
 * Project.js's header for the full context on why this isn't wired into
 * any live code path yet.
 *
 * A Render is one attempt at turning a Project into an actual video file:
 * everything that's specific to *this run* rather than the underlying
 * recipe - status, progress, output URLs, retry/error state. VideoJob and
 * CourseVideo fuse "the recipe" and "the one attempt so far" into a single
 * document; splitting them out is what makes a re-render, a style-variant
 * re-render, or a format variant a new Render row instead of overwriting
 * the only one that ever existed.
 */
const renderSchema = new mongoose.Schema(
  {
    projectId: {
      type: String,
      ref: 'Project',
      required: true,
      index: true,
    },
    // 1-based, per project - lets a project's renders be listed in the
    // order they were attempted without relying on createdAt sort stability.
    attemptNumber: {
      type: Number,
      required: true,
    },

    status: { type: String, required: true, index: true },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    currentStep: { type: String, default: '' },
    currentScene: { type: Number, default: 0 },

    videoUrl: { type: String, default: '' },
    thumbnailUrl: { type: String, default: '' },
    avatarVideoUrl: { type: String, default: '' },
    audioUrls: [String],

    error: {
      message: { type: String, default: '' },
      detail: { type: String, default: '' },
      step: { type: String, default: '' },
      retryCount: { type: Number, default: 0 },
    },
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 },
    nextRetryAt: { type: Date, default: null },

    statusHistory: {
      type: [
        {
          _id: false,
          from: { type: String, default: null },
          to: { type: String, required: true },
          timestamp: { type: Date, default: Date.now },
          durationMs: { type: Number, default: null },
        },
      ],
      default: [],
    },

    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    lastTransitionAt: { type: Date, default: null },
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

renderSchema.index({ projectId: 1, attemptNumber: 1 }, { unique: true });
renderSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Render', renderSchema);
