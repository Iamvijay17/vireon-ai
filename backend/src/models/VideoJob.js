const mongoose = require('mongoose');
const { JOB_STATUS, VIDEO_TYPES, RESOLUTIONS, ASPECT_RATIOS, VOICES, LANGUAGES } = require('../constants');

const sceneSchema = new mongoose.Schema(
  {
    sceneNumber: { type: Number, required: true },
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    duration: { type: Number, default: 8 },
    backgroundColor: { type: String, default: '#1a1a2e' },
    transition: { type: String, default: 'fade' },
    imagePrompt: { type: String, default: '' },
    cameraMotion: { type: String, default: 'static' },
    animation: { type: String, default: '' },
    audio: {
      text: { type: String, default: '' },
      file: { type: String, default: '' },
      duration: { type: Number, default: 0 },
      voice: { type: String, default: '' },
    },
  },
  { _id: false }
);

const videoJobSchema = new mongoose.Schema(
  {
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
    voice: {
      type: String,
      enum: VOICES,
      default: 'female-1',
    },
    resolution: {
      type: String,
      enum: RESOLUTIONS,
      default: '1920x1080',
    },
    aspectRatio: {
      type: String,
      enum: ASPECT_RATIOS,
      default: '16:9',
    },
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
