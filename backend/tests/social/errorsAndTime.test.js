const { fromMetaResponse, toStoredSocialError, safeMessage } = require('../../src/services/social/errors');
const { PublishError } = require('../../src/services/publishing/errors');
const { zonedToUtc, utcToZoned, isValidTimeZone } = require('../../src/services/social/timezone');
const { sniffMedia, readImageSize } = require('../../src/services/social/imageMeta');

const env = (code, subcode, extra = {}) => ({ error: { message: 'm', code, error_subcode: subcode, ...extra } });

describe('Meta error classification', () => {
  it.each([
    [400, env(190, 463), 'AUTH_REVOKED', false, true],
    [401, env(102), 'AUTH_REVOKED', false, true],
    [403, env(200), 'PERMISSION_DENIED', false, true],
    [403, env(10), 'PERMISSION_DENIED', false, true],
    [400, env(4), 'RATE_LIMITED', true, false],
    [400, env(17), 'RATE_LIMITED', true, false],
    [400, env(80004), 'RATE_LIMITED', true, false],
    [429, {}, 'RATE_LIMITED', true, false],
    [500, env(2), 'SERVER', true, false],
    [503, {}, 'SERVER', true, false],
    [400, env(1, undefined, { is_transient: true }), 'SERVER', true, false],
    [400, env(368), 'CONTENT_REJECTED', false, false],
    [400, env(100, 2207026), 'MEDIA_INVALID', false, false],
    [400, env(100, 2207003), 'MEDIA_UNREACHABLE', true, false],
    [400, env(9007), 'MEDIA_NOT_READY', true, false],
    [400, env(100, 2207042), 'PUBLISH_LIMIT_REACHED', true, false],
    [400, env(100, 2207050), 'ACCOUNT_INELIGIBLE', false, false],
  ])('HTTP %i %j -> %s (retryable=%s, reauth=%s)', (status, body, code, retryable, reauth) => {
    const err = fromMetaResponse(status, body, { platform: 'instagram', context: 'container' });
    expect(err).toBeInstanceOf(PublishError);
    expect(err.code).toBe(code);
    expect(err.retryable).toBe(retryable);
    expect(err.requiresReauth).toBe(reauth);
  });

  it('treats a generic invalid parameter on a media call as invalid media, on a post call as rejected content', () => {
    expect(fromMetaResponse(400, env(100), { context: 'container' }).code).toBe('MEDIA_INVALID');
    expect(fromMetaResponse(400, env(100), { context: 'post' }).code).toBe('CONTENT_REJECTED');
  });

  it('classifies an unrecognised failure as UNKNOWN and not retryable (never retried blindly)', () => {
    const err = fromMetaResponse(418, env(99999));
    expect(err.code).toBe('UNKNOWN');
    expect(err.retryable).toBe(false);
  });

  it('never puts an access token in a message', () => {
    const err = fromMetaResponse(400, env(100, undefined, { message: 'bad request access_token=EAAB123secret&x=1' }));
    expect(err.message).not.toContain('EAAB123secret');
    expect(safeMessage('x'.repeat(1000), '').length).toBe(300);
  });

  it('stores a sanitised error including whether reauthorisation is needed', () => {
    const stored = toStoredSocialError(fromMetaResponse(400, env(190)));
    expect(stored).toMatchObject({ code: 'AUTH_REVOKED', retryable: false, requiresReauth: true, httpStatus: 400 });
    expect(stored.action).toMatch(/Reconnect/);
  });
});

describe('timezones', () => {
  it('converts wall-clock time in a zone to UTC', () => {
    expect(zonedToUtc('2026-10-20T14:30', 'Asia/Kolkata').toISOString()).toBe('2026-10-20T09:00:00.000Z');
    expect(zonedToUtc('2026-07-01T09:00', 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z'); // EDT
    expect(zonedToUtc('2026-12-01T09:00', 'America/New_York').toISOString()).toBe('2026-12-01T14:00:00.000Z'); // EST
    expect(zonedToUtc('2026-10-20T14:30', 'UTC').toISOString()).toBe('2026-10-20T14:30:00.000Z');
  });

  it('round-trips through utcToZoned', () => {
    const utc = zonedToUtc('2026-03-08T12:00', 'America/Los_Angeles');
    expect(utcToZoned(utc, 'America/Los_Angeles')).toBe('2026-03-08T12:00');
  });

  it('rejects invalid zones, malformed and non-existent dates', () => {
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(zonedToUtc('2026-10-20T14:30', 'Mars/Olympus')).toBeNull();
    expect(zonedToUtc('tomorrow', 'UTC')).toBeNull();
    expect(zonedToUtc('2026-02-31T10:00', 'UTC')).toBeNull();
  });
});

describe('file sniffing', () => {
  it('identifies JPEG, PNG and MP4/MOV by content, not by name', () => {
    expect(sniffMedia(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toMatchObject({ kind: 'image', contentType: 'image/jpeg' });
    expect(sniffMedia(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toMatchObject({ kind: 'image', contentType: 'image/png' });
    expect(sniffMedia(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom')]))).toMatchObject({ kind: 'video', contentType: 'video/mp4' });
    expect(sniffMedia(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypqt  ')]))).toMatchObject({ kind: 'video', contentType: 'video/quicktime' });
    expect(sniffMedia(Buffer.from('<?php echo 1; ?> not media at all'))).toBeNull();
    expect(sniffMedia(Buffer.alloc(4))).toBeNull();
  });

  it('reads PNG and JPEG dimensions from the header', () => {
    const png = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    png.writeUInt32BE(1080, 16);
    png.writeUInt32BE(1350, 20);
    expect(readImageSize(png, 'image/png')).toEqual({ width: 1080, height: 1350 });

    // SOI + APP0 (length 16) + SOF0 (height 720, width 1280)
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14),
      Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0xd0, 0x05, 0x00, 0x03]), Buffer.alloc(9),
    ]);
    expect(readImageSize(jpeg, 'image/jpeg')).toEqual({ width: 1280, height: 720 });
    expect(readImageSize(Buffer.alloc(4), 'image/jpeg')).toBeNull();
  });
});
