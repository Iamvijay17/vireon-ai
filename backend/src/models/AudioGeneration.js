const mongoose = require('mongoose');
const { generateAudioGenerationId } = require('../utils/id');

// Standalone text-to-speech generations (Audio Studio), independent of the
// video pipeline's per-scene audio. Single-user app (see middleware/auth.js)
// so, like FavoriteVoice, this isn't scoped to a user id.
const audioGenerationSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: generateAudioGenerationId,
    },
    // 'single': one voice, one output file (voice/audioUrl/duration below).
    // 'dialogue': multi-speaker script, one output file per turn (turns below).
    mode: {
      type: String,
      enum: ['single', 'dialogue'],
      default: 'single',
    },
    text: {
      type: String,
      required: [true, 'text is required'],
      trim: true,
    },
    voice: {
      type: String,
      required: function requiredForSingleMode() {
        return this.mode === 'single';
      },
    },
    // Single mode only: optional free-text delivery/emotion note (e.g.
    // "cheerful and energetic", "slow and sad") passed to the TTS model's
    // instruct prompt in place of the generic narrator default.
    emotion: {
      type: String,
      default: '',
    },
    // Dialogue mode only: the speaker roster the script's "Name:" prefixes
    // were resolved against.
    speakers: [
      {
        _id: false,
        name: { type: String, required: true },
        voice: { type: String, required: true },
      },
    ],
    // Dialogue mode only: one entry per parsed script line/turn, in order.
    turns: [
      {
        _id: false,
        order: { type: Number, required: true },
        speaker: { type: String, required: true },
        voice: { type: String, required: true },
        text: { type: String, required: true },
        // Parsed from an optional "Name (emotion): line" prefix - see
        // parseDialogueScript.
        emotion: { type: String, default: '' },
        file: { type: String, default: null },
        duration: { type: Number, default: null },
      },
    ],
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
    },
    audioUrl: {
      type: String,
      default: null,
    },
    duration: {
      type: Number,
      default: null,
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

audioGenerationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AudioGeneration', audioGenerationSchema);
