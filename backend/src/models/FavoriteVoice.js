const mongoose = require('mongoose');
const { generateFavoriteVoiceId } = require('../utils/id');

// This app is single-user (see middleware/auth.js), so favorites aren't
// scoped to a user id - just a flat set of favorited voice ids
// (e.g. "custom:Ryan", "clone:aiden.wav").
const favoriteVoiceSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: generateFavoriteVoiceId,
    },
    voiceId: {
      type: String,
      required: [true, 'voiceId is required'],
      unique: true,
      trim: true,
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

module.exports = mongoose.model('FavoriteVoice', favoriteVoiceSchema);
