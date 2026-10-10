const { z } = require('zod');
const { SchemaValidationError } = require('../../../utils/errors');
const { CATEGORIES, LIMITS } = require('./constants');

/**
 * Validation for what is sent in videos.insert's `snippet` and `status`.
 * The limits are YouTube's own (title 100 chars, description 5000 bytes,
 * tags 500 chars in total, no angle brackets), checked here so a mistake
 * surfaces next to the form field before an upload is queued - not as an
 * `invalidTitle` from Google after gigabytes were transferred.
 */

const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
const NO_ANGLE_BRACKETS = /^[^<>]*$/;

/** Length YouTube counts for a keyword list: tags with spaces are quoted (+2), joined by commas. */
function tagsLength(tags) {
  return tags.reduce((sum, tag, i) => sum + tag.length + (/\s/.test(tag) ? 2 : 0) + (i > 0 ? 1 : 0), 0);
}

const cleanTags = (tags) => {
  const seen = new Set();
  const out = [];
  for (const raw of tags || []) {
    const tag = String(raw).trim().replace(/\s+/g, ' ');
    const key = tag.toLowerCase();
    if (tag && !seen.has(key)) {
      seen.add(key);
      out.push(tag);
    }
  }
  return out;
};

const fields = {
  title: z.string().trim().min(1, 'A title is required').max(LIMITS.titleChars, `Title must be at most ${LIMITS.titleChars} characters`)
    .regex(NO_ANGLE_BRACKETS, 'Title cannot contain < or >'),
  description: z.string().max(20000).regex(NO_ANGLE_BRACKETS, 'Description cannot contain < or >')
    .refine((v) => Buffer.byteLength(v, 'utf8') <= LIMITS.descriptionBytes, `Description must be at most ${LIMITS.descriptionBytes} bytes (about 5000 plain characters)`),
  tags: z.array(z.string().trim().min(1).max(LIMITS.tagChars, `Each tag must be at most ${LIMITS.tagChars} characters`).regex(NO_ANGLE_BRACKETS, 'Tags cannot contain < or >'))
    .max(60, 'Too many tags').transform(cleanTags)
    .refine((tags) => tagsLength(tags) <= LIMITS.tagsChars, `Tags must total at most ${LIMITS.tagsChars} characters`),
  categoryId: z.string().refine((v) => CATEGORY_IDS.includes(v), 'Choose one of the listed categories'),
  // BCP-47-ish (en, en-US, hi, pt-BR). Empty = leave unset.
  language: z.string().trim().regex(/^([a-zA-Z]{2,3}(-[A-Za-z0-9]{2,8})*)?$/, 'Use a language code such as "en" or "pt-BR"'),
  privacyStatus: z.enum(['private', 'unlisted', 'public']),
  publishAt: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.date().nullable()),
  madeForKids: z.boolean({ required_error: 'Say whether the video is made for kids (required by YouTube)' }),
  containsSyntheticMedia: z.boolean(),
};

const baseShape = z.object(fields);

function crossChecks(data, ctx, { apiVerified, now }) {
  if (data.publishAt) {
    if (data.privacyStatus !== 'private') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['privacyStatus'], message: 'A scheduled video is uploaded as Private; YouTube makes it public at the scheduled time' });
    }
    if (data.publishAt.getTime() < now + LIMITS.minPublishLeadMs) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['publishAt'], message: 'Choose a publish time at least 5 minutes in the future' });
    }
  }
  if (!apiVerified && (data.privacyStatus !== 'private' || data.publishAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [data.publishAt ? 'publishAt' : 'privacyStatus'],
      message: 'Your Google API project is not marked verified (YOUTUBE_API_VERIFIED), and YouTube locks uploads from unverified projects to Private. Use Private, or complete the API audit first.',
    });
  }
}

function toValidationError(zodError) {
  return new SchemaValidationError(zodError.errors.map((e) => ({ field: e.path.join('.'), message: e.message })));
}

/**
 * Validate a complete metadata object. Throws SchemaValidationError (400 with
 * per-field details, the shape the forms already render) or returns the clean value.
 */
function validateYouTubeMetadata(input, { apiVerified = false, now = Date.now() } = {}) {
  const result = baseShape.superRefine((data, ctx) => crossChecks(data, ctx, { apiVerified, now })).safeParse(input);
  if (!result.success) throw toValidationError(result.error);
  return result.data;
}

/** Validate a partial edit merged over the current metadata - the merged result must be valid as a whole. */
function mergeAndValidate(current, patch, opts) {
  const allowed = Object.keys(fields);
  const unknown = Object.keys(patch || {}).filter((k) => !allowed.includes(k));
  if (unknown.length) {
    throw new SchemaValidationError(unknown.map((k) => ({ field: k, message: 'Unknown field' })));
  }
  return validateYouTubeMetadata({ ...current, ...patch }, opts);
}

/** The videos.insert request body for validated metadata. */
function toInsertBody(meta) {
  return {
    snippet: {
      title: meta.title,
      description: meta.description,
      tags: meta.tags,
      categoryId: meta.categoryId,
      ...(meta.language ? { defaultLanguage: meta.language } : {}),
    },
    status: {
      privacyStatus: meta.privacyStatus,
      ...(meta.publishAt ? { publishAt: new Date(meta.publishAt).toISOString() } : {}),
      selfDeclaredMadeForKids: meta.madeForKids,
      containsSyntheticMedia: meta.containsSyntheticMedia,
    },
  };
}

module.exports = { validateYouTubeMetadata, mergeAndValidate, toInsertBody, tagsLength, cleanTags, CATEGORY_IDS };
