const {
  normalizeHashtags, composeText, measureLength, resolveFormat, validatePost, validateSchedule, needsPublicMedia,
} = require('../../src/services/social/contentRules');

const video = (over = {}) => ({ kind: 'video', size: 5_000_000, contentType: 'video/mp4', durationSec: 30, width: 1080, height: 1920, measured: 'record', ...over });
const image = (over = {}) => ({ kind: 'image', size: 500_000, contentType: 'image/jpeg', width: 1080, height: 1080, measured: 'file', ...over });
const caps = { publicMedia: true };
const codes = (r) => r.errors.map((e) => e.code);

describe('hashtags and text composition', () => {
  it('normalises hashtags: strips #, punctuation and spaces, de-duplicates, keeps unicode letters', () => {
    expect(normalizeHashtags(['#AI', 'ai', ' video tips ', '#日本語', '!!!', ''])).toEqual(['#AI', '#ai', '#videotips', '#日本語']);
    expect(normalizeHashtags('one, two  #three')).toEqual(['#one', '#two', '#three']);
  });

  it('composes caption, call to action, link and hashtags in that order', () => {
    const text = composeText('threads', { caption: 'New video', cta: 'Watch now', linkUrl: 'https://x.test/v', hashtags: ['ai'] });
    expect(text).toBe('New video\n\nWatch now\n\nhttps://x.test/v\n\n#ai');
  });

  it('does not repeat a call to action or hashtag that the caption already contains', () => {
    const text = composeText('instagram', { caption: 'Watch now #ai', cta: 'watch now', hashtags: ['ai', 'video'] }, { includeLink: false });
    expect(text).toBe('Watch now #ai\n\n#video');
  });

  it('counts emoji by UTF-8 bytes on Threads and by characters elsewhere', () => {
    expect(measureLength('threads', 'hi 🎬')).toBe(3 + 4);
    expect(measureLength('instagram', 'hi 🎬')).toBe(4);
  });
});

describe('format resolution', () => {
  it('Instagram needs media; videos are Reels', () => {
    expect(resolveFormat('instagram', null)).toBe('');
    expect(resolveFormat('instagram', video())).toBe('reel');
    expect(resolveFormat('instagram', image())).toBe('image');
  });

  it('Threads and Facebook can be text-only', () => {
    expect(resolveFormat('threads', null)).toBe('text');
    expect(resolveFormat('facebook', null)).toBe('text');
  });

  it('Facebook chooses a Reel only for short vertical video, otherwise a regular video', () => {
    expect(resolveFormat('facebook', video())).toBe('reel');
    expect(resolveFormat('facebook', video({ durationSec: 120 }))).toBe('video');
    expect(resolveFormat('facebook', video({ width: 1920, height: 1080 }))).toBe('video');
    expect(resolveFormat('facebook', video({ width: null, height: null }))).toBe('video');
  });

  it('honours an explicit Facebook choice', () => {
    expect(resolveFormat('facebook', video(), 'video')).toBe('video');
  });
});

describe('Threads rules', () => {
  it('rejects text over 500 characters, counting hashtags, cta and link', () => {
    const r = validatePost({ platform: 'threads', content: { caption: 'a'.repeat(480), cta: 'Watch the full video today', hashtags: ['x'] }, caps });
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain('TEXT_TOO_LONG');
    expect(r.composed.limit).toBe(500);
  });

  it('accepts a normal text post and reports the length', () => {
    const r = validatePost({ platform: 'threads', content: { caption: 'Hello Threads' }, caps });
    expect(r.ok).toBe(true);
    expect(r.format).toBe('text');
    expect(r.composed.length).toBe(13);
  });

  it('requires some text for a text post', () => {
    expect(codes(validatePost({ platform: 'threads', content: {}, caps }))).toContain('TEXT_REQUIRED');
  });

  it('limits links to 5', () => {
    const links = Array.from({ length: 6 }, (_, i) => `https://e.test/${i}`).join(' ');
    expect(codes(validatePost({ platform: 'threads', content: { caption: links }, caps }))).toContain('TOO_MANY_LINKS');
  });

  it('rejects video longer than 5 minutes, wider than 1920px or larger than 1 GB', () => {
    expect(codes(validatePost({ platform: 'threads', content: { caption: 'x' }, media: video({ durationSec: 301 }), caps }))).toContain('VIDEO_TOO_LONG');
    expect(codes(validatePost({ platform: 'threads', content: { caption: 'x' }, media: video({ width: 3840, height: 2160 }), caps }))).toContain('VIDEO_TOO_WIDE');
    expect(codes(validatePost({ platform: 'threads', content: { caption: 'x' }, media: video({ size: 1024 ** 3 + 1 }), caps }))).toContain('VIDEO_TOO_LARGE');
  });

  it('accepts JPEG and PNG images but rejects others and files over 8 MB', () => {
    expect(validatePost({ platform: 'threads', content: { caption: 'x' }, media: image({ contentType: 'image/png' }), caps }).ok).toBe(true);
    expect(codes(validatePost({ platform: 'threads', content: { caption: 'x' }, media: image({ contentType: 'image/webp' }), caps }))).toContain('IMAGE_TYPE');
    expect(codes(validatePost({ platform: 'threads', content: { caption: 'x' }, media: image({ size: 9 * 1024 * 1024 }), caps }))).toContain('IMAGE_TOO_LARGE');
  });

  it('refuses media posts when no public media URL is configured, but allows text', () => {
    const noPublic = { publicMedia: false };
    expect(codes(validatePost({ platform: 'threads', content: { caption: 'x' }, media: video(), caps: noPublic }))).toContain('PUBLIC_MEDIA_UNAVAILABLE');
    expect(validatePost({ platform: 'threads', content: { caption: 'x' }, caps: noPublic }).ok).toBe(true);
  });
});

describe('Instagram rules', () => {
  it('cannot post text only', () => {
    expect(codes(validatePost({ platform: 'instagram', content: { caption: 'x' }, caps }))).toContain('MEDIA_REQUIRED');
  });

  it('enforces 2200 characters and 30 hashtags', () => {
    expect(codes(validatePost({ platform: 'instagram', content: { caption: 'a'.repeat(2201) }, media: video(), caps }))).toContain('TEXT_TOO_LONG');
    const tags = Array.from({ length: 31 }, (_, i) => `t${i}`);
    expect(codes(validatePost({ platform: 'instagram', content: { caption: 'x', hashtags: tags }, media: video(), caps }))).toContain('TOO_MANY_HASHTAGS');
  });

  it('accepts JPEG only for images', () => {
    expect(validatePost({ platform: 'instagram', content: { caption: 'x' }, media: image(), caps }).ok).toBe(true);
    expect(codes(validatePost({ platform: 'instagram', content: { caption: 'x' }, media: image({ contentType: 'image/png' }), caps }))).toContain('IMAGE_TYPE');
  });

  it('requires a public URL for images, not for video (resumable upload exists)', () => {
    const noPublic = { publicMedia: false };
    expect(codes(validatePost({ platform: 'instagram', content: { caption: 'x' }, media: image(), caps: noPublic }))).toContain('PUBLIC_MEDIA_UNAVAILABLE');
    expect(validatePost({ platform: 'instagram', content: { caption: 'x' }, media: video(), caps: noPublic }).ok).toBe(true);
    expect(needsPublicMedia('instagram', 'reel')).toBe(false);
    expect(needsPublicMedia('instagram', 'image')).toBe(true);
  });

  it('warns that links are not clickable and that non-vertical video is cropped', () => {
    const r = validatePost({ platform: 'instagram', content: { caption: 'x', linkUrl: 'https://e.test' }, media: video({ width: 1920, height: 1080 }), caps });
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['LINK_NOT_CLICKABLE', 'NOT_VERTICAL']));
  });

  it('rejects Reels shorter than 3 seconds', () => {
    expect(codes(validatePost({ platform: 'instagram', content: { caption: 'x' }, media: video({ durationSec: 2 }), caps }))).toContain('VIDEO_TOO_SHORT');
  });
});

describe('Facebook rules', () => {
  it('posts text, images and video without a public URL', () => {
    const noPublic = { publicMedia: false };
    expect(validatePost({ platform: 'facebook', content: { caption: 'hi' }, caps: noPublic }).ok).toBe(true);
    expect(validatePost({ platform: 'facebook', content: { caption: 'hi' }, media: image({ contentType: 'image/png' }), caps: noPublic }).ok).toBe(true);
    expect(validatePost({ platform: 'facebook', content: { caption: 'hi' }, media: video(), caps: noPublic }).ok).toBe(true);
  });

  it('holds an explicit Reel to Reel rules: 3-90 s, 9:16, 540x960 minimum', () => {
    const base = { platform: 'facebook', content: { caption: 'x' }, format: 'reel', caps };
    expect(codes(validatePost({ ...base, media: video({ durationSec: 91 }) }))).toContain('VIDEO_TOO_LONG');
    expect(codes(validatePost({ ...base, media: video({ width: 1920, height: 1080 }) }))).toContain('NOT_VERTICAL');
    expect(codes(validatePost({ ...base, media: video({ width: 270, height: 480 }) }))).toContain('RESOLUTION_LOW');
    expect(validatePost({ ...base, media: video() }).ok).toBe(true);
  });

  it('does not apply Reel limits to a regular video', () => {
    expect(validatePost({ platform: 'facebook', content: { caption: 'x' }, format: 'video', media: video({ durationSec: 600, width: 1920, height: 1080 }), caps }).ok).toBe(true);
  });

  it('validates the destination link', () => {
    expect(codes(validatePost({ platform: 'facebook', content: { caption: 'x', linkUrl: 'javascript:alert(1)' }, caps }))).toContain('LINK_INVALID');
  });
});

describe('media knowledge', () => {
  it('warns when the length is only an estimate or unknown, and never claims a measurement it lacks', () => {
    const est = validatePost({ platform: 'instagram', content: { caption: 'x' }, media: video({ measured: 'record' }), caps });
    expect(est.warnings.map((w) => w.code)).toContain('DURATION_ESTIMATED');
    const unknown = validatePost({ platform: 'instagram', content: { caption: 'x' }, media: video({ durationSec: null, measured: 'none' }), caps });
    expect(unknown.warnings.map((w) => w.code)).toContain('DURATION_UNKNOWN');
  });
});

describe('schedule rules', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  const rules = { now, minLeadMs: 120_000, maxAheadDays: 180 };

  it('accepts a time inside the window', () => {
    expect(validateSchedule(new Date(now + 3600_000), rules)).toEqual([]);
  });

  it('rejects the past, too-soon and too-far times and garbage', () => {
    expect(validateSchedule(new Date(now - 1000), rules)[0].code).toBe('SCHEDULE_PAST');
    expect(validateSchedule(new Date(now + 30_000), rules)[0].code).toBe('SCHEDULE_PAST');
    expect(validateSchedule(new Date(now + 181 * 86400_000), rules)[0].code).toBe('SCHEDULE_TOO_FAR');
    expect(validateSchedule('not a date', rules)[0].code).toBe('SCHEDULE_INVALID');
  });
});
