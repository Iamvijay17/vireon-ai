jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), border: jest.fn(),
}));
jest.mock('../../src/models/VideoJob', () => ({ findById: jest.fn(), find: jest.fn() }));
jest.mock('../../src/models/CourseVideo', () => ({ findById: jest.fn(), find: jest.fn() }));
jest.mock('../../src/models/Course', () => ({ findById: jest.fn(), find: jest.fn() }));
jest.mock('../../src/models/ImageGeneration', () => ({ findById: jest.fn(), find: jest.fn() }));
jest.mock('../../src/services/audio/pipeline/ffmpeg', () => ({ isAvailable: jest.fn(), runFfmpeg: jest.fn() }));

const fs = require('fs');
const { Readable } = require('stream');
const VideoJob = require('../../src/models/VideoJob');
const CourseVideo = require('../../src/models/CourseVideo');
const Course = require('../../src/models/Course');
const ImageGeneration = require('../../src/models/ImageGeneration');
const ffmpeg = require('../../src/services/audio/pipeline/ffmpeg');
const MediaSources = require('../../src/services/social/mediaSources');
const { exportAsJpeg } = require('../../src/services/social/imageExport');
const { storageFake } = require('./helpers/platforms');

const lean = (value) => ({ lean: async () => value });
const chain = (rows) => ({ sort: () => ({ limit: () => ({ lean: async () => rows }) }) });

const PNG_URL = 'http://127.0.0.1:9000/vireon-video/img-1/images/img-abc.png';
const record = (over = {}) => ({
  _id: 'img-aaaaaaaa', prompt: 'A lighthouse at dusk, oil painting\nsecond line', aspectRatio: '1:1', width: 1024, height: 1024,
  status: 'COMPLETED', imageUrl: PNG_URL, fileName: 'img-abc.png', createdAt: new Date('2026-10-10T10:00:00Z'), ...over,
});

beforeEach(() => jest.clearAllMocks());

describe('MediaSources: Image Studio pictures', () => {
  const storage = () => storageFake({ 'vireon-video/img-1/images/img-abc.png': { size: 700000, etag: 'e1' } });

  it('resolves a finished picture to its stored file, its size from the record and the prompt as caption context', async () => {
    ImageGeneration.findById.mockReturnValue(lean(record()));
    const out = await new MediaSources({ storage: storage() }).resolve({ imageGenerationId: 'img-aaaaaaaa' });
    expect(out.media).toMatchObject({ kind: 'image', bucket: 'vireon-video', key: 'img-1/images/img-abc.png', size: 700000, contentType: 'image/png', width: 1024, height: 1024, measured: 'record' });
    expect(out.thumbnail).toEqual(out.media);
    expect(out.title).toBe('A lighthouse at dusk, oil painting');
    expect(out.source).toMatchObject({ imageGenerationId: 'img-aaaaaaaa', videoJobId: null, courseVideoId: null });
    expect(out.excerpt).toContain('A lighthouse');
  });

  it('refuses a picture that does not exist, is still generating, or whose file is gone', async () => {
    const sources = new MediaSources({ storage: storage() });
    ImageGeneration.findById.mockReturnValue(lean(null));
    await expect(sources.resolve({ imageGenerationId: 'img-aaaaaaaa' })).rejects.toMatchObject({ status: 404 });
    ImageGeneration.findById.mockReturnValue(lean(record({ status: 'PENDING', imageUrl: null })));
    await expect(sources.resolve({ imageGenerationId: 'img-aaaaaaaa' })).rejects.toThrow(/not finished/);
    ImageGeneration.findById.mockReturnValue(lean(record()));
    await expect(new MediaSources({ storage: storageFake({}) }).resolve({ imageGenerationId: 'img-aaaaaaaa' })).rejects.toThrow(/missing from storage/);
  });

  it('lists finished pictures next to videos and lessons', async () => {
    VideoJob.find.mockReturnValue(chain([]));
    CourseVideo.find.mockReturnValue(chain([]));
    Course.find.mockReturnValue(lean([]));
    ImageGeneration.find.mockReturnValue(chain([record()]));
    const lib = await new MediaSources({ storage: storage() }).library();
    expect(ImageGeneration.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'COMPLETED' }));
    expect(lib.images).toEqual([expect.objectContaining({ kind: 'image', imageGenerationId: 'img-aaaaaaaa', aspectRatio: '1:1', width: 1024, thumbnailUrl: PNG_URL, title: 'A lighthouse at dusk, oil painting' })]);
  });
});

describe('exportAsJpeg', () => {
  const jpegHead = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14), Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0xe8, 0x07, 0xd0, 0x03]), Buffer.alloc(100)]);
  const source = { bucket: 'vireon-video', key: 'img-1/images/img-abc.png', width: 2000, height: 1000 };
  let storage;
  const run = (over = {}) => exportAsJpeg({ storage, source, destBucket: 'vireon-video', destKey: 'social/local/cam-1/x.jpg', maxBytes: 1000, fileName: 'pic.jpg', ...over });

  beforeEach(() => {
    storage = {
      ...storageFake({ 'vireon-video/social/local/cam-1/x.jpg': { size: 800, etag: 'jpg-etag' } }),
      getObjectStream: jest.fn(async () => Readable.from([Buffer.from('png-bytes')])),
    };
    ffmpeg.isAvailable.mockResolvedValue(true);
  });

  it('re-encodes the PNG to a JPEG copy that belongs to the promotion', async () => {
    let written = [];
    ffmpeg.runFfmpeg.mockImplementation(async (args) => { const out = args[args.length - 1]; fs.writeFileSync(out, jpegHead); written.push(out); });
    storage.putObjectFile.mockImplementation(async (b, k) => ({ bucket: b, key: k, size: 800 }));
    const media = await run({ maxBytes: 100000 });
    expect(ffmpeg.runFfmpeg).toHaveBeenCalledTimes(1);
    expect(storage.putObjectFile).toHaveBeenCalledWith('vireon-video', 'social/local/cam-1/x.jpg', expect.any(String), 'image/jpeg');
    expect(media).toMatchObject({ kind: 'image', key: 'social/local/cam-1/x.jpg', contentType: 'image/jpeg', size: 800, etag: 'jpg-etag', width: 2000, height: 1000, measured: 'file', fileName: 'pic.jpg' });
    expect(written.every((f) => !fs.existsSync(f))).toBe(true); // temp files are cleaned up
  });

  it('retries smaller (and then shrunk) until it fits the platform cap, and gives up if nothing does', async () => {
    ffmpeg.runFfmpeg.mockImplementation(async (args) => { fs.writeFileSync(args[args.length - 1], Buffer.concat([jpegHead, Buffer.alloc(5000)])); });
    expect(await run({ maxBytes: 1000 })).toBeNull();
    expect(ffmpeg.runFfmpeg).toHaveBeenCalledTimes(3);
    expect(ffmpeg.runFfmpeg.mock.calls[2][0]).toContain('-vf');
    expect(storage.putObjectFile).not.toHaveBeenCalled();
  });

  it('returns null (caller keeps the PNG) when ffmpeg is missing or fails', async () => {
    ffmpeg.isAvailable.mockResolvedValue(false);
    expect(await run()).toBeNull();
    expect(storage.getObjectStream).not.toHaveBeenCalled();
    ffmpeg.isAvailable.mockResolvedValue(true);
    ffmpeg.runFfmpeg.mockRejectedValue(new Error('boom'));
    expect(await run()).toBeNull();
  });
});
