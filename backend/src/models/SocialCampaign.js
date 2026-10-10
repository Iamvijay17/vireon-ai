const mongoose = require('mongoose');
const { SOCIAL_PLATFORM } = require('../constants');
const { generateSocialCampaignId } = require('../utils/id');

const TONES = Object.freeze(['professional', 'educational', 'entertaining', 'promotional', 'casual']);

// The copy for one platform. Editable until it is snapshotted onto a SocialPost.
const variantSchema = new mongoose.Schema(
  {
    caption: { type: String, default: '' },
    hashtags: { type: [String], default: [] },
    cta: { type: String, default: '' },
    linkUrl: { type: String, default: '' },
    // 'ai' once the LLM wrote it, 'manual' when a person typed or edited it.
    origin: { type: String, enum: ['ai', 'manual'], default: 'manual' },
  },
  { _id: false }
);

// A stored object (a rendered video, a thumbnail, an uploaded image). The
// worker re-checks size/etag before posting, so a re-render underneath never
// publishes something the user did not preview.
const mediaSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['video', 'image'], required: true },
    bucket: { type: String, required: true },
    key: { type: String, required: true },
    size: { type: Number, default: 0 },
    etag: { type: String, default: '' },
    contentType: { type: String, default: '' },
    fileName: { type: String, default: '' },
    durationSec: { type: Number, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    // Where the numbers above came from: 'record' = taken from the generation record (may differ
    // slightly from the rendered file), 'none' = unknown, so validation can only warn.
    measured: { type: String, enum: ['file', 'record', 'none'], default: 'none' },
  },
  { _id: false }
);

/**
 * A promotion: one piece of media plus the brief and the per-platform copy.
 * It is the thing the user edits; nothing is posted from it directly. Publishing
 * snapshots it into one SocialPost per chosen account (models/SocialPost), which
 * is the durable per-destination record.
 */
const socialCampaignSchema = new mongoose.Schema(
  {
    _id: { type: String, default: generateSocialCampaignId },
    ownerId: { type: String, required: true, index: true },
    title: { type: String, required: true, maxlength: 140 },
    status: { type: String, enum: ['draft', 'archived'], default: 'draft' },

    // The Vireon video this promotes (null for an uploaded image/video).
    source: {
      videoJobId: { type: String, ref: 'VideoJob', default: null },
      courseVideoId: { type: String, ref: 'CourseVideo', default: null },
      title: { type: String, default: '' },
      description: { type: String, default: '' },
    },

    brief: {
      goal: { type: String, default: '', maxlength: 500 },
      topic: { type: String, default: '', maxlength: 500 },
      audience: { type: String, default: '', maxlength: 300 },
      cta: { type: String, default: '', maxlength: 200 },
      tone: { type: String, enum: TONES, default: 'casual' },
      destinationUrl: { type: String, default: '', maxlength: 2000 },
    },

    media: { type: mediaSchema, default: null },
    // Cover/thumbnail shown in previews.
    thumbnail: { type: mediaSchema, default: null },

    // Per-platform copy, keyed by SOCIAL_PLATFORM.
    variants: {
      [SOCIAL_PLATFORM.FACEBOOK]: { type: variantSchema, default: undefined },
      [SOCIAL_PLATFORM.INSTAGRAM]: { type: variantSchema, default: undefined },
      [SOCIAL_PLATFORM.THREADS]: { type: variantSchema, default: undefined },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        // Storage location is internal; the UI reaches media through /api/social/campaigns/:id/media.
        for (const field of ['media', 'thumbnail']) {
          if (ret[field]) {
            delete ret[field].bucket;
            delete ret[field].key;
          }
        }
        return ret;
      },
    },
  }
);

socialCampaignSchema.index({ ownerId: 1, updatedAt: -1 });

const SocialCampaign = mongoose.model('SocialCampaign', socialCampaignSchema);
SocialCampaign.TONES = TONES;
module.exports = SocialCampaign;
