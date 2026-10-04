jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(),
}));
jest.mock('../../src/services/common/MetricsService', () => ({ recordDuration: jest.fn(), increment: jest.fn() }));
jest.mock('../../src/services/common/CacheService', () => ({
  hashInputs: jest.fn((inputs) => `hash:${JSON.stringify(inputs).length}:${inputs.prompt}:${inputs.width}x${inputs.height}`.padEnd(40, '0')),
  getImage: jest.fn(),
  putImage: jest.fn(),
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
const LocalAIService = require('../../src/services/localAI');
const ComfyUIClient = require('../../src/services/image/ComfyUIClient');
const ImageGenerationService = require('../../src/services/image/ImageGenerationService');

const original = { ...config.imageGen };
let client;

beforeEach(() => {
  // Pin the checkpoint workflow these tests are written against: the real
  // IMAGE_WORKFLOW_PATH comes from the machine's .env (Qwen-Image today).
  Object.assign(config.imageGen, original, {
    checkpoint: 'model.safetensors',
    workflowPath: path.resolve(__dirname, '../../workflows/txt2img.api.json'),
  });
  jest.clearAllMocks();
  jest.spyOn(fs.promises, 'mkdir').mockResolvedValue();
  jest.spyOn(fs.promises, 'writeFile').mockResolvedValue();

  client = {
    queue: jest.fn().mockResolvedValue('prompt-1'),
    waitForResult: jest.fn().mockResolvedValue({ outputs: { 9: { images: [{ filename: 'o.png', subfolder: '', type: 'output' }] } } }),
    download: jest.fn().mockResolvedValue(Buffer.from('png-bytes')),
  };
  ComfyUIClient.mockImplementation(() => client);
  CacheService.getImage.mockResolvedValue(null);
});

afterEach(() => jest.restoreAllMocks());
afterAll(() => Object.assign(config.imageGen, original));

describe('sizeFor', () => {
  it('picks the native size by orientation', () => {
    expect(ImageGenerationService.sizeFor('16:9')).toEqual({ width: 1024, height: 576 });
    expect(ImageGenerationService.sizeFor('9:16')).toEqual({ width: 576, height: 1024 });
    expect(ImageGenerationService.sizeFor('1:1')).toEqual({ width: 768, height: 768 });
    expect(ImageGenerationService.sizeFor('4:5')).toEqual({ width: 576, height: 1024 });
  });

  it('defaults to landscape for anything unparseable', () => {
    expect(ImageGenerationService.sizeFor(undefined)).toEqual({ width: 1024, height: 576 });
    expect(ImageGenerationService.sizeFor('garbage')).toEqual({ width: 1024, height: 576 });
  });
});

describe('seedFor', () => {
  it('is stable for a prompt and different between prompts', () => {
    expect(ImageGenerationService.seedFor('a cat')).toBe(ImageGenerationService.seedFor('a cat'));
    expect(ImageGenerationService.seedFor('a cat')).not.toBe(ImageGenerationService.seedFor('a dog'));
  });

  it('fits in a safe integer (ComfyUI parses the seed as a number)', () => {
    expect(Number.isSafeInteger(ImageGenerationService.seedFor('anything'))).toBe(true);
  });
});

describe('generate', () => {
  it('serves a cache hit without touching ComfyUI', async () => {
    CacheService.getImage.mockResolvedValue({ width: 1024, height: 576 });
    const result = await ImageGenerationService.generate({ jobId: 'job-1', prompt: 'a cat', aspectRatio: '16:9' });

    expect(result).toMatchObject({ fromCache: true, durationMs: 0 });
    expect(result.url).toMatch(/^http:\/\/minio\/job-1\/image\/img-/);
    expect(ComfyUIClient).not.toHaveBeenCalled();
    expect(LocalAIService.comfyUI.ensureRunning).not.toHaveBeenCalled();
  });

  it('generates, uploads and caches on a miss', async () => {
    const result = await ImageGenerationService.generate({ jobId: 'job-1', prompt: 'a cat', aspectRatio: '16:9' });

    expect(LocalAIService.comfyUI.ensureRunning).toHaveBeenCalled();
    const [graph] = client.queue.mock.calls[0];
    expect(graph['6'].inputs.text).toBe('a cat');
    expect(graph['4'].inputs.ckpt_name).toBe('model.safetensors');
    expect(graph['5'].inputs).toMatchObject({ width: 1024, height: 576 });
    expect(typeof graph['3'].inputs.seed).toBe('number');

    expect(fs.promises.writeFile).toHaveBeenCalledWith(expect.stringMatching(/img-.*\.png$/), Buffer.from('png-bytes'));
    expect(mockProvider.uploadFile).toHaveBeenCalledWith('job-1', expect.stringMatching(/img-.*\.png$/), 'image', expect.objectContaining({ cacheKey: expect.any(String) }));
    expect(CacheService.putImage).toHaveBeenCalled();
    expect(result).toMatchObject({ fromCache: false, url: 'http://minio/job-1/image/uploaded.png' });
  });

  it('uses a portrait size for a vertical video', async () => {
    await ImageGenerationService.generate({ jobId: 'job-1', prompt: 'a cat', aspectRatio: '9:16' });
    expect(client.queue.mock.calls[0][0]['5'].inputs).toMatchObject({ width: 576, height: 1024 });
  });

  it('keys the cache on the settings that change the picture', async () => {
    await ImageGenerationService.generate({ jobId: 'j', prompt: 'a cat', aspectRatio: '16:9' });
    await ImageGenerationService.generate({ jobId: 'j', prompt: 'a cat', aspectRatio: '9:16' });
    const keys = require('../../src/services/common/CacheService').hashInputs.mock.calls.map(([i]) => i);
    expect(keys[0]).toMatchObject({ prompt: 'a cat', width: 1024, checkpoint: 'model.safetensors' });
    expect(keys[0].workflow).toMatch(/^[0-9a-f]{64}$/);
    expect(keys[0].width).not.toBe(keys[1].width);
  });

  it('uses a caller-chosen step count and keys the cache on it', async () => {
    const hashInputs = require('../../src/services/common/CacheService').hashInputs;
    hashInputs.mockClear();
    await ImageGenerationService.generate({ jobId: 'j', prompt: 'a cat', aspectRatio: '16:9' });
    await ImageGenerationService.generate({ jobId: 'j', prompt: 'a cat', aspectRatio: '16:9', steps: 15 });
    const [normal, fast] = hashInputs.mock.calls.map(([i]) => i);
    expect(normal.steps).toBe(config.imageGen.steps);
    expect(fast.steps).toBe(15);
    expect(client.queue.mock.calls[1][0]['3'].inputs.steps).toBe(15);
  });

  it('refuses to run without a checkpoint, as a non-retryable configuration error', async () => {
    config.imageGen.checkpoint = '';
    await expect(ImageGenerationService.generate({ jobId: 'j', prompt: 'p', aspectRatio: '16:9' }))
      .rejects.toMatchObject({ permanent: true, message: expect.stringContaining('COMFYUI_CHECKPOINT') });
    expect(ComfyUIClient).not.toHaveBeenCalled();
  });

  it('reports a missing workflow file as a configuration error', async () => {
    config.imageGen.workflowPath = '/definitely/not/here.json';
    await expect(ImageGenerationService.generate({ jobId: 'j', prompt: 'p', aspectRatio: '16:9' }))
      .rejects.toMatchObject({ permanent: true, message: expect.stringContaining('workflow not found') });
  });

  it('explains a workflow that produced no image', async () => {
    client.waitForResult.mockResolvedValue({ outputs: {} });
    await expect(ImageGenerationService.generate({ jobId: 'j', prompt: 'p', aspectRatio: '16:9' })).rejects.toThrow(/SaveImage/);
  });

  it('passes the abort signal through so a Stop interrupts the render', async () => {
    const controller = new AbortController();
    await ImageGenerationService.generate({ jobId: 'j', prompt: 'p', aspectRatio: '16:9', signal: controller.signal });
    expect(client.waitForResult).toHaveBeenCalledWith('prompt-1', expect.objectContaining({ signal: controller.signal }));
  });
});
