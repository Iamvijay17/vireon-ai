const mongoose = require('mongoose');
const { PUBLISH_STATUS, PUBLISH_PLATFORM } = require('../constants');
const { generatePublishingJobId } = require('../utils/id');

const STATUS_VALUES = Object.values(PUBLISH_STATUS);

// A job in one of these is owned by a worker right now (or should be).
const ACTIVE_STATUSES = Object.freeze([
  PUBLISH_STATUS.VALIDATING,
  PUBLISH_STATUS.UPLOADING,
  PUBLISH_STATUS.PROCESSING,
]);

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
 * One publish attempt of one lesson to one destination (a YouTube upload), or
 * one Udemy package build. It is the durable record behind the dashboard's
 * queue, history and retry buttons: everything a worker learns is written here
 * first, so a restart resumes from this document instead of from memory.
 *
 * Two fields carry the safety properties:
 *  - `dedupeKey` has a partial unique index. It exists only while the job
 *    would be a duplicate if repeated (draft / in flight / completed) and is
 *    $unset on failure or cancellation, so double-clicks and concurrent
 *    requests lose a race at the database instead of uploading twice.
 *  - `remote.videoId` is written the instant YouTube returns it; a retry that
 *    finds one verifies that video instead of uploading another.
 */
const publishingJobSchema = new mongoose.Schema(
  {
    _id: { type: String, default: generatePublishingJobId },
    ownerId: { type: String, required: true, index: true },
    platform: { type: String, enum: Object.values(PUBLISH_PLATFORM), required: true },
    accountId: { type: String, ref: 'PlatformAccount', default: null, index: true },
    // A job publishes ONE of: a course lesson (courseId + courseVideoId), a standalone video
    // (videoJobId), or - for a Udemy package - a whole course (courseId only).
    courseId: { type: String, ref: 'Course', default: null, index: true },
    courseVideoId: { type: String, ref: 'CourseVideo', default: null, index: true },
    videoJobId: { type: String, ref: 'VideoJob', default: null, index: true },
    lessonTitle: { type: String, default: '' },

    status: { type: String, enum: STATUS_VALUES, default: PUBLISH_STATUS.DRAFT, index: true },

    // What will be sent to YouTube. Editable until the job is submitted.
    metadata: {
      title: { type: String, default: '' },
      description: { type: String, default: '' },
      tags: { type: [String], default: [] },
      categoryId: { type: String, default: '27' },
      language: { type: String, default: '' },
      privacyStatus: { type: String, enum: ['private', 'unlisted', 'public'], default: 'private' },
      // YouTube publishes a private video at this time.
      publishAt: { type: Date, default: null },
      madeForKids: { type: Boolean, default: false },
      containsSyntheticMedia: { type: Boolean, default: true },
    },

    // Snapshot of the stored video the job was created for. The upload reads
    // exactly this object; if it changes underneath (re-render) the job fails
    // loudly instead of publishing something the user never previewed.
    source: {
      bucket: { type: String, default: '' },
      key: { type: String, default: '' },
      size: { type: Number, default: 0 },
      etag: { type: String, default: '' },
      contentType: { type: String, default: 'video/mp4' },
      fileName: { type: String, default: '' },
    },

    // What makes two jobs "the same publish" (account + lesson + exact file).
    // Kept for the life of the job; `dedupeKey` below is the live lock copy of it.
    fingerprint: { type: String, default: '' },
    dedupeKey: { type: String, default: undefined },

    progress: {
      percent: { type: Number, default: 0, min: 0, max: 100 },
      bytesUploaded: { type: Number, default: 0 },
      bytesTotal: { type: Number, default: 0 },
      phase: { type: String, default: '' },
    },

    remote: {
      videoId: { type: String, default: '' },
      url: { type: String, default: '' },
      studioUrl: { type: String, default: '' },
      // The resumable-upload session URL is a bearer capability: whoever holds
      // it can write to the upload. Encrypted and never selected by default.
      sessionEnc: { type: String, default: '', select: false },
      uploadStatus: { type: String, default: '' },
      privacyStatus: { type: String, default: '' },
      processingState: { type: String, default: '' },
    },

    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    // Waits for a daily-quota reset / YouTube processing don't spend attempts
    // but are bounded so a job cannot wait forever.
    deferrals: { type: Number, default: 0 },
    processingChecks: { type: Number, default: 0 },
    nextRetryAt: { type: Date, default: null, index: true },

    // Worker lease: a worker owns the job until `expiresAt`, renewed as it
    // makes progress. An expired lease means that worker died.
    lease: {
      owner: { type: String, default: '' },
      expiresAt: { type: Date, default: null },
    },

    error: {
      code: { type: String, default: '' },
      message: { type: String, default: '' },
      action: { type: String, default: '' },
      retryable: { type: Boolean, default: false },
      httpStatus: { type: Number, default: null },
      at: { type: Date, default: null },
    },

    approvedAt: { type: Date, default: null },
    queuedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    // Set when a new upload session starts - what the daily quota guard counts.
    quotaCountedAt: { type: Date, default: null, index: true },

    // Udemy package builds only.
    exportOptions: {
      includeMedia: { type: Boolean, default: true },
      includeCaptions: { type: Boolean, default: true },
      allowIncomplete: { type: Boolean, default: false },
    },
    exportResult: {
      bucket: { type: String, default: '' },
      key: { type: String, default: '' },
      fileName: { type: String, default: '' },
      size: { type: Number, default: 0 },
      validation: { type: mongoose.Schema.Types.Mixed, default: null },
      totals: { type: mongoose.Schema.Types.Mixed, default: null },
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
        if (ret.remote) delete ret.remote.sessionEnc;
        // Internal storage location of the render; the UI only needs the size.
        if (ret.source) {
          delete ret.source.bucket;
          delete ret.source.key;
        }
        if (ret.exportResult) {
          // Internal storage location; the download endpoint is the public handle.
          delete ret.exportResult.bucket;
          delete ret.exportResult.key;
        }
        return ret;
      },
    },
  }
);

publishingJobSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } }
);
publishingJobSchema.index({ ownerId: 1, createdAt: -1 });
publishingJobSchema.index({ status: 1, nextRetryAt: 1 });

const PublishingJob = mongoose.model('PublishingJob', publishingJobSchema);
PublishingJob.ACTIVE_STATUSES = ACTIVE_STATUSES;
module.exports = PublishingJob;
