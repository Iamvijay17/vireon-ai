/**
 * Resource id format: <prefix>-<lowercase-alphanumeric>, e.g. aud-btclnx2w.
 * New ids are lowercase; legacy uppercase ids (aud-BTCLNX2W) already in the DB,
 * in MinIO keys and in URLs must keep validating.
 */
const mongoose = require('mongoose');
const {
  PREFIXES,
  generateId,
  generateAudioGenerationId,
  generateCourseCurriculumId,
  generateCourseId,
  generateCourseVideoId,
  generateFavoriteVoiceId,
  generateImageGenerationId,
  generatePlatformAccountId,
  generatePublishingJobId,
  generateSocialCampaignId,
  generateSocialPostId,
  generateSceneId,
  generateVideoJobId,
  ID_PATTERN,
  NEW_ID_PATTERN,
  idPatternFor,
  isValidId,
  isLegacyId,
} = require('../../src/utils/id');
const { jobIdSchema, audioIdSchema, imageIdSchema, idSchema, idArraySchema, jobIdArraySchema } = require('../../src/validators');

const generators = {
  aud: generateAudioGenerationId,
  img: generateImageGenerationId,
  job: generateVideoJobId,
  vid: generateCourseVideoId,
  sce: generateSceneId,
  cou: generateCourseId,
  crc: generateCourseCurriculumId,
  fav: generateFavoriteVoiceId,
  pac: generatePlatformAccountId,
  pub: generatePublishingJobId,
  cam: generateSocialCampaignId,
  spo: generateSocialPostId,
};

describe('generateId', () => {
  it.each(Object.entries(generators))('%s generator makes <prefix>-<8 lowercase alnum>', (prefix, gen) => {
    for (let i = 0; i < 200; i += 1) {
      const id = gen();
      expect(id.startsWith(`${prefix}-`)).toBe(true);
      expect(id).toMatch(/^[a-z]+-[a-z0-9]+$/);
      expect(id).toMatch(NEW_ID_PATTERN);
      expect(id).toBe(id.toLowerCase());
      expect(id).toHaveLength(prefix.length + 1 + 8);
    }
  });

  it('every registered prefix has a named generator and vice-versa', () => {
    expect(new Set(Object.values(PREFIXES))).toEqual(new Set(Object.keys(generators)));
  });

  it('generateId(prefix) matches the named generator shape', () => {
    expect(generateId('aud')).toMatch(/^aud-[a-z0-9]{8}$/);
    expect(generateId('vid')).toMatch(/^vid-[a-z0-9]{8}$/);
  });

  it('rejects an unregistered prefix instead of minting a stray one', () => {
    expect(() => generateId('xyz')).toThrow(/Unknown id prefix/);
    expect(() => generateId(undefined)).toThrow();
    expect(() => idPatternFor('xyz')).toThrow();
  });

  it('is unique across many ids', () => {
    const seen = new Set();
    for (let i = 0; i < 50000; i += 1) seen.add(generateId('job'));
    expect(seen.size).toBe(50000);
  });

  it('uses the whole alphabet (not stuck on digits or one letter)', () => {
    const chars = new Set();
    for (let i = 0; i < 2000; i += 1) for (const c of generateId('aud').slice(4)) chars.add(c);
    expect(chars.size).toBe(36);
  });
});

describe('id validation', () => {
  const valid = ['aud-btclnx2w', 'vid-x7k29pqa', 'img-m4n8cz2d', 'job-r8v3k1mx'];
  const invalid = ['AUD-BTCLNX2W', 'aud-BTCLNX2W', 'aud_BTCLNX2W', 'aud btclnx2w', 'aud-btclnx_2w', 'aud-btclnx2w!', 'aud-btCLnx2w', 'aud-btclnx2', 'aud-btclnx2wx', 'aud-', '', 'aud-btclnx2w/../x'];
  const legacy = ['aud-BTCLNX2W', 'job-FKMS1O5Y', 'img-A1B2C3D4'];

  it.each(valid)('accepts new id %s', (id) => {
    expect(ID_PATTERN.test(id)).toBe(true);
    expect(NEW_ID_PATTERN.test(id)).toBe(true);
    expect(isValidId(id)).toBe(true);
    expect(isLegacyId(id)).toBe(false);
  });

  // Not a valid *new* id. Of these, only the all-uppercase-suffix ones are
  // still accepted from callers as legacy ids (see the next block).
  it.each(invalid)('%p is not a valid new-format id', (id) => {
    expect(NEW_ID_PATTERN.test(id)).toBe(false);
  });

  const stillMalformed = invalid.filter((id) => id !== 'AUD-BTCLNX2W' && id !== 'aud-BTCLNX2W');
  it.each(stillMalformed)('%p is rejected outright (not a legacy id either)', (id) => {
    expect(ID_PATTERN.test(id)).toBe(false);
    expect(isValidId(id)).toBe(false);
  });

  it('wrong-case prefix is never accepted, legacy or not', () => {
    expect(isValidId('AUD-BTCLNX2W')).toBe(false);
    expect(isValidId('AUD-btclnx2w')).toBe(false);
  });

  it.each(legacy)('still accepts legacy uppercase id %s (but not as a "new" id)', (id) => {
    expect(ID_PATTERN.test(id)).toBe(true);
    expect(isValidId(id)).toBe(true);
    expect(isLegacyId(id)).toBe(true);
    expect(NEW_ID_PATTERN.test(id)).toBe(false);
  });

  it('prefix-scoped matching', () => {
    expect(isValidId('aud-btclnx2w', 'aud')).toBe(true);
    expect(isValidId('aud-BTCLNX2W', 'aud')).toBe(true);
    expect(isValidId('vid-btclnx2w', 'aud')).toBe(false);
    expect(isValidId(123, 'aud')).toBe(false);
    expect(isValidId(null)).toBe(false);
  });
});

describe('API validation schemas (zod)', () => {
  const ok = (schema, data) => schema.safeParse(data).success;

  it('route param schemas accept new and legacy ids of their own prefix only', () => {
    expect(ok(audioIdSchema, { id: 'aud-btclnx2w' })).toBe(true);
    expect(ok(audioIdSchema, { id: 'aud-BTCLNX2W' })).toBe(true);
    expect(ok(audioIdSchema, { id: 'img-btclnx2w' })).toBe(false);
    expect(ok(audioIdSchema, { id: 'aud-BTclnx2w' })).toBe(false);
    expect(ok(imageIdSchema, { id: 'img-m4n8cz2d' })).toBe(true);
    expect(ok(imageIdSchema, { id: 'img-M4N8CZ2D' })).toBe(true);
    expect(ok(jobIdSchema, { id: 'job-r8v3k1mx' })).toBe(true);
    expect(ok(jobIdSchema, { id: 'job-R8V3K1MX' })).toBe(true);
    expect(ok(jobIdSchema, { id: 'job-r8v3k1m!' })).toBe(false);
  });

  it('generic and array schemas', () => {
    expect(ok(idSchema, { id: 'vid-x7k29pqa' })).toBe(true);
    expect(ok(idSchema, { id: 'vid-X7K29PQA' })).toBe(true);
    expect(ok(idSchema, { id: 'vid_x7k29pqa' })).toBe(false);
    expect(ok(idArraySchema, { videoIds: ['vid-x7k29pqa', 'vid-X7K29PQA'] })).toBe(true);
    expect(ok(idArraySchema, { videoIds: [] })).toBe(false);
    expect(ok(jobIdArraySchema, { jobIds: ['job-r8v3k1mx', 'job-R8V3K1MX'] })).toBe(true);
    expect(ok(jobIdArraySchema, { jobIds: ['aud-r8v3k1mx'] })).toBe(false);
  });

  it('freshly generated ids always pass their own schema', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(ok(audioIdSchema, { id: generateAudioGenerationId() })).toBe(true);
      expect(ok(imageIdSchema, { id: generateImageGenerationId() })).toBe(true);
      expect(ok(jobIdSchema, { id: generateVideoJobId() })).toBe(true);
    }
  });

  it('socket room names accept both formats', () => {
    const { ROOM_ID_PATTERN } = require('../../src/services/common/socketService/state');
    expect(ROOM_ID_PATTERN.test('job-r8v3k1mx')).toBe(true);
    expect(ROOM_ID_PATTERN.test('job-R8V3K1MX')).toBe(true);
    expect(ROOM_ID_PATTERN.test('some arbitrary room')).toBe(false);
  });
});

// Persistence through the real Mongoose models, without a database: the _id
// default, String typing and schema validation are what MongoDB persistence
// depends on; unique/_id indexing on a String _id is format-agnostic.
describe('Mongoose models', () => {
  it('assign a lowercase string _id by default and keep it a String', () => {
    const AudioGeneration = require('../../src/models/AudioGeneration');
    const ImageGeneration = require('../../src/models/ImageGeneration');
    const VideoJob = require('../../src/models/VideoJob');
    for (const [Model, re] of [[AudioGeneration, /^aud-/], [ImageGeneration, /^img-/], [VideoJob, /^job-/]]) {
      const doc = new Model({});
      expect(typeof doc._id).toBe('string');
      expect(doc._id).toMatch(re);
      expect(doc._id).toMatch(NEW_ID_PATTERN);
      expect(Model.schema.path('_id').instance).toBe('String');
    }
  });

  it('a legacy uppercase _id is stored and cast unchanged (no case normalization)', () => {
    const AudioGeneration = require('../../src/models/AudioGeneration');
    const doc = new AudioGeneration({ _id: 'aud-BTCLNX2W' });
    expect(doc._id).toBe('aud-BTCLNX2W');
    expect(doc.toObject()._id).toBe('aud-BTCLNX2W');
    // Lowercase twin is a different document - ids are case-sensitive in Mongo.
    expect(new AudioGeneration({ _id: 'aud-btclnx2w' })._id).not.toBe(doc._id);
  });

  it('embedded scene ids get a lowercase sceneId', () => {
    const sceneSchema = require('../../src/models/schemas/sceneSchema');
    const Scene = mongoose.models.__IdTestScene || mongoose.model('__IdTestScene', sceneSchema.sceneSchema || sceneSchema);
    expect(new Scene({}).sceneId).toMatch(/^sce-[a-z0-9]{8}$/);
  });
});

// Ids end up verbatim in Redis keys and BullMQ job ids. Nothing in the shape
// can collide with their separators (":" in keys, and BullMQ rejects custom ids
// containing ":" or that are plain integers).
describe('Redis / BullMQ / storage-key safety', () => {
  it('ids contain no ":", "/", ".", whitespace or pure-integer form', () => {
    for (const gen of Object.values(generators)) {
      const id = gen();
      expect(id).not.toMatch(/[:/\\.\s]/);
      expect(/^\d+$/.test(id)).toBe(false);
    }
  });

  it('forms the documented Redis keys and MinIO object keys', () => {
    expect(`vireon:audio:${'aud-btclnx2w'}`).toMatch(/^vireon:audio:[a-z]{3}-[a-z0-9]{8}$/);
    expect(`audio/${'aud-btclnx2w'}/narration.wav`).toBe('audio/aud-btclnx2w/narration.wav');
  });

  it('MinioStorageProvider builds public URLs / keys from new and legacy ids unchanged', () => {
    jest.resetModules();
    jest.doMock('minio', () => ({
      Client: jest.fn(() => ({
        bucketExists: jest.fn().mockResolvedValue(true),
        makeBucket: jest.fn().mockResolvedValue(),
        setBucketPolicy: jest.fn().mockResolvedValue(),
        setBucketLifecycle: jest.fn().mockResolvedValue(),
        setBucketTagging: jest.fn().mockResolvedValue(),
      })),
    }));
    jest.doMock('../../src/services/common/LoggerService', () => ({
      info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), border: jest.fn(),
    }));
    const Provider = require('../../src/services/storage/providers/MinioStorageProvider');
    const provider = new Provider();
    const newUrl = provider.getPublicUrl('vid-x7k29pqa', 'render', 'final.mp4');
    expect(newUrl.endsWith('/vid-x7k29pqa/final.mp4')).toBe(true);
    expect(provider.getPublicUrl('aud-btclnx2w', 'audio-studio', 'narration.wav')).toMatch(/\/aud-btclnx2w\/audio-studio\/narration\.wav$/);
    expect(provider.getPublicUrl('aud-BTCLNX2W', 'audio-studio', 'narration.wav')).toMatch(/\/aud-BTCLNX2W\/audio-studio\/narration\.wav$/);
    expect(provider.parsePublicUrl(newUrl).key).toBe('vid-x7k29pqa/final.mp4');
    jest.dontMock('minio');
  });
});

// Real Redis + BullMQ round trip. Opt-in like the other Redis tests so a plain
// `npm test` never touches a shared Redis.
const describeRedis = process.env.RUN_REDIS_TESTS === '1' ? describe : describe.skip;
describeRedis('BullMQ with a real Redis', () => {
  it('accepts a generated id as a custom job id and as a Redis key', async () => {
    const { Queue } = require('bullmq');
    const IORedis = require('ioredis');
    const connection = { host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT) || 6379 };
    const queue = new Queue(`vireon-test-ids-${process.pid}-${Date.now()}`, { connection });
    const redis = new IORedis(connection);
    try {
      const jobId = generateVideoJobId();
      const job = await queue.add('render-video', { jobId }, { jobId });
      expect(job.id).toBe(jobId);
      expect((await queue.getJob(jobId)).data.jobId).toBe(jobId);

      const key = `vireon:test:job:${jobId}`;
      await redis.set(key, '1', 'EX', 30);
      expect(await redis.get(key)).toBe('1');
      // Keys are case-sensitive: the legacy uppercase twin is a different key.
      expect(await redis.get(`vireon:test:job:${jobId.toUpperCase()}`)).toBeNull();
      await redis.del(key);
    } finally {
      await queue.obliterate({ force: true }).catch(() => {});
      await queue.close();
      redis.disconnect();
    }
  });
});
