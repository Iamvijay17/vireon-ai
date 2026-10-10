const crypto = require('crypto');

/**
 * Shared fixtures for the publishing service/worker tests: a connected
 * account, a rendered lesson, a storage fake, and a queue fake. Models are
 * mocked per test file (jest.mock must be hoisted there); this builds the
 * data to put in them.
 */

const KEY = crypto.randomBytes(32).toString('base64');
const OWNER = 'local';
const IDS = Object.freeze({
  account: 'pac-aaaaaaaa',
  otherAccount: 'pac-bbbbbbbb',
  course: 'cou-aaaaaaaa',
  video: 'vid-aaaaaaaa',
  video2: 'vid-bbbbbbbb',
});

const RENDER_URL = (id) => `http://127.0.0.1:9000/vireon-video/${id}/final.mp4`;

const storageFake = (over = {}) => {
  const objects = new Map([[`vireon-video/${IDS.video}/final.mp4`, { size: 5_000_000, etag: 'etag-1' }]]);
  return {
    objects,
    parsePublicUrl: jest.fn((url) => {
      const [bucket, ...rest] = new URL(url).pathname.replace(/^\//, '').split('/');
      return { bucket, key: rest.join('/') };
    }),
    statObject: jest.fn(async (bucket, key) => objects.get(`${bucket}/${key}`) || null),
    getObjectRange: jest.fn(async (_b, _k, offset, length) => Buffer.alloc(length, offset % 251)),
    getObjectStream: jest.fn(),
    putObjectFile: jest.fn(),
    ...over,
  };
};

const queueFake = () => {
  const queue = { add: jest.fn(async () => ({})) };
  return { queue, queues: jest.fn(() => queue) };
};

const authFake = (over = {}) => ({
  isConfigured: jest.fn(() => true),
  getAccessToken: jest.fn(async () => 'AT'),
  ...over,
});

const settingsFor = (youtube = {}) => () => ({
  youtube: {
    apiVerified: true, maxUploadBytes: 4 * 1024 ** 3, dailyUploadLimit: 100, chunkSizeBytes: 256 * 1024,
    requestTimeoutMs: 1000, maxAttempts: 5, processingPollMs: 10, processingWindowMs: 1000, processingMaxChecks: 3,
    ...youtube,
  },
  export: { maxBytes: 20 * 1024 ** 3 },
  google: {}, encryptionKey: KEY,
});

module.exports = { KEY, OWNER, IDS, RENDER_URL, storageFake, queueFake, authFake, settingsFor };
