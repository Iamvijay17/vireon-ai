const mongoose = require('mongoose');
const { VIDEO_STATUS, STAGE_STATUS, LANGUAGES, VIDEO_DURATIONS } = require('../constants');

const STAGE_STATUS_VALUES = Object.values(STAGE_STATUS);

const courseVideoSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: [true, 'Course ID is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Video title is required'],
      trim: true,
      maxlength: 200,
    },
    topic: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    order: {
      type: Number,
      default: 0,
    },
    duration: {
      type: Number,
      enum: VIDEO_DURATIONS,
      default: 5,
    },
    // See AudioService.resolveVoice for accepted formats (legacy key,
    // "custom:<Speaker>", or "clone:<file>.wav").
    voice: {
      type: String,
      default: 'female-1',
    },
    style: {
      type: String,
      default: 'educational',
    },
    additionalInstructions: {
      type: String,
      default: '',
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: Object.values(VIDEO_STATUS),
      default: VIDEO_STATUS.DRAFT,
      index: true,
    },
    // Independent per-stage status/error, tracked alongside the legacy
    // `status` above so the bulk lesson table can show Script/Audio/Video
    // progress separately without inferring it from the combined string.
    scriptStatus: {
      type: String,
      enum: STAGE_STATUS_VALUES,
      default: STAGE_STATUS.PENDING,
      index: true,
    },
    audioStatus: {
      type: String,
      enum: STAGE_STATUS_VALUES,
      default: STAGE_STATUS.PENDING,
      index: true,
    },
    videoStatus: {
      type: String,
      enum: STAGE_STATUS_VALUES,
      default: STAGE_STATUS.PENDING,
      index: true,
    },
    scriptError: {
      message: { type: String, default: '' },
      failedAt: { type: Date, default: null },
    },
    audioError: {
      message: { type: String, default: '' },
      failedAt: { type: Date, default: null },
    },
    videoError: {
      message: { type: String, default: '' },
      failedAt: { type: Date, default: null },
    },
    script: {
      type: String,
      default: '',
    },
    scriptGeneratedAt: {
      type: Date,
      default: null,
    },
    approved: {
      type: Boolean,
      default: false,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    audioUrl: {
      type: String,
      default: '',
    },
    audioDuration: {
      type: Number,
      default: 0,
    },
    audioGeneratedAt: {
      type: Date,
      default: null,
    },
    waveform: {
      type: String,
      default: '',
    },
    sceneJson: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    scenesGeneratedAt: {
      type: Date,
      default: null,
    },
    imageUrls: [{
      sceneNumber: Number,
      url: String,
    }],
    imagesGeneratedAt: {
      type: Date,
      default: null,
    },
    renderUrl: {
      type: String,
      default: '',
    },
    renderProgress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    renderedAt: {
      type: Date,
      default: null,
    },
    error: {
      message: { type: String, default: '' },
      step: { type: String, default: '' },
      retryCount: { type: Number, default: 0 },
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    maxRetries: {
      type: Number,
      default: 3,
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

courseVideoSchema.index({ courseId: 1, order: 1 });
courseVideoSchema.index({ courseId: 1, status: 1 });

module.exports = mongoose.model('CourseVideo', courseVideoSchema);