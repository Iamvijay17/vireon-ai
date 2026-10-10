const { z } = require('zod');
const config = require('../../config');
const LoggerService = require('../common/LoggerService');
const PublishingJob = require('../../models/PublishingJob');
const PlatformAccount = require('../../models/PlatformAccount');
const CourseVideo = require('../../models/CourseVideo');
const Course = require('../../models/Course');
const CoursePublishingProfile = require('../../models/CoursePublishingProfile');
const { PUBLISH_STATUS, PUBLISH_PLATFORM, STAGE_STATUS } = require('../../constants');
const { NotFoundError, ValidationError, ConflictError, SchemaValidationError } = require('../../utils/errors');
const { idPatternFor } = require('../../utils/id');
const { retryJobId } = require('../common/retryPolicy');
const { getStorageProvider } = require('../storage/providers');
const cipher = require('./crypto');
const { PublishError } = require('./errors');
const { quotaDayStart, nextQuotaReset } = require('./quota');
const { validateYouTubeMetadata, mergeAndValidate, CATEGORY_IDS } = require('./youtube/metadata');
const { CATEGORIES, REQUIRED_SCOPES } = require('./youtube/constants');
const { UDEMY_CAPABILITIES } = require('./udemy/capabilities');
const { loadCourseData } = require('./udemy/courseData');
const { buildCoursePlan, validateCoursePlan } = require('./udemy/coursePlan');
const PublishingJobStore = require('./PublishingJobStore');
const events = require('./PublishingEvents');

const S = PUBLISH_STATUS;
const FINISHED = [S.COMPLETED, S.FAILED, S.CANCELLED];
const CANCELLABLE = [S.QUEUED, S.RETRYING, S.VALIDATING, S.UPLOADING, S.PROCESSING];
// A failure with one of these needs a new draft (the thing it was about is gone/changed) - retrying the same job cannot help.
const NOT_RETRYABLE_CODES = new Set(['SOURCE_MISSING', 'SOURCE_CHANGED', 'REMOTE_REJECTED', 'NOT_CONFIGURED']);

const LANGUAGE_CODES = { english: 'en', hindi: 'hi', spanish: 'es', french: 'fr', german: 'de', japanese: 'ja', korean: 'ko' };

const draftInputSchema = z.object({
  accountId: z.string().regex(idPatternFor('pac'), 'Invalid account id'),
  courseVideoId: z.string().regex(idPatternFor('vid'), 'Invalid lesson id'),
  metadata: z.record(z.unknown()).optional().default({}),
  // Publish this exact file to this channel again even though a completed job exists.
  allowReupload: z.boolean().optional().default(false),
});

const exportInputSchema = z.object({
  includeMedia: z.boolean().optional().default(true),
  includeCaptions: z.boolean().optional().default(true),
  allowIncomplete: z.boolean().optional().default(false),
});

const listFilterSchema = z.object({
  platform: z.enum(Object.values(PUBLISH_PLATFORM)).optional(),
  status: z.enum(Object.values(PUBLISH_STATUS)).optional(),
  courseId: z.string().regex(idPatternFor('cou')).optional(),
  courseVideoId: z.string().regex(idPatternFor('vid')).optional(),
  // Query strings: z.coerce.boolean() would turn "false" into true.
  finished: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

function parse(schema, input) {
  const result = schema.safeParse(input ?? {});
  if (!result.success) throw new SchemaValidationError(result.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })));
  return result.data;
}

const hasRender = (v) => Boolean(v.renderUrl) && (v.videoStatus === STAGE_STATUS.COMPLETED || v.status === 'Completed');

/**
 * Application service behind the publishing API. It owns the rules that make
 * publishing safe, in one place:
 *
 *  - nothing is queued without an explicit `confirm` on a DRAFT (no side-effect
 *    publishing, ever);
 *  - every read/write is scoped to the owner, and a job that belongs to someone
 *    else is indistinguishable from one that does not exist (404);
 *  - a duplicate of an active/finished upload loses a race in the database
 *    (unique partial index on dedupeKey), not in application code.
 *
 * Collaborators are injectable so the rules can be tested without Mongo/Redis.
 */
class PublishingService {
  constructor({
    Job = PublishingJob, Accounts = PlatformAccount, auth, queues, storage = null,
    store = new PublishingJobStore(), settings = () => config.publishing, now = () => Date.now(),
  } = {}) {
    this.Job = Job;
    this.Accounts = Accounts;
    this.auth = auth;
    this.queues = queues; // (kind) => queue
    this._storage = storage;
    this.store = store;
    this.settings = settings;
    this.now = now;
  }

  get storage() {
    return this._storage || getStorageProvider();
  }

  // ── capabilities ─────────────────────────────────────────────────────────

  async getCapabilities() {
    const { youtube } = this.settings();
    const since = quotaDayStart(new Date(this.now()));
    let usedToday = 0;
    try {
      usedToday = await this.store.countUploadsSince(since);
    } catch (err) {
      LoggerService.warn('Could not count today\'s uploads', { error: err.message });
    }
    const restrictions = [];
    if (!youtube.apiVerified) {
      restrictions.push('Your Google API project is not marked verified, so YouTube locks uploads to Private. Only private uploads are offered until you pass the API audit and set YOUTUBE_API_VERIFIED=true.');
    }
    return {
      youtube: {
        configured: this.auth.isConfigured(),
        apiVerified: youtube.apiVerified,
        scopes: REQUIRED_SCOPES,
        privacyOptions: youtube.apiVerified ? ['private', 'unlisted', 'public'] : ['private'],
        schedulingAvailable: youtube.apiVerified,
        maxUploadBytes: youtube.maxUploadBytes,
        dailyUploadLimit: youtube.dailyUploadLimit,
        uploadsToday: usedToday,
        quotaResetsAt: nextQuotaReset(new Date(this.now())).toISOString(),
        categories: CATEGORIES,
        restrictions,
      },
      udemy: UDEMY_CAPABILITIES,
      authentication: {
        enabled: false,
        note: 'Vireon has no user accounts: every connected platform account and publishing job belongs to the single local owner. Do not expose this API to an untrusted network.',
      },
    };
  }

  // ── lessons ──────────────────────────────────────────────────────────────

  /** A course's lessons with their render and publishing state, for the dashboard's selector. */
  async listLessons(ownerId, courseId) {
    const course = await Course.findById(courseId).lean();
    if (!course) throw new NotFoundError('Course not found');
    const videos = await CourseVideo.find({ courseId }).sort({ order: 1 }).lean();
    const jobs = await this.Job.find({ ownerId, platform: PUBLISH_PLATFORM.YOUTUBE, courseVideoId: { $in: videos.map((v) => String(v._id)) } })
      .sort({ createdAt: -1 }).lean();

    const byVideo = new Map();
    for (const job of jobs) {
      const list = byVideo.get(job.courseVideoId) || [];
      list.push(job);
      byVideo.set(job.courseVideoId, list);
    }

    return {
      course: { _id: course._id, title: course.title, language: course.language, category: course.category },
      lessons: videos.map((v) => {
        const mine = byVideo.get(String(v._id)) || [];
        const publishable = hasRender(v);
        return {
          _id: v._id,
          title: v.title,
          order: v.order,
          isPromo: Boolean(v.isPromo),
          durationSeconds: v.audioDuration || null,
          renderUrl: publishable ? v.renderUrl : '',
          publishable,
          reason: publishable ? '' : 'Not rendered yet',
          latestJob: mine[0] ? { _id: mine[0]._id, status: mine[0].status, accountId: mine[0].accountId } : null,
          published: mine.filter((j) => j.status === S.COMPLETED).map((j) => ({ jobId: j._id, accountId: j.accountId, videoId: j.remote?.videoId, url: j.remote?.url })),
        };
      }),
    };
  }

  // ── drafts ───────────────────────────────────────────────────────────────

  #fingerprint({ ownerId, accountId, courseVideoId, source, nonce = '' }) {
    return cipher.sha256(['youtube', ownerId, accountId, courseVideoId, source.key, source.etag || source.size, nonce].join('|'));
  }

  async #connectedAccount(ownerId, accountId) {
    const account = await this.Accounts.findOne({ _id: accountId, ownerId }).select('+refreshTokenEnc');
    if (!account) throw new NotFoundError('Account not found');
    if (account.status !== PlatformAccount.ACCOUNT_STATUS.CONNECTED || !cipher.isReadable(account.refreshTokenEnc)) {
      throw new ConflictError('This YouTube account needs to be reconnected before it can be used');
    }
    return account;
  }

  #defaultMetadata({ video, course, profile }) {
    const { youtube } = this.settings();
    const defaults = profile?.youtubeDefaults || {};
    const scriptTags = Array.isArray(video.script?.tags) ? video.script.tags : [];
    return {
      title: String(video.script?.title || video.title || '').slice(0, 100),
      description: String(video.script?.description || video.topic || '').trim(),
      tags: [...new Set([...(defaults.tags || []), ...scriptTags])],
      categoryId: CATEGORY_IDS.includes(defaults.categoryId) ? defaults.categoryId : '27',
      language: defaults.language || LANGUAGE_CODES[course.language] || '',
      // Starts at the course's configured visibility, but only an audited project may default beyond
      // private - and nothing is published until someone approves the draft.
      privacyStatus: youtube.apiVerified && defaults.privacyStatus ? defaults.privacyStatus : 'private',
      publishAt: null,
      madeForKids: Boolean(defaults.madeForKids),
      containsSyntheticMedia: true,
    };
  }

  /**
   * Create (or return the existing) publishing DRAFT for a lesson. Nothing is
   * queued or uploaded; this only snapshots the video and pre-fills metadata.
   */
  async createDraft(ownerId, input) {
    const { accountId, courseVideoId, metadata, allowReupload } = parse(draftInputSchema, input);
    const { youtube } = this.settings();

    const account = await this.#connectedAccount(ownerId, accountId);
    const video = await CourseVideo.findById(courseVideoId).lean();
    if (!video) throw new NotFoundError('Lesson not found');
    if (!hasRender(video)) throw new ValidationError('This lesson has not been rendered yet - render it before publishing');
    const [course, profile] = await Promise.all([
      Course.findById(video.courseId).lean(),
      CoursePublishingProfile.findOne({ _id: video.courseId, ownerId }).lean(),
    ]);

    const { bucket, key } = this.storage.parsePublicUrl(video.renderUrl);
    const stat = await this.storage.statObject(bucket, key);
    if (!stat || !(stat.size > 0)) throw new ValidationError('The rendered video file is missing from storage - re-render the lesson');
    if (stat.size > youtube.maxUploadBytes) {
      throw new ValidationError(`The video is ${Math.round(stat.size / 1048576)} MB, over the configured upload limit of ${Math.round(youtube.maxUploadBytes / 1048576)} MB`);
    }

    const merged = mergeAndValidate(this.#defaultMetadata({ video, course: course || {}, profile }), metadata, { apiVerified: youtube.apiVerified, now: this.now() });
    const source = { bucket, key, size: stat.size, etag: stat.etag, contentType: 'video/mp4', fileName: `${video.title}.mp4` };

    let nonce = '';
    if (allowReupload) {
      const completed = await this.Job.exists({ ownerId, accountId, courseVideoId, platform: PUBLISH_PLATFORM.YOUTUBE, status: S.COMPLETED });
      if (completed) nonce = `re-${this.now()}`;
    }
    const fingerprint = this.#fingerprint({ ownerId, accountId: account._id, courseVideoId, source, nonce });

    try {
      const job = await this.Job.create({
        ownerId, platform: PUBLISH_PLATFORM.YOUTUBE, accountId: account._id,
        courseId: video.courseId, courseVideoId, lessonTitle: video.title,
        status: S.DRAFT, metadata: merged, source, fingerprint, dedupeKey: fingerprint,
        maxAttempts: youtube.maxAttempts,
        progress: { bytesTotal: stat.size },
        events: [{ status: S.DRAFT, message: 'Draft created - review the details, then publish' }],
      });
      events.emitJob(job);
      return { job, existing: false };
    } catch (err) {
      if (err?.code !== 11000) throw err;
      const existing = await this.Job.findOne({ dedupeKey: fingerprint, ownerId });
      if (existing?.status === S.DRAFT) return { job: existing, existing: true };
      throw new ConflictError(
        existing?.status === S.COMPLETED
          ? 'This video was already published to this channel. Choose "publish again" if you really want a second copy.'
          : `This video already has a publishing job in progress (${existing?.status || 'active'}) for this channel`
      );
    }
  }

  async #owned(ownerId, jobId, projection = null) {
    const job = await this.Job.findOne({ _id: jobId, ownerId }, projection);
    if (!job) throw new NotFoundError('Publishing job not found');
    return job;
  }

  /** Edit what will be sent - only before it is submitted (or after it failed without uploading). */
  async updateMetadata(ownerId, jobId, patch) {
    const job = await this.#owned(ownerId, jobId);
    if (job.platform !== PUBLISH_PLATFORM.YOUTUBE) throw new ValidationError('Only YouTube jobs have editable metadata');
    const editable = job.status === S.DRAFT || (job.status === S.FAILED && !job.remote?.videoId);
    if (!editable) throw new ConflictError(`A job in ${job.status} state can no longer be edited`);

    const { youtube } = this.settings();
    const merged = mergeAndValidate(job.toObject().metadata, patch, { apiVerified: youtube.apiVerified, now: this.now() });
    const updated = await this.Job.findOneAndUpdate(
      { _id: jobId, ownerId, status: job.status },
      { $set: { metadata: merged }, $push: { events: { $each: [{ at: new Date(), status: job.status, message: 'Details edited' }], $slice: -60 } } },
      { new: true }
    );
    if (!updated) throw new ConflictError('The job changed while you were editing it - reload and try again');
    events.emitJob(updated);
    return updated;
  }

  /** Approve a DRAFT: the one and only way a YouTube upload starts. */
  async submit(ownerId, jobId, { confirm } = {}) {
    if (confirm !== true) {
      throw new ValidationError('Publishing needs explicit confirmation (confirm: true)');
    }
    const job = await this.#owned(ownerId, jobId);
    if (job.platform !== PUBLISH_PLATFORM.YOUTUBE) throw new ValidationError('Only YouTube jobs are submitted for publishing');
    if (job.status !== S.DRAFT) throw new ConflictError(`This job is already ${job.status}`);

    const { youtube } = this.settings();
    validateYouTubeMetadata(job.toObject().metadata, { apiVerified: youtube.apiVerified, now: this.now() });
    await this.#connectedAccount(ownerId, job.accountId);
    const stat = await this.storage.statObject(job.source.bucket, job.source.key);
    if (!stat) throw new ValidationError('The rendered video file is missing from storage - re-render the lesson and create a new draft');
    if (stat.size !== job.source.size || (job.source.etag && stat.etag && stat.etag !== job.source.etag)) {
      throw new ConflictError('The lesson was re-rendered after this draft was created. Create a new draft to publish the current version.');
    }

    const at = new Date(this.now());
    const queued = await this.Job.findOneAndUpdate(
      { _id: jobId, ownerId, status: S.DRAFT },
      {
        $set: { status: S.QUEUED, approvedAt: at, queuedAt: at, attempts: 0, deferrals: 0, processingChecks: 0, nextRetryAt: null, 'progress.phase': 'Queued' },
        $push: { events: { $each: [{ at, status: S.QUEUED, message: 'Approved for publishing and queued' }], $slice: -60 } },
      },
      { new: true }
    );
    if (!queued) throw new ConflictError('This job was already submitted');

    const enqueued = await this.#enqueue(queued);
    events.emitJob(queued);
    LoggerService.info('Publishing job approved and queued', { jobId, platform: queued.platform, enqueued });
    return { job: queued, enqueued };
  }

  async retry(ownerId, jobId) {
    const job = await this.#owned(ownerId, jobId);
    if (job.status !== S.FAILED) throw new ConflictError('Only a failed job can be retried');
    if (NOT_RETRYABLE_CODES.has(job.error?.code)) {
      throw new ConflictError(job.error?.action || 'This failure cannot be fixed by retrying - create a new publishing draft');
    }
    if (job.platform === PUBLISH_PLATFORM.YOUTUBE) await this.#connectedAccount(ownerId, job.accountId);

    const at = new Date(this.now());
    try {
      const queued = await this.Job.findOneAndUpdate(
        { _id: jobId, ownerId, status: S.FAILED },
        {
          $set: {
            status: S.QUEUED, queuedAt: at, approvedAt: job.approvedAt || at, attempts: 0, deferrals: 0, processingChecks: 0, nextRetryAt: null,
            dedupeKey: job.platform === PUBLISH_PLATFORM.UDEMY_EXPORT ? `udemy-export|${ownerId}|${job.courseId}` : (job.fingerprint || undefined),
            'progress.phase': 'Queued',
            error: { code: '', message: '', action: '', retryable: false, httpStatus: null, at: null },
          },
          $push: { events: { $each: [{ at, status: S.QUEUED, message: job.remote?.videoId ? 'Retry requested - will verify the already-uploaded video' : 'Retry requested' }], $slice: -60 } },
        },
        { new: true }
      );
      if (!queued) throw new ConflictError('The job changed - reload and try again');
      const enqueued = await this.#enqueue(queued);
      events.emitJob(queued);
      return { job: queued, enqueued };
    } catch (err) {
      if (err?.code === 11000) throw new ConflictError('Another publishing job for this lesson is already active');
      throw err;
    }
  }

  async cancel(ownerId, jobId) {
    const job = await this.#owned(ownerId, jobId);
    if (!CANCELLABLE.includes(job.status)) throw new ConflictError(`A job in ${job.status} state cannot be cancelled`);

    const at = new Date(this.now());
    const cancelled = await this.Job.findOneAndUpdate(
      { _id: jobId, ownerId, status: { $in: CANCELLABLE } },
      {
        $set: { status: S.CANCELLED, cancelledAt: at, nextRetryAt: null, 'lease.owner': '', 'lease.expiresAt': null },
        $unset: { dedupeKey: 1 },
        $push: { events: { $each: [{ at, status: S.CANCELLED, level: 'warn', message: job.remote?.videoId ? 'Cancelled - the video already uploaded stays on YouTube' : 'Cancelled by user' }], $slice: -60 } },
      },
      { new: true }
    );
    if (!cancelled) throw new ConflictError('The job changed - reload and try again');
    events.emitJob(cancelled);
    return cancelled;
  }

  /** Remove a draft (or a cancelled job) that never uploaded anything. */
  async discard(ownerId, jobId) {
    const job = await this.#owned(ownerId, jobId);
    if (!([S.DRAFT, S.CANCELLED].includes(job.status)) || job.remote?.videoId) {
      throw new ConflictError('Only drafts and cancelled jobs can be deleted - finished jobs are kept as history');
    }
    await this.Job.deleteOne({ _id: jobId, ownerId, status: job.status });
    return { deleted: true };
  }

  // ── reads ────────────────────────────────────────────────────────────────

  decorate(job) {
    const json = typeof job.toJSON === 'function' ? job.toJSON() : job;
    const platform = json.platform;
    return {
      ...json,
      actions: {
        canEdit: platform === PUBLISH_PLATFORM.YOUTUBE && (json.status === S.DRAFT || (json.status === S.FAILED && !json.remote?.videoId)),
        canSubmit: platform === PUBLISH_PLATFORM.YOUTUBE && json.status === S.DRAFT,
        canRetry: json.status === S.FAILED && !NOT_RETRYABLE_CODES.has(json.error?.code),
        canCancel: CANCELLABLE.includes(json.status),
        canDiscard: [S.DRAFT, S.CANCELLED].includes(json.status) && !json.remote?.videoId,
        canDownload: platform === PUBLISH_PLATFORM.UDEMY_EXPORT && json.status === S.COMPLETED && Boolean(json.exportResult?.fileName),
      },
    };
  }

  async get(ownerId, jobId) {
    return this.decorate(await this.#owned(ownerId, jobId));
  }

  /** Raw document (incl. internal storage location) for the download endpoint. */
  getOwnedRaw(ownerId, jobId) {
    return this.#owned(ownerId, jobId);
  }

  async list(ownerId, rawFilter = {}) {
    const f = parse(listFilterSchema, rawFilter);
    const query = { ownerId };
    if (f.platform) query.platform = f.platform;
    if (f.status) query.status = f.status;
    if (f.courseId) query.courseId = f.courseId;
    if (f.courseVideoId) query.courseVideoId = f.courseVideoId;
    if (f.finished === true) query.status = { $in: FINISHED };
    if (f.finished === false) query.status = { $nin: FINISHED };

    const [jobs, total] = await Promise.all([
      this.Job.find(query).sort({ createdAt: -1 }).skip((f.page - 1) * f.limit).limit(f.limit),
      this.Job.countDocuments(query),
    ]);
    return {
      jobs: jobs.map((j) => this.decorate(j)),
      pagination: { page: f.page, limit: f.limit, total, pages: Math.max(1, Math.ceil(total / f.limit)) },
    };
  }

  // ── Udemy ────────────────────────────────────────────────────────────────

  async getUdemyOverview(ownerId, courseId) {
    const { course, profile, videos } = await loadCourseData(ownerId, courseId);
    const plan = buildCoursePlan({ course, profile: profile || {}, videos });
    const validation = validateCoursePlan(plan);
    const latest = await this.Job.findOne({ ownerId, courseId, platform: PUBLISH_PLATFORM.UDEMY_EXPORT }).sort({ createdAt: -1 });
    return {
      capabilities: UDEMY_CAPABILITIES,
      profile: profile || { _id: courseId, sections: [], learningObjectives: [], prerequisites: [], intendedAudience: [], subtitle: '', description: '', level: 'All Levels' },
      plan: { ...plan, sections: plan.sections.map((s) => ({ ...s, lectures: s.lectures.map(({ video, ...rest }) => ({ ...rest, hasVideo: video.available })) })) },
      validation,
      latestExport: latest ? this.decorate(latest) : null,
    };
  }

  /** Queue a package build. Allowed without a draft step: it publishes nothing anywhere. */
  async createExport(ownerId, courseId, input) {
    const options = parse(exportInputSchema, input);
    const course = await Course.findById(courseId).lean();
    if (!course) throw new NotFoundError('Course not found');

    const at = new Date(this.now());
    try {
      const job = await this.Job.create({
        ownerId, platform: PUBLISH_PLATFORM.UDEMY_EXPORT, courseId, lessonTitle: course.title,
        status: S.QUEUED, queuedAt: at, approvedAt: at, maxAttempts: 3,
        // One build per course at a time; released when it finishes or fails.
        dedupeKey: `udemy-export|${ownerId}|${courseId}`,
        exportOptions: options,
        events: [{ status: S.QUEUED, message: 'Package build queued' }],
      });
      const enqueued = await this.#enqueue(job);
      events.emitJob(job);
      return { job: this.decorate(job), enqueued };
    } catch (err) {
      if (err?.code === 11000) throw new ConflictError('A package for this course is already being built');
      throw err;
    }
  }

  // ── queueing ─────────────────────────────────────────────────────────────

  /**
   * Put a persisted job on its BullMQ queue. Returns false (never throws) when
   * Redis is unreachable: the job is already safely QUEUED in Mongo and the
   * worker's recovery sweep will pick it up - a Redis outage delays publishing
   * but cannot lose it.
   */
  async #enqueue(job, { delayMs = 0 } = {}) {
    try {
      await this.enqueue(job, { delayMs });
      return true;
    } catch (err) {
      LoggerService.error('Could not enqueue publishing job (the recovery sweep will retry)', { jobId: job._id, error: err.message });
      return false;
    }
  }

  async enqueue(job, { delayMs = 0, jobId = null } = {}) {
    const queue = this.queues(job.platform === PUBLISH_PLATFORM.YOUTUBE ? 'youtube' : 'export');
    const stamp = job.nextRetryAt ? new Date(job.nextRetryAt).getTime() : new Date(job.queuedAt || this.now()).getTime();
    await queue.add('publish', { jobId: String(job._id) }, { jobId: jobId || retryJobId(job._id, job.attempts || 0, stamp), delay: Math.max(0, delayMs) });
  }
}

module.exports = PublishingService;
module.exports.NOT_RETRYABLE_CODES = NOT_RETRYABLE_CODES;
module.exports.PublishError = PublishError;
