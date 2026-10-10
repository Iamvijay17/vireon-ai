const { SOCIAL_PLATFORM } = require('../../constants');
const { LIMITS, PLATFORM_LABEL } = require('./constants');

/**
 * Pure content rules for every destination: how the user's caption / hashtags /
 * call-to-action / link are composed into the text that is actually sent, which
 * format a piece of media becomes on each platform, and what the platform will
 * refuse. No I/O, so it is the same code for the live preview (the UI calls
 * POST /posts/validate), for the publish-time check, and for the worker's
 * last check before talking to Meta.
 *
 * `errors` block publishing; `warnings` are things the platform will accept but
 * the user would likely not want (a link that will not be clickable, a video
 * that will be cropped). Every limit used here is sourced in constants.js.
 */

const ERR = (field, code, message) => ({ field, code, message, level: 'error' });
const WARN = (field, code, message) => ({ field, code, message, level: 'warning' });

const EMOJI = /\p{Extended_Pictographic}/u;

/** Normalise one hashtag to `#word` (unicode letters/digits/underscore only). '' if nothing is left. */
function normalizeHashtag(tag) {
  const word = String(tag || '').replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
  return word ? `#${word}` : '';
}

function normalizeHashtags(tags) {
  const list = Array.isArray(tags) ? tags : String(tags || '').split(/[\s,]+/);
  return [...new Set(list.map(normalizeHashtag).filter(Boolean))];
}

const URL_RE = /https?:\/\/[^\s<>"')]+/gi;
const countLinks = (text) => new Set((String(text).match(URL_RE) || []).map((u) => u.replace(/[.,;:!?]+$/, ''))).size;

/**
 * Length the way each platform counts it. Threads measures emoji by their UTF-8 bytes (documented);
 * everything else is counted in characters (code points).
 */
function measureLength(platform, text) {
  if (platform === SOCIAL_PLATFORM.THREADS) {
    let n = 0;
    for (const ch of text) n += EMOJI.test(ch) ? Buffer.byteLength(ch, 'utf8') : 1;
    return n;
  }
  return [...text].length;
}

/**
 * The text that will be sent: caption, then the call to action (unless the caption already says it),
 * then the hashtags. A destination link is appended for platforms where it belongs in the text.
 */
function composeText(platform, content = {}, { includeLink = true } = {}) {
  const caption = String(content.caption || '').trim();
  const cta = String(content.cta || '').trim();
  const tags = normalizeHashtags(content.hashtags);
  const link = String(content.linkUrl || '').trim();

  const parts = [];
  if (caption) parts.push(caption);
  if (cta && !caption.toLowerCase().includes(cta.toLowerCase())) parts.push(cta);
  if (link && includeLink && !caption.includes(link) && !cta.includes(link)) parts.push(link);
  if (tags.length) parts.push(tags.filter((t) => !caption.includes(t)).join(' '));
  return parts.filter(Boolean).join('\n\n').trim();
}

/** Aspect ratio as width/height, or null when unknown. */
const aspectOf = (media) => (media?.width > 0 && media?.height > 0 ? media.width / media.height : null);
const isPortrait916 = (media) => {
  const a = aspectOf(media);
  return a !== null && Math.abs(a - 9 / 16) < 0.04;
};

/**
 * Which format the media becomes on a platform. Returns '' when the platform cannot post it at all.
 * `preferred` lets the user pick reel vs regular video on Facebook; it is only honoured when valid.
 */
function resolveFormat(platform, media, preferred = '') {
  if (!media) return platform === SOCIAL_PLATFORM.INSTAGRAM ? '' : 'text';
  if (media.kind === 'image') return 'image';
  if (platform === SOCIAL_PLATFORM.INSTAGRAM) return 'reel'; // Instagram feed video is published as a Reel
  if (platform === SOCIAL_PLATFORM.THREADS) return 'video';
  // Facebook: a Reel when it plainly is one (short, vertical), otherwise a regular Page video.
  if (preferred === 'reel' || preferred === 'video') return preferred;
  const reel = LIMITS.facebook;
  const short = media.durationSec > 0 && media.durationSec >= reel.reelMinSec && media.durationSec <= reel.reelMaxSec;
  return short && isPortrait916(media) ? 'reel' : 'video';
}

/**
 * Validate one destination.
 * @param {object} p
 * @param {'facebook'|'instagram'|'threads'} p.platform
 * @param {object} p.content { caption, hashtags, cta, linkUrl }
 * @param {object|null} p.media { kind, size, contentType, durationSec, width, height, measured }
 * @param {string} [p.format] explicit format (else resolved)
 * @param {{publicMedia: boolean}} [p.caps] what this deployment can do
 */
function validatePost({ platform, content = {}, media = null, format = '', caps = {} }) {
  const errors = [];
  const warnings = [];
  const label = PLATFORM_LABEL[platform];
  const L = LIMITS[platform];
  const resolved = resolveFormat(platform, media, format);
  const tags = normalizeHashtags(content.hashtags);
  const text = composeText(platform, content, { includeLink: platform !== SOCIAL_PLATFORM.FACEBOOK || resolved !== 'text' });
  const length = measureLength(platform, text);
  const limit = platform === SOCIAL_PLATFORM.THREADS ? L.maxText : platform === SOCIAL_PLATFORM.INSTAGRAM ? L.maxCaption : L.maxMessage;

  // ── destination link ──
  const link = String(content.linkUrl || '').trim();
  if (link && !/^https?:\/\/[^\s]+$/i.test(link)) errors.push(ERR('linkUrl', 'LINK_INVALID', 'The destination URL must start with http:// or https://'));

  // ── text ──
  if (platform === SOCIAL_PLATFORM.THREADS) {
    if (!text && !media) errors.push(ERR('caption', 'TEXT_REQUIRED', 'A Threads text post needs some text.'));
    if (length > L.maxText) errors.push(ERR('caption', 'TEXT_TOO_LONG', `Threads allows ${L.maxText} characters; this is ${length} (hashtags, call to action and link count).`));
    if (countLinks(text) > L.maxLinks) errors.push(ERR('caption', 'TOO_MANY_LINKS', `Threads allows at most ${L.maxLinks} links in a post.`));
    if (tags.length > 1) warnings.push(WARN('hashtags', 'THREADS_TAG', 'Threads is built around one topic tag per post; extra hashtags are kept as plain text.'));
  }
  if (platform === SOCIAL_PLATFORM.INSTAGRAM) {
    if (length > L.maxCaption) errors.push(ERR('caption', 'TEXT_TOO_LONG', `Instagram captions are limited to ${L.maxCaption} characters; this is ${length}.`));
    if (tags.length > L.maxHashtags) errors.push(ERR('hashtags', 'TOO_MANY_HASHTAGS', `Instagram allows at most ${L.maxHashtags} hashtags; this has ${tags.length}.`));
    if (link) warnings.push(WARN('linkUrl', 'LINK_NOT_CLICKABLE', 'Links in Instagram captions are not clickable. Put the link in your bio or a link sticker.'));
    if (!text) warnings.push(WARN('caption', 'NO_CAPTION', 'This post has no caption.'));
  }
  if (platform === SOCIAL_PLATFORM.FACEBOOK) {
    if (length > L.maxMessage) errors.push(ERR('caption', 'TEXT_TOO_LONG', `Facebook posts are limited to ${L.maxMessage} characters; this is ${length}.`));
    if (!text && !media) errors.push(ERR('caption', 'TEXT_REQUIRED', 'A Facebook text post needs some text.'));
    if (length > 1500) warnings.push(WARN('caption', 'LONG_TEXT', 'Facebook truncates long posts behind "See more"; the first lines matter most.'));
  }

  // ── media & format ──
  if (!resolved) {
    errors.push(ERR('media', 'MEDIA_REQUIRED', `${label} posts need an image or a video; it cannot publish text alone.`));
  } else if (resolved !== 'text') {
    validateMedia({ platform, media, resolved, L, errors, warnings, caps });
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    format: resolved || null,
    composed: { text, length, limit, hashtags: tags, hashtagCount: tags.length, linkCount: countLinks(text) },
    // Whether this destination will fetch the media from our public URL (needs SOCIAL_PUBLIC_MEDIA_BASE_URL).
    needsPublicMedia: needsPublicMedia(platform, resolved),
  };
}

/** Does posting this format to this platform require Meta to download the file from a public URL? */
function needsPublicMedia(platform, format) {
  if (!format || format === 'text') return false;
  if (platform === SOCIAL_PLATFORM.THREADS) return true; // image + video are fetched by URL
  if (platform === SOCIAL_PLATFORM.INSTAGRAM) return format === 'image'; // video can be uploaded resumably
  return false; // Facebook accepts the bytes directly
}

function validateMedia({ platform, media, resolved, L, errors, warnings, caps }) {
  const label = PLATFORM_LABEL[platform];
  if (!media) return;
  const aspect = aspectOf(media);
  const approximate = media.measured !== 'file';

  if (media.kind === 'image') {
    const type = String(media.contentType || '').toLowerCase();
    if (L.imageTypes && type && !L.imageTypes.includes(type)) {
      errors.push(ERR('media', 'IMAGE_TYPE', `${label} accepts ${L.imageTypes.map((t) => t.replace('image/', '').toUpperCase()).join(' or ')} images; this is ${type.replace('image/', '').toUpperCase() || 'unknown'}.`));
    }
    if (L.maxImageBytes && media.size > L.maxImageBytes) {
      errors.push(ERR('media', 'IMAGE_TOO_LARGE', `${label} images are limited to ${Math.round(L.maxImageBytes / 1048576)} MB; this one is ${(media.size / 1048576).toFixed(1)} MB.`));
    }
    if (platform === SOCIAL_PLATFORM.THREADS && aspect !== null && (aspect > L.maxAspect || aspect < 1 / L.maxAspect)) {
      errors.push(ERR('media', 'ASPECT_RATIO', 'Threads images must have an aspect ratio of at most 10:1.'));
    }
  }

  if (media.kind === 'video') {
    const d = media.durationSec;
    if (platform === SOCIAL_PLATFORM.THREADS) {
      if (d > L.maxVideoSec) errors.push(ERR('media', 'VIDEO_TOO_LONG', `Threads videos can be at most ${L.maxVideoSec / 60} minutes; this is ${Math.round(d)} s.`));
      if (media.width > L.maxVideoWidth) errors.push(ERR('media', 'VIDEO_TOO_WIDE', `Threads videos can be at most ${L.maxVideoWidth}px wide; this is ${media.width}px.`));
      if (media.size > L.maxVideoBytes) errors.push(ERR('media', 'VIDEO_TOO_LARGE', 'Threads videos are limited to 1 GB.'));
    }
    if (platform === SOCIAL_PLATFORM.INSTAGRAM) {
      if (d > 0 && d < L.reelMinSec) errors.push(ERR('media', 'VIDEO_TOO_SHORT', `Instagram Reels must be at least ${L.reelMinSec} seconds.`));
      if (d > L.reelMaxSec) errors.push(ERR('media', 'VIDEO_TOO_LONG', `Instagram Reels can be at most ${L.reelMaxSec / 60} minutes; this is ${Math.round(d)} s.`));
      if (aspect !== null && !isPortrait916(media)) warnings.push(WARN('media', 'NOT_VERTICAL', 'Reels are 9:16. This video has a different shape and will be cropped or letterboxed.'));
    }
    if (platform === SOCIAL_PLATFORM.FACEBOOK && resolved === 'reel') {
      if (d > 0 && d < L.reelMinSec) errors.push(ERR('media', 'VIDEO_TOO_SHORT', `Facebook Reels must be at least ${L.reelMinSec} seconds.`));
      if (d > L.reelMaxSec) errors.push(ERR('media', 'VIDEO_TOO_LONG', `Facebook Reels can be at most ${L.reelMaxSec} seconds; this is ${Math.round(d)} s. Post it as a regular video instead.`));
      if (aspect !== null && !isPortrait916(media)) errors.push(ERR('media', 'NOT_VERTICAL', 'Facebook Reels must be 9:16 vertical. Post it as a regular video instead.'));
      if (media.height > 0 && (media.width < L.reelMinWidth || media.height < L.reelMinHeight)) {
        errors.push(ERR('media', 'RESOLUTION_LOW', `Facebook Reels must be at least ${L.reelMinWidth}x${L.reelMinHeight}; this is ${media.width}x${media.height}.`));
      }
    }
    if (media.size > (L.maxVideoBytes || Infinity)) errors.push(ERR('media', 'VIDEO_TOO_LARGE', `${label} videos are limited to ${Math.round(L.maxVideoBytes / 1048576)} MB.`));
    if (!(d > 0)) warnings.push(WARN('media', 'DURATION_UNKNOWN', 'The video length is unknown, so length limits could not be checked before posting.'));
    else if (approximate) warnings.push(WARN('media', 'DURATION_ESTIMATED', 'Length and size come from the generation record, not a measurement of the rendered file.'));
  }

  if (needsPublicMedia(platform, resolved) && !caps.publicMedia) {
    errors.push(ERR('media', 'PUBLIC_MEDIA_UNAVAILABLE', `${label} downloads media from a public https URL, and this server has none configured (SOCIAL_PUBLIC_MEDIA_BASE_URL). See docs/social-promotion.md.`));
  }
}

/** Is `scheduledFor` an acceptable publish time? Returns an array of errors (empty = fine). */
function validateSchedule(scheduledFor, { now = Date.now(), minLeadMs, maxAheadDays }) {
  const at = scheduledFor instanceof Date ? scheduledFor : new Date(scheduledFor);
  if (Number.isNaN(at.getTime())) return [ERR('scheduledFor', 'SCHEDULE_INVALID', 'Choose a valid date and time.')];
  if (at.getTime() < now + minLeadMs) {
    return [ERR('scheduledFor', 'SCHEDULE_PAST', `Schedule at least ${Math.max(1, Math.round(minLeadMs / 60000))} minute(s) from now.`)];
  }
  if (at.getTime() > now + maxAheadDays * 86400_000) {
    return [ERR('scheduledFor', 'SCHEDULE_TOO_FAR', `Posts can be scheduled at most ${maxAheadDays} days ahead.`)];
  }
  return [];
}

module.exports = {
  normalizeHashtag, normalizeHashtags, composeText, measureLength, resolveFormat, validatePost, validateSchedule,
  needsPublicMedia, countLinks, aspectOf, isPortrait916,
};
