jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../src/services/common/MetricsService', () => ({ increment: jest.fn(), recordDuration: jest.fn() }));
jest.mock('../../src/services/cache/CacheLedger', () => ({
  hit: jest.fn(), miss: jest.fn(), shared: jest.fn(), stale: jest.fn(), generated: jest.fn(), stored: jest.fn(),
}));

/**
 * The cache bucket as a Map of key -> Buffer, behind the same calls the real MinIO client takes.
 * `copyOk` / `getOk` let a test remove the bytes while leaving the sidecar, i.e. a stale entry.
 */
const mockBucket = { objects: new Map(), copyError: null, getError: null, readError: null };
const noSuchKey = () => Object.assign(new Error('The specified key does not exist.'), { code: 'NoSuchKey' });

const mockClient = {
  getObject: jest.fn(async (_bucket, key) => {
    if (mockBucket.readError) throw mockBucket.readError;
    if (!mockBucket.objects.has(key)) throw noSuchKey();
    return (async function* stream() { yield mockBucket.objects.get(key); }());
  }),
  fGetObject: jest.fn(async (_bucket, key) => {
    if (mockBucket.getError) throw mockBucket.getError;
    if (!mockBucket.objects.has(key)) throw noSuchKey();
  }),
  fPutObject: jest.fn(async (_bucket, key) => { mockBucket.objects.set(key, Buffer.from('bytes')); }),
  putObject: jest.fn(async (_bucket, key, body) => { mockBucket.objects.set(key, Buffer.from(body)); }),
  removeObject: jest.fn(async (_bucket, key) => { mockBucket.objects.delete(key); }),
};
const mockProvider = {
  client: mockClient,
  copyObject: jest.fn(async (_destBucket, _destKey, _srcBucket, srcKey) => {
    if (mockBucket.copyError) throw mockBucket.copyError;
    if (!mockBucket.objects.has(srcKey)) throw noSuchKey();
  }),
};
jest.mock('../../src/services/storage/providers', () => ({ getStorageProvider: () => mockProvider }));
jest.mock('fs', () => ({ ...jest.requireActual('fs'), promises: { ...jest.requireActual('fs').promises, stat: jest.fn().mockResolvedValue({ size: 4096 }) } }));

const config = require('../../src/config');
const CacheService = require('../../src/services/common/CacheService');
const MetricsService = require('../../src/services/common/MetricsService');
const ledger = require('../../src/services/cache/CacheLedger');

const putPair = (prefix, hash, ext, meta = { duration: 3 }) => {
  mockBucket.objects.set(`${prefix}/${hash}.${ext}`, Buffer.from('bytes'));
  mockBucket.objects.set(`${prefix}/${hash}.json`, Buffer.from(JSON.stringify(meta)));
};

const original = config.cache.enabled;
beforeEach(() => {
  jest.clearAllMocks();
  mockBucket.objects = new Map();
  mockBucket.copyError = null;
  mockBucket.getError = null;
  mockBucket.readError = null;
  config.cache.enabled = true;
});
afterAll(() => { config.cache.enabled = original; });

describe('image cache', () => {
  it('a hit copies the image into the job and is recorded', async () => {
    putPair('image', 'h1', 'png', { width: 1024 });
    expect(await CacheService.getImage('h1', 'job-1', 'img-h1.png')).toEqual({ width: 1024 });
    expect(mockProvider.copyObject).toHaveBeenCalledWith(expect.any(String), 'job-1/images/img-h1.png', expect.any(String), 'image/h1.png');
    expect(ledger.hit).toHaveBeenCalledWith('image', 'h1');
    expect(MetricsService.increment).toHaveBeenCalledWith('cache.hits');
  });

  it('a plain miss (nothing was ever cached) is a miss, not a stale entry', async () => {
    expect(await CacheService.getImage('nope', 'job-1', 'f.png')).toBeNull();
    expect(ledger.miss).toHaveBeenCalledWith('image', 'nope');
    expect(ledger.stale).not.toHaveBeenCalled();
    expect(MetricsService.increment).toHaveBeenCalledWith('cache.misses');
  });

  it('a STALE entry (sidecar present, image object gone) is evicted, recorded, and reported as a miss', async () => {
    mockBucket.objects.set('image/h2.json', Buffer.from('{"width":1}')); // no image/h2.png
    expect(await CacheService.getImage('h2', 'job-1', 'img-h2.png')).toBeNull();

    expect(ledger.stale).toHaveBeenCalledWith('image', 'h2');
    expect(ledger.miss).toHaveBeenCalledWith('image', 'h2');
    expect(ledger.hit).not.toHaveBeenCalled();
    expect(mockClient.removeObject).toHaveBeenCalledWith(expect.any(String), 'image/h2.json');
    expect(mockBucket.objects.has('image/h2.json')).toBe(false); // so the next lookup is a fast, honest miss
  });

  it('after a stale entry is evicted, regenerating and storing it heals the entry', async () => {
    mockBucket.objects.set('image/h3.json', Buffer.from('{}'));
    await CacheService.getImage('h3', 'job-1', 'f.png');
    await CacheService.putImage('h3', '/tmp/x.png', { width: 2 });
    expect(await CacheService.getImage('h3', 'job-1', 'f.png')).toEqual({ width: 2 });
  });

  it('a backend failure (not "no such key") is a miss and does NOT evict a possibly healthy entry', async () => {
    putPair('image', 'h4', 'png');
    mockBucket.copyError = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
    expect(await CacheService.getImage('h4', 'job-1', 'f.png')).toBeNull();
    expect(ledger.stale).not.toHaveBeenCalled();
    expect(mockClient.removeObject).not.toHaveBeenCalled();
    expect(ledger.miss).toHaveBeenCalled();
  });

  it('an unreadable sidecar is a miss, never a crash', async () => {
    mockBucket.readError = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    expect(await CacheService.getImage('h5', 'job-1', 'f.png')).toBeNull();
  });

  it('a corrupt sidecar (not JSON) is a miss, never a crash', async () => {
    mockBucket.objects.set('image/h6.json', Buffer.from('not json{'));
    expect(await CacheService.getImage('h6', 'job-1', 'f.png')).toBeNull();
  });

  it('storing records the size', async () => {
    await CacheService.putImage('h7', '/tmp/x.png', { width: 1 });
    expect(ledger.stored).toHaveBeenCalledWith('image', 'h7', { sizeBytes: 4096 });
  });

  it('does nothing at all when the cache is switched off', async () => {
    config.cache.enabled = false;
    putPair('image', 'h8', 'png');
    expect(await CacheService.getImage('h8', 'job-1', 'f.png')).toBeNull();
    await CacheService.putImage('h8b', '/tmp/x.png', {});
    expect(mockClient.getObject).not.toHaveBeenCalled();
    expect(mockClient.fPutObject).not.toHaveBeenCalled();
    expect(ledger.miss).not.toHaveBeenCalled();
  });

  it('a failure to store is swallowed - a flaky cache never fails a generation', async () => {
    mockClient.fPutObject.mockRejectedValueOnce(new Error('disk full'));
    await expect(CacheService.putImage('h9', '/tmp/x.png', {})).resolves.toBeUndefined();
    expect(ledger.stored).not.toHaveBeenCalled();
  });
});

describe('TTS audio cache', () => {
  it('hit, miss and stale behave the same way', async () => {
    putPair('tts', 't1', 'mp3', { duration: 5 });
    expect(await CacheService.getTtsAudio('t1', 'job-1', 'scene1.mp3')).toEqual({ duration: 5 });
    expect(ledger.hit).toHaveBeenCalledWith('tts', 't1');

    expect(await CacheService.getTtsAudio('t2', 'job-1', 'scene1.mp3')).toBeNull();
    expect(ledger.miss).toHaveBeenCalledWith('tts', 't2');

    mockBucket.objects.set('tts/t3.json', Buffer.from('{"duration":1}'));
    expect(await CacheService.getTtsAudio('t3', 'job-1', 'scene1.mp3')).toBeNull();
    expect(ledger.stale).toHaveBeenCalledWith('tts', 't3');
    expect(mockBucket.objects.has('tts/t3.json')).toBe(false);
  });
});

describe('segment cache', () => {
  it('a hit downloads the clip and counts under the segment kind', async () => {
    mockBucket.objects.set('tts-seg/raw/s1.json', Buffer.from('{"durationMs":900}'));
    mockBucket.objects.set('tts-seg/raw/s1.wav', Buffer.from('wav'));
    expect(await CacheService.getSegmentAudio('raw', 's1', '/tmp/s1.wav')).toEqual({ durationMs: 900 });
    expect(ledger.hit).toHaveBeenCalledWith('tts-seg-raw', 's1');
    expect(MetricsService.increment).toHaveBeenCalledWith('tts.segment.raw.hit');
  });

  it('a miss counts under the segment kind', async () => {
    expect(await CacheService.getSegmentAudio('processed', 's2', '/tmp/s2.wav')).toBeNull();
    expect(ledger.miss).toHaveBeenCalledWith('tts-seg-processed', 's2');
    expect(MetricsService.increment).toHaveBeenCalledWith('tts.segment.processed.miss');
  });

  it('a clip that vanished from storage is stale: evicted, recorded, and a miss', async () => {
    mockBucket.objects.set('tts-seg/raw/s3.json', Buffer.from('{"durationMs":900}'));
    expect(await CacheService.getSegmentAudio('raw', 's3', '/tmp/s3.wav')).toBeNull();
    expect(ledger.stale).toHaveBeenCalledWith('tts-seg-raw', 's3');
    expect(mockBucket.objects.has('tts-seg/raw/s3.json')).toBe(false);
  });

  it('storing reports success and records the size', async () => {
    expect(await CacheService.putSegmentAudio('raw', 's4', '/tmp/s4.wav', { durationMs: 1 })).toBe(true);
    expect(ledger.stored).toHaveBeenCalledWith('tts-seg-raw', 's4', { sizeBytes: 4096 });
  });

  it('storing reports failure without throwing', async () => {
    mockClient.fPutObject.mockRejectedValueOnce(new Error('nope'));
    expect(await CacheService.putSegmentAudio('raw', 's5', '/tmp/s5.wav', {})).toBe(false);
  });
});

describe('reference transcripts', () => {
  it('records hit and miss', async () => {
    mockBucket.objects.set('tts-transcript/voice1.txt', Buffer.from('hello'));
    expect(await CacheService.getReferenceTranscript('voice1')).toBe('hello');
    expect(ledger.hit).toHaveBeenCalledWith('transcript', 'voice1');
    expect(await CacheService.getReferenceTranscript('other')).toBeNull();
    expect(ledger.miss).toHaveBeenCalledWith('transcript', 'other');
  });
});
