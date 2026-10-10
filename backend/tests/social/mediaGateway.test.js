jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), border: jest.fn(),
}));

const crypto = require('crypto');
const http = require('http');
const express = require('express');
const gateway = require('../../src/services/social/mediaGateway');

const KEY = crypto.randomBytes(32).toString('base64');
const OTHER_KEY = crypto.randomBytes(32).toString('base64');
const settings = { publicMediaBaseUrl: 'https://media.example.com', mediaTokenTtlMs: 3600_000 };
const OBJECT = { bucket: 'vireon-video', key: 'social/local/cam-aaaaaaaa/abc.mp4' };

describe('signed media tokens', () => {
  it('round-trips bucket, key and expiry', () => {
    const exp = Date.now() + 1000;
    const token = gateway.mintMediaToken(OBJECT, { expiresAt: exp, rawKey: KEY });
    expect(gateway.verifyMediaToken(token, { rawKey: KEY })).toEqual({ ...OBJECT, expiresAt: exp });
  });

  it('rejects expired, tampered, truncated, foreign-key and malformed tokens', () => {
    const token = gateway.mintMediaToken(OBJECT, { expiresAt: Date.now() + 1000, rawKey: KEY });
    expect(gateway.verifyMediaToken(token, { rawKey: KEY, now: Date.now() + 5000 })).toBeNull();
    expect(gateway.verifyMediaToken(token, { rawKey: OTHER_KEY })).toBeNull();
    const [body, mac] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ b: 'vireon-video', k: 'other/secret.mp4', e: Date.now() + 99999 })).toString('base64url');
    expect(gateway.verifyMediaToken(`${forged}.${mac}`, { rawKey: KEY })).toBeNull();
    expect(gateway.verifyMediaToken(`${body}.${mac.slice(0, -2)}`, { rawKey: KEY })).toBeNull();
    expect(gateway.verifyMediaToken(`${body}.${mac}.x`, { rawKey: KEY })).toBeNull();
    for (const bad of ['', 'abc', null, undefined, 42, `${body}.`, 'x'.repeat(5000)]) expect(gateway.verifyMediaToken(bad, { rawKey: KEY })).toBeNull();
  });

  it('builds a URL on the configured public origin that ends in the file name', () => {
    const url = gateway.publicMediaUrl(OBJECT, { settings, rawKey: KEY, now: 1_000_000 });
    expect(url.startsWith('https://media.example.com/api/social/media/')).toBe(true);
    expect(url.endsWith('/abc.mp4')).toBe(true);
    const token = url.split('/api/social/media/')[1].split('/')[0];
    expect(gateway.verifyMediaToken(token, { rawKey: KEY, now: 1_000_000 }).expiresAt).toBe(1_000_000 + 3600_000);
  });

  it('refuses to make a URL when no public origin is configured', () => {
    expect(gateway.isConfigured({ publicMediaBaseUrl: '' })).toBe(false);
    expect(() => gateway.publicMediaUrl(OBJECT, { settings: { publicMediaBaseUrl: '', mediaTokenTtlMs: 1 }, rawKey: KEY })).toThrow(/public media URL/);
  });

  it('parses byte ranges', () => {
    expect(gateway.parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
    expect(gateway.parseRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 });
    expect(gateway.parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(gateway.parseRange('bytes=0-5000', 1000)).toEqual({ start: 0, end: 999 });
    expect(gateway.parseRange('bytes=2000-3000', 1000)).toEqual({ invalid: true });
    expect(gateway.parseRange('garbage', 1000)).toBeNull();
  });
});

describe('media HTTP handler', () => {
  const content = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));
  let server; let base; let storage;

  beforeAll(async () => {
    storage = {
      statObject: jest.fn(async (bucket, key) => (bucket === OBJECT.bucket && key === OBJECT.key ? { size: content.length, etag: 'e' } : null)),
      getObjectRange: jest.fn(async (_b, _k, off, len) => content.subarray(off, off + len)),
    };
    const app = express();
    app.get('/api/social/media/:token/:file', gateway.createMediaHandler({ storage, rawKey: KEY }));
    app.head('/api/social/media/:token/:file', gateway.createMediaHandler({ storage, rawKey: KEY }));
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));

  const urlFor = (object = OBJECT, expiresAt = Date.now() + 60_000) => `${base}/api/social/media/${gateway.mintMediaToken(object, { expiresAt, rawKey: KEY })}/f.mp4`;

  it('serves the whole object with the right type and no-store caching', async () => {
    const res = await fetch(urlFor());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('cache-control')).toMatch(/no-store/);
    expect(Buffer.from(await res.arrayBuffer()).equals(content)).toBe(true);
  });

  it('serves byte ranges with 206 and Content-Range', async () => {
    const res = await fetch(urlFor(), { headers: { Range: 'bytes=100-199' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 100-199/1000');
    expect(Buffer.from(await res.arrayBuffer()).equals(content.subarray(100, 200))).toBe(true);
  });

  it('answers HEAD with headers only and 416 for an unsatisfiable range', async () => {
    const head = await fetch(urlFor(), { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe('1000');
    const bad = await fetch(urlFor(), { headers: { Range: 'bytes=5000-6000' } });
    expect(bad.status).toBe(416);
  });

  it('answers 404 - and reveals nothing - for expired, forged or unknown objects', async () => {
    expect((await fetch(urlFor(OBJECT, Date.now() - 1000))).status).toBe(404);
    expect((await fetch(`${base}/api/social/media/not-a-token/f.mp4`)).status).toBe(404);
    expect((await fetch(urlFor({ bucket: OBJECT.bucket, key: 'social/local/missing.mp4' }))).status).toBe(404);
    const body = await (await fetch(urlFor({ bucket: OBJECT.bucket, key: 'social/local/missing.mp4' }))).text();
    expect(body).toBe('');
  });
});
