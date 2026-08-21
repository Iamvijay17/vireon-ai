const mongoose = require('mongoose');
const { JOB_STATUS, VIDEO_TYPES, RESOLUTIONS, ASPECT_RATIOS, LANGUAGES, STANDALONE_VIDEO_DURATIONS, SHORTS_VIDEO_DURATIONS } = require('../constants');
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
    // Not user-selectable - always derived from `resolution` server-side
    // (VideoService.create -> getAspectRatioForResolution).
    aspectRatio: {
      type: String,
      enum: ASPECT_RATIOS,
      default: '16:9',
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
    // GENERATING_AVATAR step). false means no overlay - the Remotion
    // composition reserves no space for it (see AvatarOverlay).
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
    scriptUrl: { type: String, default: '' },
    audioUrls: [String],
    assetsUrl: { type: String, default: '' },
    error: {
      message: { type: String, default: '' },
      step: { type: String, default: '' },
      retryCount: { type: Number, default: 0 },
    },
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 },
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

module.exports = mongoose.model('VideoJob', videoJobSchema);
