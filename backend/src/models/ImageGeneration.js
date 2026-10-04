const mongoose = require('mongoose');
const { generateImageGenerationId } = require('../utils/id');
const { STYLE_KEYS } = require('../services/image/styles');

// Standalone text-to-image generations (Image Studio), independent of the
// video pipeline's per-scene images. Single-user app (see middleware/auth.js)
// so, like AudioGeneration, this isn't scoped to a user id.
const imageGenerationSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: generateImageGenerationId,
    },
    prompt: {
      type: String,
      required: [true, 'prompt is required'],
      trim: true,
    },
    aspectRatio: {
      type: String,
      enum: ['16:9', '9:16', '1:1', '4:5'],
      default: '16:9',
    },
    quality: {
      type: String,
      enum: ['fast', 'standard', 'high'],
      default: 'standard',
    },
    // "Avoid" (negative) prompt; non-empty means the picture was rendered in guided mode.
    negative: {
      type: String,
      default: '',
    },
    // Exact words drawn in the picture (one per line); empty means the prompt is rendered with "no text".
    text: {
      type: String,
      default: '',
    },
    // Style preset key (services/image/styles.js); `prompt` above stays the user's own text.
    style: {
      type: String,
      enum: STYLE_KEYS,
      default: 'none',
    },
    // Seed the picture was made with: the one the user pinned while PENDING,
    // the one actually used once COMPLETED, null before that if left random.
    seed: {
      type: Number,
      default: null,
    },
    // Re-roll counter for the same prompt + aspect ratio: the seed is derived
    // from the prompt, so a repeat only makes a new picture if the variant moves
    // (see ImageGenerationService.seedFor).
    variant: {
      type: Number,
      default: 0,
    },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
    },
    imageUrl: {
      type: String,
      default: null,
    },
    fileName: {
      type: String,
      default: null,
    },
    durationMs: {
      type: Number,
      default: null,
    },
    // True when the picture came from the prompt cache instead of ComfyUI.
    fromCache: {
      type: Boolean,
      default: false,
    },
    error: {
      type: String,
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

imageGenerationSchema.index({ createdAt: -1 });
imageGenerationSchema.index({ prompt: 1, aspectRatio: 1, variant: -1 });

module.exports = mongoose.model('ImageGeneration', imageGenerationSchema);
