const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');
const { z } = require('zod');
const { customAlphabet } = require('nanoid');
const config = require('../../config');
const LoggerService = require('../common/LoggerService');
const SocialCampaign = require('../../models/SocialCampaign');
const SocialPost = require('../../models/SocialPost');
const PlatformAccount = require('../../models/PlatformAccount');
const { PUBLISH_STATUS, SOCIAL_PLATFORM } = require('../../constants');
const { NotFoundError, ValidationError, ConflictError, SchemaValidationError } = require('../../utils/errors');
const { idPatternFor } = require('../../utils/id');
const { retryJobId } = require('../common/retryPolicy');
const { getStorageProvider } = require('../storage/providers');
const cipher = require('../publishing/crypto');
const MediaSources = require('./mediaSources');
const CaptionService = require('./captionService');
const SocialPostStore = require('./SocialPostStore');
const events = require('./SocialEvents');
const mediaGateway = require('./mediaGateway');
const { providerFor } = require('./providers');
const { validatePost, validateSchedule, normalizeHashtags, composeText } = require('./contentRules');
const { zonedToUtc, isValidTimeZone, utcToZoned } = require('./timezone');
const { readImageSize, sniffMedia } = require('./imageMeta');
const { LIMITS, PLATFORM_LABEL, PLATFORM_DAILY_LIMITS } = require('./constants');
const { aggregateInsights, METRIC_LABELS } = require('./analytics');

const S = PUBLISH_STATUS;
const PLATFORMS = Object.values(SOCIAL_PLATFORM);
const FINISHED = [S.COMPLETED, S.FAILED, S.CANCELLED];
const CANCELLABLE = [S.SCHEDULED, S.QUEUED, S.RETRYING, S.VALIDATING, S.UPLOADING, S.PROCESSING];
// The thing the failure was about is gone/changed: retrying the same post cannot help.
const NOT_RETRYABLE_CODES = new Set(['SOURCE_MISSING', 'SOURCE_CHANGED', 'NOT_CONFIGURED']);
const idTail = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10);

// ── request schemas ─────────────────────────────────────────────────────────

const urlOrEmpty = z.string().max(2000).refine((v) => v === '' || /^https?:\/\/[^\s]+$/i.test(v), 'Must be an http(s) URL');

const briefSchema = z.object({
  goal: z.string().max(500),
  topic: z.string().max(500),
  audience: z.string().max(300),
  cta: z.string().max(200),
  tone: z.enum(SocialCampaign.TONES),
  destinationUrl: urlOrEmpty,
}).partial();

const variantInput = z.object({
  caption: z.string().max(10000),
  hashtags: z.array(z.string().max(100)).max(60),
  cta: z.string().max(300),
  linkUrl: urlOrEmpty,
}).partial();

const sourceIds = {
  videoJobId: z.string().regex(idPatternFor('job'), 'Invalid video id').optional(),
  courseVideoId: z.string().regex(idPatternFor('vid'), 'Invalid lesson id').optional(),
};

const createCampaignSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  ...sourceIds,
  brief: briefSchema.optional(),
}).refine((d) => !(d.videoJobId && d.courseVideoId), { message: 'Choose either a video or a lesson, not both', path: ['videoJobId'] });

const updateCampaignSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  ...sourceIds,
  brief: briefSchema.optional(),
  variants: z.record(z.enum(PLATFORMS), variantInput).optional(),
  // false = go back to the video's own thumbnail-less state (drop an uploaded/selected asset)
  clearMedia: z.boolean().optional(),
}).refine((d) => !(d.videoJobId && d.courseVideoId), { message: 'Choose either a video or a lesson, not both', path: ['videoJobId'] });

const scheduleFields = {
  scheduledFor: z.string().max(64).optional(),
  localDateTime: z.string().max(32).optional(),
  timezone: z.string().max(64).optional(),
};

const destinationSchema = z.object({
  accountId: z.string().regex(idPatternFor('pac'), 'Invalid account id'),
  format: z.enum(['reel', 'video']).optional(),
  content: variantInput.optional(),
});

const publishSchema = z.object({
  confirm: z.literal(true, { errorMap: () => ({ message: 'Publishing needs explicit confirmation (confirm: true)' }) }),
  destinations: z.array(destinationSchema).min(1, 'Choose at least one account').max(20),
  mode: z.enum(['now', 'schedule']),
  ...scheduleFields,
  // Post this exact media to this account again even though a completed post exists.
  allowRepeat: z.boolean().optional().default(false),
});

const validateSchema = z.object({
  destinations: z.array(destinationSchema).min(1).max(20),
  ...scheduleFields,
  mode: z.enum(['now', 'schedule']).optional().default('now'),
});

const editPostSchema = z.object({
  content: variantInput.optional(),
  ...scheduleFields,
});

const listFilterSchema = z.object({
  platform: z.enum(PLATFORMS).optional(),
  status: z.enum(Object.values(S)).optional(),
  accountId: z.string().regex(idPatternFor('pac')).optional(),
  campaignId: z.string().regex(idPatternFor('cam')).optional(),
  videoJobId: z.string().regex(idPatternFor('job')).optional(),
  finished: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const rangeSchema = z.object({
  platform: z.enum(PLATFORMS).optional(),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
});

function parse(schema, input) {
  const result = schema.safeParse(input ?? {});
  if (!result.success) throw new SchemaValidationError(result.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })));
  return result.data;
}

const toDate = (v, fallback = null) => {
  if (!v) return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d;
};

const ownerFilter = (ownerId, extra = {}) => ({ ownerId, ...extra });

/**
 * The application service behind the Promotion Studio API. It owns the rules
 * that make posting safe, in one place:
 *
 *  - nothing is queued without an explicit `confirm`;
 *  - every read/write is scoped to the owner, and another owner's record is
 *    indistinguishable from one that does not exist (404);
 *  - each destination is its OWN SocialPost: one failing never touches the
 *    others, and retrying acts on a single destination;
 *  - a duplicate of a live post loses a race in the database (partial unique
 *    index on dedupeKey), not in application code;
 *  - scheduling persists in Mongo first - the BullMQ delayed job is only a
 *    delivery mechanism, so a Redis flush or a restart cannot lose a post.
 *
 * Collaborators are injectable so the rules can be tested without Mongo/Redis/Meta.
 */
class SocialService {
  constructor({
    Campaigns = SocialCampaign, Posts = SocialPost, Accounts = PlatformAccount, auth, apis, queues, storage = null,
    store = new SocialPostStore(), captions = new CaptionService(), settings = () => config.social, now = () => Date.now(), sources = null,
  } = {}) {
    this.Campaigns = Campaigns;
    this.Posts = Posts;
    this.Accounts = Accounts;
    this.auth = auth;
    this.apis = apis;
    this.queues = queues; // (kind) => queue
    this._storage = storage;
    this.store = store;
    this.captions = captions;
    this.settings = settings;
    this.now = now;
    this._sources = sources;
  }

  get storage() {
    return this._storage || getStorageProvider();
  }

  get sources() {
    return this._sources || new MediaSources({ storage: this.storage });
  }

  // ── capabilities ─────────────────────────────────────────────────────────

  getCapabilities() {
    const s = this.settings();
    const publicMedia = mediaGateway.isConfigured(s);
    const meta = this.auth.isConfigured('meta');
    const threads = this.auth.isConfigured('threads');
    const restrictions = [];
    if (!publicMedia) {
      restrictions.push('No public media URL is configured (SOCIAL_PUBLIC_MEDIA_BASE_URL). Facebook posts work; Threads media posts and Instagram image posts are blocked, and Instagram videos can only use the resumable-upload path that Meta documents for Facebook Login for Business apps.');
    }
    return {
      platforms: {
        facebook: { label: 'Facebook', configured: meta, formats: ['text', 'image', 'reel', 'video'], needsPublicMedia: false, dailyLimit: Math.min(s.dailyLimits.facebook, PLATFORM_DAILY_LIMITS.facebook), limitApplies: 'Reels only', limits: LIMITS.facebook },
        instagram: { label: 'Instagram', configured: meta, formats: ['image', 'reel'], needsPublicMedia: 'images always; videos unless resumable upload is available', dailyLimit: Math.min(s.dailyLimits.instagram, PLATFORM_DAILY_LIMITS.instagram), limits: LIMITS.instagram },
        threads: { label: 'Threads', configured: threads, formats: ['text', 'image', 'video'], needsPublicMedia: 'image and video posts', dailyLimit: Math.min(s.dailyLimits.threads, PLATFORM_DAILY_LIMITS.threads), limits: LIMITS.threads },
      },
      publicMedia: { configured: publicMedia },
      scheduling: { minLeadMinutes: Math.round(s.minScheduleLeadMs / 60000), maxAheadDays: s.maxScheduleAheadDays },
      uploads: { maxImageBytes: s.maxImageBytes, maxVideoBytes: s.maxVideoBytes, imageTypes: ['image/jpeg', 'image/png'], videoTypes: ['video/mp4', 'video/quicktime'] },
      metricLabels: METRIC_LABELS,
      restrictions,
      testing: {
        sandbox: false,
        note: 'Meta offers no publishing sandbox. While your Meta app is in Development mode, only accounts with a role on the app can connect, and posts made through them are REAL posts on those accounts. Use "Check" on a post to validate it without publishing.',
      },
      authentication: { enabled: false, note: 'Vireon has no user accounts: every connected account and post belongs to the single local owner. Do not expose this API to an untrusted network.' },
    };
  }

  // ── library ──────────────────────────────────────────────────────────────

  library() {
    return this.sources.library();
  }

  // ── campaigns ────────────────────────────────────────────────────────────

  #presentCampaign(c) {
    const json = typeof c.toJSON === 'function' ? c.toJSON() : { ...c };
    const raw = typeof c.toObject === 'function' ? c.toObject() : c;
    for (const field of ['media', 'thumbnail']) {
      if (raw[field]?.bucket) json[field] = { ...(json[field] || {}), previewPath: `/${raw[field].bucket}/${raw[field].key}` };
    }
    return json;
  }

  async #ownedCampaign(ownerId, id) {
    const c = await this.Campaigns.findOne({ _id: id, ownerId });
    if (!c) throw new NotFoundError('Campaign not found');
    return c;
  }

  #defaultVariant(platform, campaign) {
    const title = campaign.source?.title || campaign.title || '';
    const description = campaign.source?.description || '';
    const cta = campaign.brief?.cta || '';
    const link = platform === SOCIAL_PLATFORM.INSTAGRAM ? '' : (campaign.brief?.destinationUrl || '');
    const caption = [title, description && description !== title ? description : ''].filter(Boolean).join('\n\n');
    return { caption, hashtags: [], cta, linkUrl: link, origin: 'manual' };
  }

  async createCampaign(ownerId, input) {
    const data = parse(createCampaignSchema, input);
    let resolved = null;
    if (data.videoJobId || data.courseVideoId) resolved = await this.sources.resolve(data);

    const campaign = await this.Campaigns.create({
      ownerId,
      title: data.title || resolved?.title || 'Untitled promotion',
      source: resolved?.source || {},
      brief: { ...(data.brief || {}), ...(data.brief?.topic ? {} : { topic: resolved?.title || '' }) },
      media: resolved?.media || null,
      thumbnail: resolved?.thumbnail || null,
    });
    return this.#presentCampaign(campaign);
  }

  async updateCampaign(ownerId, id, input) {
    const data = parse(updateCampaignSchema, input);
    const campaign = await this.#ownedCampaign(ownerId, id);
    const set = {};

    if (data.title) set.title = data.title;
    if (data.brief) for (const [k, v] of Object.entries(data.brief)) set[`brief.${k}`] = v;

    if (data.videoJobId || data.courseVideoId) {
      const resolved = await this.sources.resolve(data);
      set.source = resolved.source;
      set.media = resolved.media;
      set.thumbnail = resolved.thumbnail;
      if (!data.title && (!campaign.title || campaign.title === 'Untitled promotion')) set.title = resolved.title;
    }
    if (data.clearMedia) {
      set.media = null;
      set.thumbnail = null;
      set.source = {};
    }

    if (data.variants) {
      for (const [platform, v] of Object.entries(data.variants)) {
        const current = campaign.toObject().variants?.[platform] || this.#defaultVariant(platform, campaign.toObject());
        set[`variants.${platform}`] = {
          caption: v.caption ?? current.caption,
          hashtags: v.hashtags ? normalizeHashtags(v.hashtags) : current.hashtags,
          cta: v.cta ?? current.cta,
          linkUrl: v.linkUrl ?? current.linkUrl,
          origin: 'manual',
        };
      }
    }

    const updated = await this.Campaigns.findOneAndUpdate({ _id: id, ownerId }, { $set: set }, { new: true });
    if (!updated) throw new NotFoundError('Campaign not found');
    return this.#presentCampaign(updated);
  }

  async getCampaign(ownerId, id) {
    const campaign = await this.#ownedCampaign(ownerId, id);
    const posts = await this.Posts.find({ ownerId, campaignId: id }).sort({ createdAt: -1 });
    return { campaign: this.#presentCampaign(campaign), posts: posts.map((p) => this.decorate(p)), summary: this.#summarizeStatuses(posts) };
  }

  async listCampaigns(ownerId, { page = 1, limit = 20 } = {}) {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(50, Math.max(1, Number(limit) || 20));
    const [rows, total] = await Promise.all([
      this.Campaigns.find({ ownerId, status: { $ne: 'archived' } }).sort({ updatedAt: -1 }).skip((p - 1) * l).limit(l),
      this.Campaigns.countDocuments({ ownerId, status: { $ne: 'archived' } }),
    ]);
    const ids = rows.map((c) => String(c._id));
    const posts = ids.length ? await this.Posts.find({ ownerId, campaignId: { $in: ids } }) : [];
    const byCampaign = new Map();
    for (const post of posts) {
      const list = byCampaign.get(post.campaignId) || [];
      list.push(post);
      byCampaign.set(post.campaignId, list);
    }
    return {
      campaigns: rows.map((c) => ({ ...this.#presentCampaign(c), summary: this.#summarizeStatuses(byCampaign.get(String(c._id)) || []) })),
      pagination: { page: p, limit: l, total, pages: Math.max(1, Math.ceil(total / l)) },
    };
  }

  /** Delete a campaign that never produced a post; otherwise it is kept as history (archived). */
  async deleteCampaign(ownerId, id) {
    const campaign = await this.#ownedCampaign(ownerId, id);
    const posts = await this.Posts.countDocuments({ ownerId, campaignId: id });
    if (posts > 0) {
      await this.Campaigns.findOneAndUpdate({ _id: id, ownerId }, { $set: { status: 'archived' } });
      return { deleted: false, archived: true };
    }
    await this.#deleteOwnUpload(campaign.toObject().media);
    await this.Campaigns.deleteOne({ _id: id, ownerId });
    return { deleted: true, archived: false };
  }

  /** What a campaign's posts add up to: published / pending / failed counts and one overall word. */
  #summarizeStatuses(posts) {
    const count = (statuses) => posts.filter((p) => statuses.includes(p.status)).length;
    const published = count([S.COMPLETED]);
    const failed = count([S.FAILED]);
    const scheduled = count([S.SCHEDULED]);
    const inFlight = count([S.QUEUED, S.RETRYING, S.VALIDATING, S.UPLOADING, S.PROCESSING]);
    const cancelled = count([S.CANCELLED]);
    let overall = 'none';
    if (posts.length) {
      if (inFlight) overall = 'publishing';
      else if (scheduled && !published && !failed) overall = 'scheduled';
      else if (published && failed) overall = 'partial';
      else if (published && scheduled) overall = 'published_and_scheduled';
      else if (published) overall = 'published';
      else if (failed) overall = 'failed';
      else if (scheduled) overall = 'scheduled';
      else overall = cancelled === posts.length ? 'cancelled' : 'none';
    }
    return { total: posts.length, published, failed, scheduled, inFlight, cancelled, overall };
  }

  // ── uploads ──────────────────────────────────────────────────────────────

  /**
   * Attach an uploaded image or video to a campaign. The body is streamed to a temp file with a hard size cap
   * (never buffered whole), its type is verified from the file's own bytes (the client's Content-Type is
   * only a hint), then it is stored in MinIO.
   */
  async attachUpload(ownerId, campaignId, { stream, fileName = 'upload', declaredLength = null }) {
    const s = this.settings();
    const campaign = await this.#ownedCampaign(ownerId, campaignId);
    const cap = Math.max(s.maxImageBytes, s.maxVideoBytes);
    if (declaredLength && declaredLength > cap) throw new ValidationError(`File is too large (limit ${Math.round(cap / 1048576)} MB)`);

    const tmp = path.join(os.tmpdir(), `vireon-social-${idTail()}`);
    let written = 0;
    try {
      await pipeline(
        stream,
        new Transform({
          transform(chunk, _enc, cb) {
            written += chunk.length;
            if (written > cap) return cb(new ValidationError(`File is too large (limit ${Math.round(cap / 1048576)} MB)`));
            return cb(null, chunk);
          },
        }),
        fs.createWriteStream(tmp)
      );
      if (written === 0) throw new ValidationError('The upload was empty');

      const head = Buffer.alloc(Math.min(written, 262144));
      const fd = await fs.promises.open(tmp, 'r');
      try {
        await fd.read(head, 0, head.length, 0);
      } finally {
        await fd.close();
      }
      const kind = sniffMedia(head);
      if (!kind) throw new ValidationError('Unsupported file. Upload a JPEG or PNG image, or an MP4 / MOV video.');
      if (kind.kind === 'image' && written > s.maxImageBytes) throw new ValidationError(`Images are limited to ${Math.round(s.maxImageBytes / 1048576)} MB`);
      if (kind.kind === 'video' && written > s.maxVideoBytes) throw new ValidationError(`Videos are limited to ${Math.round(s.maxVideoBytes / 1048576)} MB`);

      const dims = kind.kind === 'image' ? readImageSize(head, kind.contentType) : null;
      const bucket = config.minio.videoBucket;
      const key = `social/${ownerId}/${campaignId}/${idTail()}.${kind.ext}`;
      const stored = await this.storage.putObjectFile(bucket, key, tmp, kind.contentType);
      const stat = await this.storage.statObject(bucket, key);

      const previous = campaign.toObject().media;
      const media = {
        kind: kind.kind, bucket, key, size: stored.size, etag: stat?.etag || '', contentType: kind.contentType,
        fileName: path.basename(fileName).slice(0, 120), durationSec: null, width: dims?.width ?? null, height: dims?.height ?? null,
        measured: dims ? 'file' : 'none',
      };
      const updated = await this.Campaigns.findOneAndUpdate(
        { _id: campaignId, ownerId },
        { $set: { media, thumbnail: kind.kind === 'image' ? media : null, source: {} } },
        { new: true }
      );
      await this.#deleteOwnUpload(previous);
      return this.#presentCampaign(updated);
    } finally {
      fs.promises.unlink(tmp).catch(() => {});
    }
  }

  /** Remove an uploaded object unless a post still references it. Vireon's own renders are never touched. */
  async #deleteOwnUpload(media) {
    if (!media?.key || !String(media.key).startsWith('social/')) return;
    const used = await this.Posts.countDocuments({ 'media.key': media.key });
    if (used > 0) return;
    try {
      await this.storage.deleteObject(media.bucket, media.key);
    } catch (err) {
      LoggerService.warn('Could not delete an uploaded promotion asset', { error: err.message });
    }
  }

  // ── AI copy ──────────────────────────────────────────────────────────────

  async generateCopy(ownerId, campaignId, input = {}) {
    const body = parse(z.object({
      platforms: z.array(z.enum(PLATFORMS)).min(1).max(3).optional(),
      tone: z.enum(SocialCampaign.TONES).optional(),
    }), input);
    const campaign = await this.#ownedCampaign(ownerId, campaignId);
    const raw = campaign.toObject();
    const platforms = body.platforms || PLATFORMS;
    const tone = body.tone || raw.brief?.tone || 'casual';

    let excerpt = '';
    if (raw.source?.videoJobId || raw.source?.courseVideoId) {
      try {
        excerpt = (await this.sources.resolve(raw.source)).excerpt || '';
      } catch {
        /* the video may have been deleted; write from the brief alone */
      }
    }
    const variants = await this.captions.generate({
      platforms, tone,
      video: { title: raw.source?.title || raw.title, description: raw.source?.description || '', excerpt },
      brief: raw.brief || {},
    });

    const set = { 'brief.tone': tone };
    for (const [platform, v] of Object.entries(variants)) set[`variants.${platform}`] = v;
    const updated = await this.Campaigns.findOneAndUpdate({ _id: campaignId, ownerId }, { $set: set }, { new: true });
    return { campaign: this.#presentCampaign(updated), generated: Object.keys(variants), missing: platforms.filter((p) => !variants[p]) };
  }

  // ── validation / preview ─────────────────────────────────────────────────

  async #destinationAccount(ownerId, accountId) {
    const account = await this.Accounts.findOne({ _id: accountId, ownerId, platform: { $in: PLATFORMS } }).select('+accessTokenEnc');
    if (!account) throw new NotFoundError('Account not found');
    return account;
  }

  #accountProblem(account) {
    if (account.status !== PlatformAccount.ACCOUNT_STATUS.CONNECTED) return account.statusReason || 'This account needs to be reconnected before it can post.';
    if (account.tokenExpiresAt && new Date(account.tokenExpiresAt).getTime() <= this.now()) return 'The saved access for this account expired. Reconnect it to continue.';
    if (!account.accessTokenEnc || !cipher.isReadable(account.accessTokenEnc)) return 'The stored credential cannot be decrypted. Reconnect this account.';
    return '';
  }

  #contentFor(campaign, platform, override = {}) {
    const base = campaign.variants?.[platform] || this.#defaultVariant(platform, campaign);
    return {
      caption: override.caption ?? base.caption ?? '',
      hashtags: normalizeHashtags(override.hashtags ?? base.hashtags ?? []),
      cta: override.cta ?? base.cta ?? '',
      linkUrl: override.linkUrl ?? base.linkUrl ?? '',
    };
  }

  /** Validate every destination without creating anything. Also feeds the live preview. */
  async validate(ownerId, campaignId, input) {
    const body = parse(validateSchema, input);
    const campaign = (await this.#ownedCampaign(ownerId, campaignId)).toObject();
    const caps = { publicMedia: mediaGateway.isConfigured(this.settings()) };
    const results = [];
    for (const dest of body.destinations) {
      results.push(await this.#checkDestination(ownerId, campaign, dest, caps));
    }
    let schedule = [];
    if (body.mode === 'schedule') {
      const when = this.#resolveSchedule(body);
      schedule = when.errors.length ? when.errors : validateSchedule(when.at, { now: this.now(), minLeadMs: this.settings().minScheduleLeadMs, maxAheadDays: this.settings().maxScheduleAheadDays });
    }
    return { results, schedule, ok: results.every((r) => r.ok) && schedule.length === 0 };
  }

  async #checkDestination(ownerId, campaign, dest, caps) {
    let account;
    try {
      account = await this.#destinationAccount(ownerId, dest.accountId);
    } catch {
      return { accountId: dest.accountId, ok: false, errors: [{ field: 'accountId', code: 'ACCOUNT_NOT_FOUND', message: 'That account is not connected.', level: 'error' }], warnings: [] };
    }
    const platform = account.platform;
    const content = this.#contentFor(campaign, platform, dest.content);
    const media = campaign.media ? { ...campaign.media } : null;
    const check = validatePost({ platform, content, media, format: dest.format, caps });
    const problem = this.#accountProblem(account);
    if (problem) check.errors.unshift({ field: 'accountId', code: 'ACCOUNT_NEEDS_REAUTH', message: problem, level: 'error' });
    return {
      accountId: String(account._id), platform, accountLabel: account.displayName, accountHandle: account.username,
      ok: check.ok && !problem, format: check.format, errors: check.errors, warnings: check.warnings, composed: check.composed, content,
    };
  }

  #resolveSchedule({ scheduledFor, localDateTime, timezone }) {
    const errors = [];
    const tz = timezone || 'UTC';
    if (!isValidTimeZone(tz)) return { at: null, tz, errors: [{ field: 'timezone', code: 'TIMEZONE_INVALID', message: 'Unknown timezone.', level: 'error' }] };
    let at = null;
    if (localDateTime) at = zonedToUtc(localDateTime, tz);
    else if (scheduledFor) at = toDate(scheduledFor);
    if (!at) errors.push({ field: 'scheduledFor', code: 'SCHEDULE_INVALID', message: 'Choose a valid date and time.', level: 'error' });
    return { at, tz, errors };
  }

  // ── publish / schedule ───────────────────────────────────────────────────

  #fingerprint({ ownerId, campaignId, accountId, media, nonce = '' }) {
    return cipher.sha256(['social', ownerId, campaignId, accountId, media?.key || 'text', media?.etag || media?.size || '', nonce].join('|'));
  }

  /**
   * Create one SocialPost per chosen account and start (or schedule) each. Destinations are independent:
   * the response lists, per destination, either the created post or exactly why it was not created.
   */
  async publish(ownerId, campaignId, input) {
    const body = parse(publishSchema, input);
    const s = this.settings();
    const campaign = (await this.#ownedCampaign(ownerId, campaignId)).toObject();
    const caps = { publicMedia: mediaGateway.isConfigured(s) };

    let when = null;
    if (body.mode === 'schedule') {
      when = this.#resolveSchedule(body);
      const errors = when.errors.length ? when.errors : validateSchedule(when.at, { now: this.now(), minLeadMs: s.minScheduleLeadMs, maxAheadDays: s.maxScheduleAheadDays });
      if (errors.length) throw new SchemaValidationError(errors.map((e) => ({ field: e.field, message: e.message })));
    }

    const seen = new Set();
    const results = [];
    for (const dest of body.destinations) {
      if (seen.has(dest.accountId)) {
        results.push({ accountId: dest.accountId, ok: false, code: 'DUPLICATE_DESTINATION', message: 'This account was chosen more than once.' });
        continue;
      }
      seen.add(dest.accountId);
      results.push(await this.#createPost({ ownerId, campaign, dest, caps, when, mode: body.mode, allowRepeat: body.allowRepeat }));
    }
    const created = results.filter((r) => r.ok).length;
    LoggerService.info('Promotion submitted', { campaignId, mode: body.mode, created, failed: results.length - created });
    return { results, created, failed: results.length - created };
  }

  async #createPost({ ownerId, campaign, dest, caps, when, mode, allowRepeat }) {
    const check = await this.#checkDestination(ownerId, campaign, dest, caps);
    if (!check.ok) {
      return { accountId: dest.accountId, platform: check.platform, ok: false, code: 'VALIDATION_FAILED', message: check.errors.map((e) => e.message).join(' '), errors: check.errors };
    }
    const account = await this.#destinationAccount(ownerId, dest.accountId);
    const media = campaign.media || null;

    // The file must still be the one the user previewed.
    if (media) {
      const stat = await this.storage.statObject(media.bucket, media.key);
      if (!stat || !(stat.size > 0)) return { accountId: dest.accountId, platform: account.platform, ok: false, code: 'SOURCE_MISSING', message: 'The media file is missing from storage - render or upload it again.' };
      if (stat.size !== media.size || (media.etag && stat.etag && stat.etag !== media.etag)) {
        return { accountId: dest.accountId, platform: account.platform, ok: false, code: 'SOURCE_CHANGED', message: 'The media changed since you selected it (re-rendered?). Re-select it to preview the current version.' };
      }
    }

    let nonce = '';
    if (allowRepeat) {
      const done = await this.Posts.exists({ ownerId, accountId: account._id, campaignId: campaign._id, status: S.COMPLETED });
      if (done) nonce = `again-${this.now()}`;
    }
    const fingerprint = this.#fingerprint({ ownerId, campaignId: campaign._id, accountId: account._id, media, nonce });
    const at = new Date(this.now());
    const scheduled = mode === 'schedule';

    try {
      const post = await this.Posts.create({
        ownerId, campaignId: campaign._id, videoJobId: campaign.source?.videoJobId || null, courseVideoId: campaign.source?.courseVideoId || null,
        platform: account.platform, accountId: account._id, accountLabel: account.displayName, accountHandle: account.username,
        format: check.format, status: scheduled ? S.SCHEDULED : S.QUEUED,
        content: check.content,
        media: media ? { kind: media.kind, bucket: media.bucket, key: media.key, size: media.size, etag: media.etag, contentType: media.contentType, fileName: media.fileName, durationSec: media.durationSec, width: media.width, height: media.height } : {},
        scheduledFor: scheduled ? when.at : null, timezone: scheduled ? when.tz : '',
        fingerprint, dedupeKey: fingerprint, maxAttempts: this.settings().maxAttempts,
        approvedAt: at, queuedAt: scheduled ? null : at,
        progress: { bytesTotal: media?.size || 0, phase: scheduled ? 'Scheduled' : 'Queued' },
        events: [{ status: scheduled ? S.SCHEDULED : S.QUEUED, message: scheduled ? `Scheduled for ${when.at.toISOString()} (${when.tz})` : 'Approved for publishing and queued' }],
      });
      const enqueued = await this.#enqueue(post);
      events.emitPost(post);
      return { accountId: String(account._id), platform: account.platform, ok: true, enqueued, post: this.decorate(post), warnings: check.warnings };
    } catch (err) {
      if (err?.code !== 11000) throw err;
      const existing = await this.Posts.findOne({ dedupeKey: fingerprint, ownerId });
      const message = existing?.status === S.COMPLETED
        ? 'This promotion was already posted to this account. Choose "post again" if you really want a second copy.'
        : `This promotion already has a post in progress for this account (${existing?.status || 'active'}).`;
      return { accountId: String(account._id), platform: account.platform, ok: false, code: 'DUPLICATE', message, existingPostId: existing ? String(existing._id) : null };
    }
  }

  // ── post management ──────────────────────────────────────────────────────

  async #ownedPost(ownerId, postId) {
    const post = await this.Posts.findOne({ _id: postId, ownerId });
    if (!post) throw new NotFoundError('Post not found');
    return post;
  }

  /** Edit text and/or time of a post that has not started. */
  async editPost(ownerId, postId, input) {
    const body = parse(editPostSchema, input);
    const post = await this.#ownedPost(ownerId, postId);
    const raw = post.toObject();
    const editable = post.status === S.SCHEDULED || (post.status === S.FAILED && !raw.remote?.postId && !raw.remote?.publishAttemptedAt);
    if (!editable) throw new ConflictError(`A post in ${post.status} state can no longer be edited`);

    const set = {};
    if (body.content) {
      const content = {
        caption: body.content.caption ?? raw.content.caption,
        hashtags: body.content.hashtags ? normalizeHashtags(body.content.hashtags) : raw.content.hashtags,
        cta: body.content.cta ?? raw.content.cta,
        linkUrl: body.content.linkUrl ?? raw.content.linkUrl,
      };
      const check = validatePost({
        platform: raw.platform, content, media: raw.media?.key ? { ...raw.media } : null, format: raw.format,
        caps: { publicMedia: mediaGateway.isConfigured(this.settings()) },
      });
      if (!check.ok) throw new SchemaValidationError(check.errors.map((e) => ({ field: e.field, message: e.message })));
      set.content = content;
      // Content changed => the old platform container (if any) no longer matches it.
      if (raw.remote?.containerId && !raw.remote?.postId) {
        set['remote.containerId'] = '';
        set['remote.videoId'] = '';
        set['remote.state'] = '';
      }
    }
    let newTime = null;
    if (body.localDateTime || body.scheduledFor) {
      if (post.status !== S.SCHEDULED) throw new ConflictError('Only a scheduled post has a time to change');
      const when = this.#resolveSchedule({ ...body, timezone: body.timezone || raw.timezone });
      const errors = when.errors.length ? when.errors : validateSchedule(when.at, { now: this.now(), minLeadMs: this.settings().minScheduleLeadMs, maxAheadDays: this.settings().maxScheduleAheadDays });
      if (errors.length) throw new SchemaValidationError(errors.map((e) => ({ field: e.field, message: e.message })));
      set.scheduledFor = when.at;
      set.timezone = when.tz;
      newTime = when.at;
    }
    if (!Object.keys(set).length) return this.decorate(post);

    const updated = await this.Posts.findOneAndUpdate(
      { _id: postId, ownerId, status: post.status },
      { $set: set, $push: { events: { $each: [{ at: new Date(this.now()), status: post.status, message: newTime ? `Rescheduled for ${newTime.toISOString()}` : 'Details edited' }], $slice: -60 } } },
      { new: true }
    );
    if (!updated) throw new ConflictError('The post changed while you were editing it - reload and try again');
    if (newTime) await this.#enqueue(updated);
    events.emitPost(updated);
    return this.decorate(updated);
  }

  async cancelPost(ownerId, postId) {
    const post = await this.#ownedPost(ownerId, postId);
    const raw = post.toObject();
    if (!CANCELLABLE.includes(post.status)) throw new ConflictError(`A post in ${post.status} state cannot be cancelled`);
    if (raw.remote?.postId) throw new ConflictError('This post is already published or being made live - it cannot be cancelled here. Delete it on the platform instead.');
    if (raw.remote?.publishAttemptedAt) throw new ConflictError('This post is being sent to the platform right now and cannot be stopped.');

    const at = new Date(this.now());
    const cancelled = await this.Posts.findOneAndUpdate(
      { _id: postId, ownerId, status: { $in: CANCELLABLE }, 'remote.publishAttemptedAt': null },
      {
        $set: { status: S.CANCELLED, cancelledAt: at, nextRetryAt: null, 'lease.owner': '', 'lease.expiresAt': null },
        $unset: { dedupeKey: 1 },
        $push: { events: { $each: [{ at, status: S.CANCELLED, level: 'warn', message: 'Cancelled by user' }], $slice: -60 } },
      },
      { new: true }
    );
    if (!cancelled) throw new ConflictError('The post changed - reload and try again');
    events.emitPost(cancelled);
    return this.decorate(cancelled);
  }

  /**
   * Retry ONE failed destination. A post that already has a platform id is never re-published (the retry only
   * confirms it); a container/upload already created is resumed. `confirmNotPosted` is the user's statement that
   * an OUTCOME_UNKNOWN post is NOT on the platform - only then is the slate wiped for a fresh attempt.
   */
  async retryPost(ownerId, postId, { confirmNotPosted = false } = {}) {
    const post = await this.#ownedPost(ownerId, postId);
    const raw = post.toObject();
    if (post.status !== S.FAILED) throw new ConflictError('Only a failed post can be retried');
    if (NOT_RETRYABLE_CODES.has(raw.error?.code)) throw new ConflictError(raw.error?.action || 'This failure cannot be fixed by retrying - create a new post');

    const account = await this.#destinationAccount(ownerId, raw.accountId).catch(() => null);
    if (!account) throw new ConflictError('The account was disconnected. Connect it again, then post again from the campaign.');
    const problem = this.#accountProblem(account);
    if (problem) throw new ConflictError(problem);

    const unknown = raw.error?.code === 'OUTCOME_UNKNOWN' || (raw.remote?.publishAttemptedAt && !raw.remote?.postId);
    if (unknown && !confirmNotPosted) {
      throw new ConflictError('The platform never confirmed whether this was posted. Check the account on the platform first, then retry with "It isn\'t posted".');
    }

    const at = new Date(this.now());
    const set = {
      status: S.QUEUED, queuedAt: at, attempts: 0, deferrals: 0, processingChecks: 0, nextRetryAt: null, 'progress.phase': 'Queued', 'progress.percent': 0,
      dedupeKey: raw.fingerprint || undefined,
      error: { code: '', message: '', action: '', retryable: false, requiresReauth: false, httpStatus: null, at: null },
    };
    if (unknown && confirmNotPosted) {
      Object.assign(set, { 'remote.containerId': '', 'remote.videoId': '', 'remote.state': '', 'remote.publishAttemptedAt': null, quotaCountedAt: null });
    }
    try {
      const queued = await this.Posts.findOneAndUpdate(
        { _id: postId, ownerId, status: S.FAILED },
        {
          $set: set, $inc: { retryCount: 1 },
          $push: { events: { $each: [{ at, status: S.QUEUED, message: raw.remote?.postId ? 'Retry requested - will confirm the post that was already published' : unknown ? 'Retry requested - you confirmed it is not on the platform' : 'Retry requested' }], $slice: -60 } },
        },
        { new: true }
      );
      if (!queued) throw new ConflictError('The post changed - reload and try again');
      const enqueued = await this.#enqueue(queued);
      events.emitPost(queued);
      return { post: this.decorate(queued), enqueued };
    } catch (err) {
      if (err?.code === 11000) throw new ConflictError('Another post of this promotion to this account is already active');
      throw err;
    }
  }

  /** Remove a post that never reached the platform (cancelled / failed without a platform id). */
  async deletePost(ownerId, postId) {
    const post = await this.#ownedPost(ownerId, postId);
    const raw = post.toObject();
    const removable = [S.CANCELLED, S.FAILED].includes(post.status) && !raw.remote?.postId && !raw.remote?.publishAttemptedAt;
    if (!removable) throw new ConflictError('Only cancelled or failed posts that never reached the platform can be deleted - the rest is kept as history');
    await this.Posts.deleteOne({ _id: postId, ownerId, status: post.status });
    return { deleted: true };
  }

  // ── reads ────────────────────────────────────────────────────────────────

  decorate(post) {
    const json = typeof post.toJSON === 'function' ? post.toJSON() : { ...post };
    const raw = typeof post.toObject === 'function' ? post.toObject() : post;
    const reachedPlatform = Boolean(raw.remote?.postId || raw.remote?.publishAttemptedAt);
    const unknown = json.status === S.FAILED && (json.error?.code === 'OUTCOME_UNKNOWN' || (raw.remote?.publishAttemptedAt && !raw.remote?.postId));
    json.actions = {
      canEdit: json.status === S.SCHEDULED || (json.status === S.FAILED && !reachedPlatform),
      canReschedule: json.status === S.SCHEDULED,
      canCancel: CANCELLABLE.includes(json.status) && !reachedPlatform,
      canRetry: json.status === S.FAILED && !NOT_RETRYABLE_CODES.has(json.error?.code) && !unknown,
      canRetryUnknown: Boolean(unknown),
      canDelete: [S.CANCELLED, S.FAILED].includes(json.status) && !reachedPlatform,
      canRefreshInsights: json.status === S.COMPLETED && Boolean(raw.remote?.postId),
    };
    json.scheduledLocal = raw.scheduledFor && raw.timezone ? utcToZoned(new Date(raw.scheduledFor), raw.timezone) : null;
    json.label = PLATFORM_LABEL[json.platform];
    json.composedText = composeText(json.platform, json.content);
    return json;
  }

  async getPost(ownerId, postId) {
    return this.decorate(await this.#ownedPost(ownerId, postId));
  }

  #dateRange({ from, to }) {
    const range = {};
    const f = toDate(from);
    const t = toDate(to);
    if (f) range.$gte = f;
    if (t) range.$lte = t;
    return Object.keys(range).length ? range : null;
  }

  async listPosts(ownerId, rawFilter = {}) {
    const f = parse(listFilterSchema, rawFilter);
    const query = ownerFilter(ownerId);
    if (f.platform) query.platform = f.platform;
    if (f.status) query.status = f.status;
    if (f.accountId) query.accountId = f.accountId;
    if (f.campaignId) query.campaignId = f.campaignId;
    if (f.videoJobId) query.videoJobId = f.videoJobId;
    if (f.finished === true) query.status = { $in: FINISHED };
    if (f.finished === false) query.status = { $nin: FINISHED };
    const range = this.#dateRange(f);
    if (range) query.createdAt = range;

    const [posts, total] = await Promise.all([
      this.Posts.find(query).sort({ createdAt: -1 }).skip((f.page - 1) * f.limit).limit(f.limit),
      this.Posts.countDocuments(query),
    ]);
    return { posts: posts.map((p) => this.decorate(p)), pagination: { page: f.page, limit: f.limit, total, pages: Math.max(1, Math.ceil(total / f.limit)) } };
  }

  /** Posts that are (or were) due inside [from, to] for the calendar: scheduled time, else publish/creation time. */
  async calendar(ownerId, rawRange = {}) {
    const f = parse(rangeSchema, rawRange);
    const from = toDate(f.from, new Date(this.now() - 30 * 86400_000));
    const to = toDate(f.to, new Date(this.now() + 60 * 86400_000));
    if (to.getTime() - from.getTime() > 400 * 86400_000) throw new ValidationError('Choose a date range of at most 400 days');
    const base = ownerFilter(ownerId, f.platform ? { platform: f.platform } : {});
    const [scheduled, published] = await Promise.all([
      this.Posts.find({ ...base, scheduledFor: { $gte: from, $lte: to } }).sort({ scheduledFor: 1 }).limit(500),
      this.Posts.find({ ...base, scheduledFor: null, status: S.COMPLETED, completedAt: { $gte: from, $lte: to } }).sort({ completedAt: 1 }).limit(500),
    ]);
    const items = [...scheduled, ...published].map((p) => {
      const json = this.decorate(p);
      return {
        postId: json._id, campaignId: json.campaignId, platform: json.platform, accountLabel: json.accountLabel, status: json.status, format: json.format,
        at: json.scheduledFor || json.completedAt, timezone: json.timezone || '', caption: (json.content?.caption || '').slice(0, 140),
        permalink: json.remote?.permalink || '', error: json.error?.code ? { code: json.error.code, message: json.error.message } : null, actions: json.actions,
      };
    });
    return { from, to, items };
  }

  /** Dashboard numbers: what is coming up, what happened lately, what needs attention. */
  async overview(ownerId) {
    const since = new Date(this.now() - 7 * 86400_000);
    const [upcoming, recent, accounts, needAttention] = await Promise.all([
      this.Posts.find({ ownerId, status: S.SCHEDULED }).sort({ scheduledFor: 1 }).limit(5),
      this.Posts.find({ ownerId, createdAt: { $gte: since } }),
      this.auth.listAccounts(ownerId),
      this.Posts.find({ ownerId, status: S.FAILED }).sort({ updatedAt: -1 }).limit(5),
    ]);
    const countBy = (statuses) => recent.filter((p) => statuses.includes(p.status)).length;
    const scheduledTotal = await this.Posts.countDocuments({ ownerId, status: S.SCHEDULED });
    return {
      accounts: { total: accounts.length, needReauth: accounts.filter((a) => a.status !== 'connected').length },
      scheduledTotal,
      last7Days: { published: countBy([S.COMPLETED]), failed: countBy([S.FAILED]), inFlight: countBy([S.QUEUED, S.RETRYING, S.VALIDATING, S.UPLOADING, S.PROCESSING]) },
      upcoming: upcoming.map((p) => this.decorate(p)),
      needsAttention: needAttention.map((p) => this.decorate(p)),
    };
  }

  // ── analytics ────────────────────────────────────────────────────────────

  /**
   * Aggregate what the platforms reported. Reads cached insights only (never calls a platform); use
   * refreshInsights to update them. A metric that no post could report is "unavailable" - never 0.
   */
  async analytics(ownerId, rawRange = {}) {
    const f = parse(rangeSchema, rawRange);
    const from = toDate(f.from, new Date(this.now() - 30 * 86400_000));
    const to = toDate(f.to, new Date(this.now()));
    const query = ownerFilter(ownerId, { createdAt: { $gte: from, $lte: to }, ...(f.platform ? { platform: f.platform } : {}) });
    const posts = await this.Posts.find(query).sort({ createdAt: -1 }).limit(2000);
    return { from, to, ...aggregateInsights(posts.map((p) => (typeof p.toObject === 'function' ? p.toObject() : p)), { now: this.now(), cacheMs: this.settings().insightsCacheMs }) };
  }

  /**
   * Pull fresh insights for completed posts whose cache is stale (or one named post). Sequential and capped per
   * call so a big history cannot burst through a platform's rate limits. Failures are recorded per post.
   */
  async refreshInsights(ownerId, { postId = null, platform = null, limit = 10 } = {}) {
    const cacheMs = this.settings().insightsCacheMs;
    const staleBefore = new Date(this.now() - cacheMs);
    let posts;
    if (postId) {
      posts = [await this.#ownedPost(ownerId, postId)];
      if (posts[0].status !== S.COMPLETED || !posts[0].remote?.postId) throw new ConflictError('Insights exist only for published posts');
    } else {
      const all = await this.Posts.find(ownerFilter(ownerId, { status: S.COMPLETED, ...(platform ? { platform } : {}) })).sort({ completedAt: -1 }).limit(200);
      posts = all.filter((p) => !p.insights?.fetchedAt || new Date(p.insights.fetchedAt) < staleBefore).slice(0, Math.min(limit, 25));
    }

    const summary = { refreshed: 0, failed: 0, skipped: 0 };
    for (const post of posts) {
      const raw = post.toObject();
      if (postId && raw.insights?.fetchedAt && new Date(raw.insights.fetchedAt) > staleBefore) {
        summary.skipped += 1; // fresh enough; respect the cache and the platform's limits
        continue;
      }
      try {
        const account = await this.Accounts.findOne({ _id: raw.accountId, ownerId });
        if (!account) throw new Error('The account is no longer connected');
        const token = await this.auth.getAccessToken(raw.accountId);
        const api = raw.platform === SOCIAL_PLATFORM.THREADS ? this.apis.threads : this.apis.meta;
        const metrics = await providerFor(raw.platform).insights({ post: raw, account: account.toObject(), token, api });
        await this.Posts.updateOne({ _id: raw._id }, { $set: { insights: { fetchedAt: new Date(this.now()), metrics, error: '' } } });
        summary.refreshed += 1;
      } catch (err) {
        await this.Posts.updateOne({ _id: raw._id }, { $set: { 'insights.error': String(err.message || 'Failed').slice(0, 300), 'insights.fetchedAt': raw.insights?.fetchedAt || null } });
        summary.failed += 1;
        // A rate limit means: stop now, do not hammer the platform with the rest.
        if (err.code === 'RATE_LIMITED') break;
        if (err.requiresReauth) await this.auth.markNeedsReauth(raw.accountId, 'The platform no longer accepts this account. Reconnect to continue.').catch(() => {});
      }
    }
    return summary;
  }

  // ── queueing ─────────────────────────────────────────────────────────────

  /**
   * Put a persisted post on its BullMQ queue (delayed until its time when scheduled). Returns false (never
   * throws) when Redis is unreachable: the post is already safely stored in Mongo and the worker's scheduler
   * tick / recovery sweep will pick it up - a Redis outage delays a post, it cannot lose one.
   */
  async #enqueue(post, opts = {}) {
    try {
      await this.enqueue(post, opts);
      return true;
    } catch (err) {
      LoggerService.error('Could not enqueue social post (the scheduler tick will pick it up)', { postId: post._id, error: err.message });
      return false;
    }
  }

  async enqueue(post, { delayMs = null, jobId = null } = {}) {
    const raw = typeof post.toObject === 'function' ? post.toObject() : post;
    const queue = this.queues('social');
    const scheduled = raw.status === S.SCHEDULED && raw.scheduledFor;
    const delay = delayMs ?? (scheduled ? Math.max(0, new Date(raw.scheduledFor).getTime() - this.now()) : 0);
    const stamp = raw.nextRetryAt ? new Date(raw.nextRetryAt).getTime()
      : scheduled ? new Date(raw.scheduledFor).getTime()
        : new Date(raw.queuedAt || this.now()).getTime();
    await queue.add('publish', { postId: String(raw._id) }, { jobId: jobId || retryJobId(raw._id, raw.attempts || 0, stamp), delay });
  }

  /**
   * Promote and enqueue every SCHEDULED post that is due. The worker runs this on a timer - it is what makes
   * scheduling survive a Redis flush or a worker restart, independent of the delayed jobs.
   */
  async promoteDue() {
    const ids = await this.store.findDue(100);
    let promoted = 0;
    for (const id of ids) {
      const post = await this.store.promoteIfDue(id);
      if (!post) continue;
      promoted += 1;
      events.emitPost(post);
      await this.#enqueue(post);
    }
    return promoted;
  }
}

module.exports = SocialService;
module.exports.NOT_RETRYABLE_CODES = NOT_RETRYABLE_CODES;
module.exports.schemas = { createCampaignSchema, updateCampaignSchema, publishSchema, validateSchema, editPostSchema, briefSchema };
