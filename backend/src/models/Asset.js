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
    // sha256 of the uploaded bytes. Two assets sharing a contentHash are
    // byte-identical copies stored under different keys - which is what
    // makes "how much of what we generate have we generated before"
    // answerable without re-reading objects out of MinIO.
    contentHash: {
      type: String,
      default: null,
    },
    // The producing step's input hash, where the producer knows one (TTS
    // passes CacheService.hashTtsInputs). contentHash says the bytes match;
    // cacheKey says the inputs did - the two disagreeing is the signal that
    // a generation step isn't as deterministic as its cache assumes.
    cacheKey: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

assetSchema.index({ ownerType: 1, category: 1 });
assetSchema.index({ ownerId: 1, key: 1 }, { unique: true });
assetSchema.index({ contentHash: 1 }, { sparse: true });
assetSchema.index({ cacheKey: 1 }, { sparse: true });

const Asset = mongoose.model('Asset', assetSchema);

Asset.OWNER_TYPES = OWNER_TYPES;
Asset.ASSET_CATEGORIES = ASSET_CATEGORIES;

module.exports = Asset;
