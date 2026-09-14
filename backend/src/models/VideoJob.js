const mongoose = require('mongoose');
const { JOB_STATUS, VIDEO_TYPES, RESOLUTIONS, QUALITY_PRESETS, ASPECT_RATIOS, LANGUAGES, STANDALONE_VIDEO_DURATIONS, SHORTS_VIDEO_DURATIONS, FONT_PAIRINGS, CAPTION_STYLES } = require('../constants');
const { generateVideoJobId } = require('../utils/id');
const sceneSchema = require('./schemas/sceneSchema');

const videoJobSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: generateVideoJobId,
    },
    topic: {
      type: String,
      required: [true, 'Video topic is required'],
      trim: true,
      maxlength: 500,
    },
    type: {
      type: String,
      enum: VIDEO_TYPES,
      required: [true, 'Video type is required'],
    },
    language: {
      type: String,
      enum: LANGUAGES,
      default: 'english',
    },
    // Free-form voice selector: legacy bare keys (e.g. "female-1"),
    // "custom:<Speaker>" for a Qwen3-TTS preset, or "clone:<file>.wav"
    // for a cloned reference voice - see AudioService.resolveVoice.
    voice: {
      type: String,
      default: 'female-1',
    },
    // Podcast type only: separate voice selections for the two speakers,
    // same free-form format as `voice` above - see AudioService.resolveVoice.
    hostVoice: {
      type: String,
      default: '',
    },
    guestVoice: {
      type: String,
      default: '',
    },
    // Podcast type only: display names for the two speakers - shown as the
    // "podcast" template's host label and, if set, used in the script
    // prompt so the two speakers can address each other by name instead of
    // generically. Falls back to "Host"/"Guest" wherever unset (see
    // ScriptParserService and ChunkedScriptService).
    hostName: {
      type: String,
      default: '',
      trim: true,
      maxlength: 80,
    },
    guestName: {
      type: String,
      default: '',
      trim: true,
      maxlength: 80,
    },
    // Requested video length in minutes - drives both prompt generation
    // (PromptService, converted to an exact scene count) and total duration
    // estimate in the worker. Mongoose's enum can't be conditional on
    // `type`, so this is the union of both duration scales - createVideoSchema's
    // superRefine is what actually enforces youtube_shorts vs. everything
    // else at request time; this just needs to accept whatever a valid
    // request could contain.
    duration: {
      type: Number,
      enum: [...STANDALONE_VIDEO_DURATIONS, ...SHORTS_VIDEO_DURATIONS],
      default: 5,
    },
    resolution: {
      type: String,
      enum: RESOLUTIONS,
      default: '1920x1080',
    },
    // Render quality preset, passed through to HyperFramesService.renderVideo.
    quality: {
      type: String,
      enum: QUALITY_PRESETS,
      default: 'standard',
    },
    // Not user-selectable - always derived from `resolution` server-side
    // (VideoService.create -> getAspectRatioForResolution).
    aspectRatio: {
      type: String,
      enum: ASPECT_RATIOS,
      default: '16:9',
    },
    // Curated title/body Google Font pairing applied across the video's
    // templates and captions - see backend/hf-templates/fonts.js for the
    // matching pairing definitions consumed at render time. 'default' keeps
    // the legacy system-font look (no Google Font load).
    fontPairing: {
      type: String,
      enum: FONT_PAIRINGS,
      default: 'default',
    },
    // Word-by-word caption animation applied across the video's content
    // scenes - legacy ids kept for existing jobs' stored data (the
    // animation hooks themselves are not yet ported to HyperFrames);
    // podcast/dialogue scenes ignore this and always use
    // 'highlightCurrent', which is tuned specifically for them.
    captionAnimation: {
      type: String,
      enum: CAPTION_STYLES,
      default: 'fadeInUp',
    },
    // true (default): current auto flow - after the script-approval pause,
    // audio/images/render/upload all run automatically. false: manual mode,
    // mirroring the course-video pipeline - audio and render each require
    // their own explicit trigger (see videoWorker.js's pause checks).
    fastGeneration: {
      type: Boolean,
      default: true,
    },
    // Unrelated to fastGeneration above: uses the smaller/faster Qwen3-TTS
    // 0.6B model for this job's narration instead of the default 1.7B -
    // trades some audio quality for speed. See AudioService's fastMode param.
    fastAudio: {
      type: Boolean,
      default: false,
    },
    // Optional talking-head overlay - explicit on/off, no user-uploaded
    // photo. When true, AvatarService animates a bundled default portrait
    // matching `voice`'s gender (see AvatarService.resolveDefaultSourceImage)
    // and stores the result in avatarVideoUrl (see videoWorker.js's
    // GENERATING_AVATAR step). false means no overlay - the render
    // composition reserves no space for it.
    avatarEnabled: { type: Boolean, default: false },
    avatarPosition: {
      type: String,
      enum: ['top-left', 'top-right', 'bottom-left', 'bottom-right', null],
      default: null,
    },
    avatarVideoUrl: { type: String, default: '' },
    status: {
      type: String,
      enum: Object.values(JOB_STATUS),
      default: JOB_STATUS.QUEUED,
      index: true,
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    currentStep: {
      type: String,
      default: '',
    },
    currentScene: {
      type: Number,
      default: 0,
    },
    script: {
      title: { type: String, default: '' },
      description: { type: String, default: '' },
      tags: [String],
      thumbnailPrompt: { type: String, default: '' },
      scenes: [sceneSchema],
    },
    videoUrl: { type: String, default: '' },
    thumbnailUrl: { type: String, default: '' },
    audioUrls: [String],
    error: {
      message: { type: String, default: '' },
      // Raw technical error text (the original exception message) - `message`
      // above holds the user-facing friendly version (see errorMessages.js).
      detail: { type: String, default: '' },
      step: { type: String, default: '' },
      retryCount: { type: Number, default: 0 },
    },
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 },
    // Set while status is RETRY_SCHEDULED so the UI can show a countdown;
    // cleared ($unset) once the retry actually starts.
    nextRetryAt: { type: Date, default: null },
    // Append-only log of every status transition, auto-populated by the
    // pre-hooks below - covers both findByIdAndUpdate (most call sites) and
    // job.save() (e.g. lifecycle.js's approve()). `durationMs` is how long
    // the job spent in the *previous* status, for per-stage timing
    // analytics (avg TTS time, avg render time, etc).
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
    // Milestone timestamps, set once and never overwritten - cheap to query
    // for analytics without scanning statusHistory. lastTransitionAt backs
    // durationMs above (also mirrors updatedAt, but survives being renamed
    // if timestamps config ever changes).
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

videoJobSchema.index({ status: 1, createdAt: -1 });

/**
 * Build the $set/$push additions for a status transition - shared by both
 * hooks below so findByIdAndUpdate and job.save() record history the same
 * way.
 */
function buildTransitionUpdate(current, nextStatus) {
  if (!nextStatus || current.status === nextStatus) return null;

  const now = new Date();
  const lastTimestamp = current.lastTransitionAt || current.createdAt;
  const durationMs = lastTimestamp ? now.getTime() - new Date(lastTimestamp).getTime() : null;

  const set = { lastTransitionAt: now };
  if (nextStatus === JOB_STATUS.FAILED) set.failedAt = now;
  if (nextStatus === JOB_STATUS.COMPLETED) set.completedAt = now;
  if (!current.startedAt && nextStatus !== JOB_STATUS.QUEUED) set.startedAt = now;

  return {
    set,
    push: { from: current.status, to: nextStatus, timestamp: now, durationMs },
  };
}

// Covers VideoJob.findByIdAndUpdate/findOneAndUpdate - the vast majority of
// status changes (statusUpdates.js, lifecycle.js).
videoJobSchema.pre('findOneAndUpdate', async function (next) {
  const update = this.getUpdate() || {};
  // Some call sites (e.g. lifecycle.js's stop()) pass top-level fields with
  // no $ operators - Mongoose's timestamps plugin then adds its own $set
  // (for updatedAt) alongside them, so the update ends up as a *mix* of
  // plain keys and $ operators. Fold any plain keys into $set so we can
  // read/merge reliably regardless of shape.
  const plainKeys = Object.keys(update).filter((key) => !key.startsWith('$'));
  const plainFields = {};
  for (const key of plainKeys) {
    plainFields[key] = update[key];
    delete update[key];
  }
  const normalized = { ...update, $set: { ...plainFields, ...update.$set } };

  const nextStatus = normalized.$set.status;
  if (!nextStatus) return next();

  const current = await this.model
    .findOne(this.getQuery())
    .select('status startedAt createdAt lastTransitionAt')
    .lean();
  if (!current) return next();

  const transition = buildTransitionUpdate(current, nextStatus);
  if (!transition) return next();

  this.setUpdate({
    ...normalized,
    $set: { ...normalized.$set, ...transition.set },
    $push: { ...(normalized.$push || {}), statusHistory: transition.push },
  });
  next();
});

// Covers the one call site that mutates and calls job.save() directly
// (lifecycle.js's approve()) instead of findByIdAndUpdate.
videoJobSchema.pre('save', function (next) {
  if (this.isNew || !this.isModified('status')) return next();

  const previousStatus = this.$__.wasNew ? null : this.$locals.__previousStatus;
  if (!previousStatus) return next();

  const transition = buildTransitionUpdate(
    { status: previousStatus, startedAt: this.startedAt, createdAt: this.createdAt, lastTransitionAt: this.lastTransitionAt },
    this.status
  );
  if (!transition) return next();

  Object.assign(this, transition.set);
  this.statusHistory.push(transition.push);
  next();
});

// Mongoose replaces `this.status` in place on assignment, so pre('save')
// alone can't see the old value - capture it eagerly via a setter.
videoJobSchema.path('status').set(function (newStatus) {
  if (!this.isNew && this.status && this.status !== newStatus && !this.$locals.__previousStatus) {
    this.$locals.__previousStatus = this.status;
  }
  return newStatus;
});

module.exports = mongoose.model('VideoJob', videoJobSchema);
