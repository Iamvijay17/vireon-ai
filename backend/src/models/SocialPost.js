const mongoose = require('mongoose');
const { PUBLISH_STATUS, SOCIAL_PLATFORM } = require('../constants');
const { generateSocialPostId } = require('../utils/id');

const STATUS_VALUES = Object.values(PUBLISH_STATUS);

// A post in one of these is owned by a worker right now (or should be).
const ACTIVE_STATUSES = Object.freeze([PUBLISH_STATUS.VALIDATING, PUBLISH_STATUS.UPLOADING, PUBLISH_STATUS.PROCESSING]);

const eventSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    status: { type: String },
    level: { type: String, enum: ['info', 'warn', 'error'], default: 'info' },
    message: { type: String, default: '' },
  },
  { _id: false }
);

/**
 * One campaign delivered to ONE social account: the durable record behind the
 * calendar, the history table and every retry button. Destinations are
 * independent documents on purpose - Instagram succeeding and Facebook failing
 * leaves two honest rows, and retrying Facebook cannot touch Instagram's.
 *
 * It shares the worker machinery with PublishingJob (the same status words,
 * lease, events and retry bookkeeping fields, so PublishingJobStore and the
 * recovery sweep work on it unchanged), and adds what is social-specific.
 *
 * Safety properties:
 *  - `dedupeKey` (partial unique index) exists only while the post would be a
 *    duplicate if repeated (scheduled / in flight / completed) and is $unset on
 *    failure or cancellation - concurrent double submits lose at the database.
 *  - `remote.containerId` is saved the moment the platform returns it, and
 *    `remote.publishAttemptedAt` BEFORE the publish call. A retry that finds
 *    either one resumes or reconciles with the platform; it never blindly
 *    creates and publishes a second copy.
 *  - A post is COMPLETED only after the platform confirmed the publish.
 */
const socialPostSchema = new mongoose.Schema(
  {
    _id: { type: String, default: generateSocialPostId },
    ownerId: { type: String, required: true, index: true },
    campaignId: { type: String, ref: 'SocialCampaign', required: true, index: true },
    // Convenience copy of the campaign's source so history can filter by video without a join.
    videoJobId: { type: String, default: null, index: true },
    courseVideoId: { type: String, default: null },

    platform: { type: String, enum: Object.values(SOCIAL_PLATFORM), required: true, index: true },
    accountId: { type: String, ref: 'PlatformAccount', required: true, index: true },
    // Snapshot so history stays readable after the account is disconnected.
    accountLabel: { type: String, default: '' },
    accountHandle: { type: String, default: '' },

    // How it is posted: reel | video | image | text.
    format: { type: String, enum: ['reel', 'video', 'image', 'text'], required: true },

    status: { type: String, enum: STATUS_VALUES, default: PUBLISH_STATUS.DRAFT, index: true },

    // What will be sent. Editable while SCHEDULED (and on a FAILED post before anything was published).
    content: {
      caption: { type: String, default: '' },
      hashtags: { type: [String], default: [] },
      cta: { type: String, default: '' },
      linkUrl: { type: String, default: '' },
    },

    media: {
      kind: { type: String, enum: ['video', 'image', ''], default: '' },
      bucket: { type: String, default: '' },
      key: { type: String, default: '' },
      size: { type: Number, default: 0 },
      etag: { type: String, default: '' },
      contentType: { type: String, default: '' },
      fileName: { type: String, default: '' },
      durationSec: { type: Number, default: null },
      width: { type: Number, default: null },
      height: { type: Number, default: null },
    },

    // UTC instant (always). `timezone` only records how the user chose it, for display.
    scheduledFor: { type: Date, default: null, index: true },
    timezone: { type: String, default: '' },

    fingerprint: { type: String, default: '' },
    dedupeKey: { type: String, default: undefined },

    progress: {
      percent: { type: Number, default: 0, min: 0, max: 100 },
      bytesUploaded: { type: Number, default: 0 },
      bytesTotal: { type: Number, default: 0 },
      phase: { type: String, default: '' },
    },

    remote: {
      containerId: { type: String, default: '' },
      // Facebook video / reel id while it is still being processed.
      videoId: { type: String, default: '' },
      postId: { type: String, default: '' },
      permalink: { type: String, default: '' },
      state: { type: String, default: '' },
      // Set right BEFORE the publish call; with no postId it means "outcome unknown" (see above).
      publishAttemptedAt: { type: Date, default: null },
      publishedAt: { type: Date, default: null },
    },

    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    // User-initiated retries (the Retry button), kept apart from automatic attempts.
    retryCount: { type: Number, default: 0 },
    deferrals: { type: Number, default: 0 },
    processingChecks: { type: Number, default: 0 },
    nextRetryAt: { type: Date, default: null, index: true },

    lease: {
      owner: { type: String, default: '' },
      expiresAt: { type: Date, default: null },
    },

    error: {
      code: { type: String, default: '' },
      message: { type: String, default: '' },
      action: { type: String, default: '' },
      retryable: { type: Boolean, default: false },
      requiresReauth: { type: Boolean, default: false },
      httpStatus: { type: Number, default: null },
      at: { type: Date, default: null },
    },

    approvedAt: { type: Date, default: null },
    queuedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    // Set when a publish is actually sent - what the local daily-quota guard counts.
    quotaCountedAt: { type: Date, default: null, index: true },

    // Last insights pull. `metrics[name] = { available, value, reason? }`: an
    // unavailable metric is never stored as 0.
    insights: {
      fetchedAt: { type: Date, default: null },
      metrics: { type: mongoose.Schema.Types.Mixed, default: null },
      error: { type: String, default: '' },
    },

    events: { type: [eventSchema], default: [] },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        delete ret.dedupeKey;
        delete ret.lease;
        // Internal storage location of the media; the UI only needs size/type.
        if (ret.media) {
          delete ret.media.bucket;
          delete ret.media.key;
        }
        return ret;
      },
    },
  }
);

socialPostSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
socialPostSchema.index({ ownerId: 1, createdAt: -1 });
socialPostSchema.index({ status: 1, scheduledFor: 1 });
socialPostSchema.index({ status: 1, nextRetryAt: 1 });
socialPostSchema.index({ accountId: 1, quotaCountedAt: -1 });

const SocialPost = mongoose.model('SocialPost', socialPostSchema);
SocialPost.ACTIVE_STATUSES = ACTIVE_STATUSES;
module.exports = SocialPost;
