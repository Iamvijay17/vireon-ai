const crypto = require('crypto');
const path = require('path');
const { Readable } = require('stream');
const config = require('../../config');
const { decodeEncryptionKey } = require('../../config/validate');
const LoggerService = require('../common/LoggerService');
const { PublishError } = require('../publishing/errors');

/**
 * Public media links for the platforms that fetch media by URL (Threads, and
 * Instagram images).
 *
 * The rest of Vireon has no login and lives on a private network, so exposing
 * "the app" is not an option. Instead, the worker mints a SIGNED, EXPIRING
 * link to exactly one stored object at the moment it needs Meta to fetch it,
 * and the only route that must be reachable from the internet is
 *
 *     GET|HEAD /api/social/media/<signed token>/<file name>
 *
 * The token is an HMAC (key derived from PUBLISHING_TOKEN_ENCRYPTION_KEY, so
 * there is nothing extra to configure or leak) over {bucket, key, expiry}.
 * Without a valid unexpired token the route serves nothing; with one it serves
 * read-only bytes of that single object, with Range support. It never lists,
 * never writes, and a leaked link stops working when it expires.
 *
 * Setup (a reverse-proxy rule that exposes just this path) is in
 * docs/social-promotion.md. `SOCIAL_PUBLIC_MEDIA_BASE_URL` is the public origin.
 */

const CONTEXT = 'vireon-social-media/v1';
const MAX_RANGE_CHUNK = 8 * 1024 * 1024;

function signingKey(rawKey = config.publishing.encryptionKey) {
  const master = decodeEncryptionKey(rawKey || '');
  if (!master) throw new PublishError('NOT_CONFIGURED', 'PUBLISHING_TOKEN_ENCRYPTION_KEY is not set - cannot sign media links');
  return crypto.createHmac('sha256', master).update(CONTEXT).digest();
}

const b64 = (buf) => Buffer.from(buf).toString('base64url');

function sign(payload, key) {
  const body = b64(JSON.stringify(payload));
  const mac = b64(crypto.createHmac('sha256', key).update(body).digest());
  return `${body}.${mac}`;
}

/** @returns {string} token for exactly this object, valid until `expiresAt` (ms epoch). */
function mintMediaToken({ bucket, key }, { expiresAt, rawKey } = {}) {
  return sign({ b: bucket, k: key, e: expiresAt }, signingKey(rawKey));
}

/** @returns {{bucket:string,key:string,expiresAt:number}|null} null for anything not minted by us, tampered, or expired. */
function verifyMediaToken(token, { now = Date.now(), rawKey } = {}) {
  if (typeof token !== 'string' || token.length > 2000) return null;
  const [body, mac, extra] = token.split('.');
  if (!body || !mac || extra !== undefined) return null;
  let key;
  try {
    key = signingKey(rawKey);
  } catch {
    return null;
  }
  const expected = crypto.createHmac('sha256', key).update(body).digest();
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof p.b !== 'string' || typeof p.k !== 'string' || !(p.e > now)) return null;
    return { bucket: p.b, key: p.k, expiresAt: p.e };
  } catch {
    return null;
  }
}

function isConfigured(settings = config.social) {
  return Boolean(settings.publicMediaBaseUrl);
}

/**
 * The public URL Meta should fetch. The file name is only there so the URL ends in a real extension
 * (some fetchers sniff it); it is not part of the authorisation.
 */
function publicMediaUrl({ bucket, key }, { settings = config.social, now = Date.now(), rawKey } = {}) {
  if (!isConfigured(settings)) {
    throw new PublishError('PUBLIC_MEDIA_UNAVAILABLE', 'No public media URL is configured (SOCIAL_PUBLIC_MEDIA_BASE_URL)');
  }
  const token = mintMediaToken({ bucket, key }, { expiresAt: now + settings.mediaTokenTtlMs, rawKey });
  const name = encodeURIComponent(path.posix.basename(key) || 'media');
  return `${settings.publicMediaBaseUrl}/api/social/media/${token}/${name}`;
}

const MIME_BY_EXT = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start;
  let end;
  if (m[1] === '') {
    const suffix = Number(m[2]);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!(start <= end) || start >= size) return { invalid: true };
  return { start, end };
}

/**
 * Express handler for GET|HEAD /api/social/media/:token/:file. `storage` is injectable for tests.
 * Every refusal is a bare 404 so the route reveals nothing about what exists.
 */
function createMediaHandler({ storage, rawKey } = {}) {
  return async function mediaHandler(req, res) {
    res.set('Cache-Control', 'private, max-age=0, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    const claims = verifyMediaToken(req.params.token, { rawKey });
    if (!claims) return res.status(404).end();

    try {
      const store = storage || require('../storage/providers').getStorageProvider();
      const stat = await store.statObject(claims.bucket, claims.key);
      if (!stat || !(stat.size >= 0)) return res.status(404).end();

      const type = MIME_BY_EXT[path.extname(claims.key).toLowerCase()] || 'application/octet-stream';
      res.set('Accept-Ranges', 'bytes');
      res.set('Content-Type', type);

      const range = req.get('range') ? parseRange(req.get('range'), stat.size) : null;
      if (range?.invalid) {
        res.set('Content-Range', `bytes */${stat.size}`);
        return res.status(416).end();
      }

      const start = range ? range.start : 0;
      const end = range ? range.end : stat.size - 1;
      const length = stat.size === 0 ? 0 : end - start + 1;
      res.status(range ? 206 : 200);
      if (range) res.set('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.set('Content-Length', String(length));
      if (req.method === 'HEAD' || length === 0) return res.end();

      async function* chunks() {
        let pos = start;
        while (pos <= end) {
          const len = Math.min(MAX_RANGE_CHUNK, end - pos + 1);
          const buf = await store.getObjectRange(claims.bucket, claims.key, pos, len);
          if (!buf.length) return;
          pos += buf.length;
          yield buf;
        }
      }
      const stream = Readable.from(chunks());
      stream.on('error', (err) => {
        LoggerService.warn('Public media stream failed', { error: err.message });
        res.destroy(err);
      });
      res.on('close', () => stream.destroy());
      return stream.pipe(res);
    } catch (err) {
      LoggerService.warn('Public media request failed', { error: err.message });
      return res.status(404).end();
    }
  };
}

module.exports = { mintMediaToken, verifyMediaToken, publicMediaUrl, createMediaHandler, isConfigured, parseRange };
