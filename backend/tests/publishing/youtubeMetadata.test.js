const { validateYouTubeMetadata, mergeAndValidate, toInsertBody, tagsLength } = require('../../src/services/publishing/youtube/metadata');
const { SchemaValidationError } = require('../../src/utils/errors');

const NOW = Date.parse('2026-10-10T12:00:00Z');
const valid = () => ({
  title: 'Intro to Closures',
  description: 'A short lesson.',
  tags: ['javascript', 'closures'],
  categoryId: '27',
  language: 'en',
  privacyStatus: 'private',
  publishAt: null,
  madeForKids: false,
  containsSyntheticMedia: true,
});
const verified = { apiVerified: true, now: NOW };

const fieldsOf = (fn) => {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(SchemaValidationError);
    return err.details.map((d) => d.field);
  }
  throw new Error('expected validation to fail');
};

describe('YouTube metadata validation', () => {
  it('accepts a complete, valid object', () => {
    expect(validateYouTubeMetadata(valid(), verified)).toMatchObject({ title: 'Intro to Closures', privacyStatus: 'private' });
  });

  it.each([
    ['empty title', { title: '   ' }, 'title'],
    ['title over 100 characters', { title: 'x'.repeat(101) }, 'title'],
    ['angle brackets in title', { title: 'Hello <b>' }, 'title'],
    ['angle brackets in description', { description: 'a > b' }, 'description'],
    ['description over 5000 bytes', { description: 'é'.repeat(2600) }, 'description'],
    ['unknown category', { categoryId: '9999' }, 'categoryId'],
    ['malformed language', { language: 'english please' }, 'language'],
    ['missing made-for-kids answer', { madeForKids: undefined }, 'madeForKids'],
  ])('rejects %s', (_label, patch, field) => {
    expect(fieldsOf(() => validateYouTubeMetadata({ ...valid(), ...patch }, verified))).toContain(field);
  });

  it('counts tag length the way YouTube does (quotes around tags with spaces, commas between)', () => {
    expect(tagsLength(['a', 'b'])).toBe(3);
    expect(tagsLength(['two words'])).toBe(11);
    const tooMany = Array.from({ length: 40 }, (_, i) => `keyword-number-${i}-padding`);
    expect(fieldsOf(() => validateYouTubeMetadata({ ...valid(), tags: tooMany }, verified))).toContain('tags');
  });

  it('trims and de-duplicates tags', () => {
    const out = validateYouTubeMetadata({ ...valid(), tags: [' js ', 'JS', 'node  js', 'node js'] }, verified);
    expect(out.tags).toEqual(['js', 'node js']);
  });

  describe('scheduling', () => {
    it('accepts a private video with a publish time in the future', () => {
      const out = validateYouTubeMetadata({ ...valid(), publishAt: '2026-10-12T09:00:00Z' }, verified);
      expect(out.publishAt).toBeInstanceOf(Date);
    });

    it('requires the video to be private when scheduled', () => {
      const fields = fieldsOf(() => validateYouTubeMetadata({ ...valid(), privacyStatus: 'public', publishAt: '2026-10-12T09:00:00Z' }, verified));
      expect(fields).toContain('privacyStatus');
    });

    it('rejects a publish time that is in the past or too close', () => {
      expect(fieldsOf(() => validateYouTubeMetadata({ ...valid(), publishAt: '2026-10-10T11:00:00Z' }, verified))).toContain('publishAt');
      expect(fieldsOf(() => validateYouTubeMetadata({ ...valid(), publishAt: '2026-10-10T12:02:00Z' }, verified))).toContain('publishAt');
    });
  });

  describe('unverified API projects (YouTube locks their uploads to private)', () => {
    const unverified = { apiVerified: false, now: NOW };

    it('allows private uploads', () => {
      expect(() => validateYouTubeMetadata(valid(), unverified)).not.toThrow();
    });

    it('refuses public and unlisted with an explanation instead of a silently-private video', () => {
      expect(fieldsOf(() => validateYouTubeMetadata({ ...valid(), privacyStatus: 'public' }, unverified))).toContain('privacyStatus');
      expect(fieldsOf(() => validateYouTubeMetadata({ ...valid(), privacyStatus: 'unlisted' }, unverified))).toContain('privacyStatus');
    });

    it('refuses scheduling', () => {
      expect(fieldsOf(() => validateYouTubeMetadata({ ...valid(), publishAt: '2026-10-12T09:00:00Z' }, unverified))).toContain('publishAt');
    });
  });

  describe('mergeAndValidate', () => {
    it('applies a patch over current metadata and validates the whole', () => {
      const out = mergeAndValidate(valid(), { title: 'New title' }, verified);
      expect(out.title).toBe('New title');
      expect(out.description).toBe('A short lesson.');
    });

    it('rejects unknown fields rather than ignoring a typo', () => {
      expect(fieldsOf(() => mergeAndValidate(valid(), { titel: 'x' }, verified))).toEqual(['titel']);
    });

    it('rejects a patch that makes the whole invalid', () => {
      expect(fieldsOf(() => mergeAndValidate(valid(), { title: '' }, verified))).toContain('title');
    });
  });

  describe('videos.insert body', () => {
    it('maps to snippet + status exactly as the API expects', () => {
      const body = toInsertBody(validateYouTubeMetadata({ ...valid(), privacyStatus: 'private', publishAt: '2026-10-12T09:00:00Z' }, verified));
      expect(body).toEqual({
        snippet: { title: 'Intro to Closures', description: 'A short lesson.', tags: ['javascript', 'closures'], categoryId: '27', defaultLanguage: 'en' },
        status: { privacyStatus: 'private', publishAt: '2026-10-12T09:00:00.000Z', selfDeclaredMadeForKids: false, containsSyntheticMedia: true },
      });
    });

    it('omits language and publishAt when unset', () => {
      const body = toInsertBody(validateYouTubeMetadata({ ...valid(), language: '' }, verified));
      expect(body.snippet).not.toHaveProperty('defaultLanguage');
      expect(body.status).not.toHaveProperty('publishAt');
    });
  });
});
