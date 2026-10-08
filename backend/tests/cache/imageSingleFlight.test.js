/**
 * The same picture asked for twice at once is drawn once: the second request waits for the
 * first and reads what it stored. This drives the real ImageGenerationService and real
 * GenerationCoordinator over a fake cache and a fake ComfyUI.
 */
jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(),
}));
jest.mock('../../src/services/common/MetricsService', () => ({ recordDuration: jest.fn(), increment: jest.fn() }));

// A cache whose putImage makes the next getImage hit, like the real thing.
const mockCache = { stored: new Set() };
jest.mock('../../src/services/common/CacheService', () => ({
  hashInputs: jest.fn(),
  getImage: jest.fn(async (hash) => (mockCache.stored.has(hash) ? { width: 1024 } : null)),
  putImage: jest.fn(async (hash) => { mockCache.stored.add(hash); }),
}));
const mockProvider = {
  getPublicUrl: jest.fn((id, category, file) => `http://minio/${id}/${category}/${file}`),
  uploadFile: jest.fn(async (id, _path, category) => `http://minio/${id}/${category}/uploaded.png`),
};
jest.mock('../../src/services/storage/providers', () => ({ getStorageProvider: () => mockProvider }));
jest.mock('../../src/services/localAI', () => ({ comfyUI: { ensureRunning: jest.fn().mockResolvedValue(true) } }));
jest.mock('../../src/services/image/ComfyUIClient');

const fs = require('fs');
const path = require('path');
const config = require('../../src/config');
const CacheService = require('../../src/services/common/CacheService');
const ComfyUIClient = require('../../src/services/image/ComfyUIClient');
const ImageGenerationService = require('../../src/services/image/ImageGenerationService');
const { resetCoordinator } = require('../../src/services/cache/GenerationCoordinator');

const original = { ...config.imageGen };
let client;

beforeEach(() => {
  Object.assign(config.imageGen, original, {
    checkpoint: 'model.safetensors',
    workflowPath: path.resolve(__dirname, '../../workflows/txt2img.api.json'),
  });
  jest.clearAllMocks();
  mockCache.stored.clear();
  resetCoordinator();
  jest.spyOn(fs.promises, 'mkdir').mockResolvedValue();
  jest.spyOn(fs.promises, 'writeFile').mockResolvedValue();

  client = {
    queue: jest.fn().mockResolvedValue('prompt-1'),
    // a render takes real time, so a second request can arrive while it runs
    waitForResult: jest.fn(() => new Promise((resolve) => setTimeout(() => resolve({ outputs: { 9: { images: [{ filename: 'o.png', subfolder: '', type: 'output' }] } } }), 60))),
    download: jest.fn().mockResolvedValue(Buffer.from('png-bytes')),
  };
  ComfyUIClient.mockImplementation(() => client);
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => Object.assign(config.imageGen, original));

const request = (over = {}) => ({ jobId: 'job-1', prompt: 'a lighthouse at dusk', aspectRatio: '16:9', ...over });

describe('the same picture requested at once', () => {
  it('is drawn once; the second request reuses it', async () => {
    const [a, b] = await Promise.all([
      ImageGenerationService.generate(request({ jobId: 'job-1' })),
      ImageGenerationService.generate(request({ jobId: 'job-2' })),
    ]);

    expect(client.queue).toHaveBeenCalledTimes(1);
    expect(a.fromCache).toBe(false);
    expect(b.fromCache).toBe(true);
    // the follower gets a URL in ITS OWN job, not the leader's
    expect(b.url).toBe('http://minio/job-2/image/' + b.fileName);
    expect(a.cacheKey).toBe(b.cacheKey);
    expect(CacheService.putImage).toHaveBeenCalledTimes(1);
  });

  it('a burst of ten identical requests still draws one picture', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => ImageGenerationService.generate(request({ jobId: `job-${i}` }))));
    expect(client.queue).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => !r.fromCache)).toHaveLength(1);
  });

  it('different pictures are drawn separately', async () => {
    await Promise.all([
      ImageGenerationService.generate(request({ prompt: 'a lighthouse' })),
      ImageGenerationService.generate(request({ prompt: 'a harbour' })),
    ]);
    expect(client.queue).toHaveBeenCalledTimes(2);
  });

  it('a re-roll (new variant) is a different picture even with the same prompt', async () => {
    await Promise.all([
      ImageGenerationService.generate(request()),
      ImageGenerationService.generate(request({ variant: 1 })),
    ]);
    expect(client.queue).toHaveBeenCalledTimes(2);
  });

  it('a request after the first has finished is a plain cache hit, with no render', async () => {
    await ImageGenerationService.generate(request());
    client.queue.mockClear();
    const again = await ImageGenerationService.generate(request({ jobId: 'job-9' }));
    expect(again.fromCache).toBe(true);
    expect(client.queue).not.toHaveBeenCalled();
  });

  it('if the render fails for whoever leads, the other request draws it itself instead of failing too', async () => {
    client.waitForResult
      .mockImplementationOnce(() => new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('ComfyUI crashed'), { permanent: true })), 30)));

    // Whichever request reaches the cache first leads (and gets the failing render); the other must not inherit its failure.
    const results = await Promise.allSettled([
      ImageGenerationService.generate(request({ jobId: 'job-1' })),
      ImageGenerationService.generate(request({ jobId: 'job-2' })),
    ]);

    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const ok = results.find((r) => r.status === 'fulfilled');
    expect(ok.value.fromCache).toBe(false);
    expect(client.queue).toHaveBeenCalledTimes(2);
  });
});
