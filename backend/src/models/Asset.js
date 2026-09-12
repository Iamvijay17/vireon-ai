const mongoose = require('mongoose');

const OWNER_TYPES = ['video', 'course-video', 'audio-studio', 'unknown'];
const ASSET_CATEGORIES = ['audio', 'avatar', 'render', 'audio-studio'];

const assetSchema = new mongoose.Schema(
  {
    ownerType: {
      type: String,
      enum: OWNER_TYPES,
      required: true,
    },
    ownerId: {
      type: String,
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: ASSET_CATEGORIES,
      required: true,
    },
    bucket: {
      type: String,
      required: true,
    },
    key: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      default: null,
    },
    mimeType: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

assetSchema.index({ ownerType: 1, category: 1 });
assetSchema.index({ ownerId: 1, key: 1 }, { unique: true });

const Asset = mongoose.model('Asset', assetSchema);

Asset.OWNER_TYPES = OWNER_TYPES;
Asset.ASSET_CATEGORIES = ASSET_CATEGORIES;

module.exports = Asset;
