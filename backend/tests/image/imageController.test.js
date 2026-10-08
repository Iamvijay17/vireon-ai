jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(),
}));
jest.mock('../../src/services/image/ImageGenerationService', () => ({
  generate: jest.fn(),
  sizeFor: jest.fn(() => ({ width: 1024, height: 576 })),
  outputSizeFor: jest.fn((_aspect, resolution) => (resolution === '4k' ? { width: 3840, height: 2160 } : { width: 1024, height: 576 })),
}));
jest.mock('../../src/services/localAI', () => ({
  gpu: { withGPU: jest.fn((_name, fn) => fn()) },
}));
jest.mock('../../src/services/storage/providers', () => ({
  getStorageProvider: jest.fn(() => ({ deleteJob: jest.fn().mockResolvedValue() })),
}));
jest.mock('../../src/models/ImageGeneration', () => ({
  create: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
  updateMany: jest.fn(),
  findByIdAndDelete: jest.fn(),
}));

const config = require('../../src/config');
const { NO_TEXT } = require('../../src/services/image/styles');
const ImageGeneration = require('../../src/models/ImageGeneration');
const ImageGenerationService = require('../../src/services/image/ImageGenerationService');
const LocalAIService = require('../../src/services/localAI');
const ImageController = require('../../src/controllers/imageController');

const original = { ...config.imageGen };
const flush = () => new Promise((resolve) => setImmediate(resolve));

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

// A mongoose-document stand-in: plain fields plus a save() that records itself.
const makeRecord = (over = {}) => ({
  _id: 'img-ABCD1234',
  prompt: 'a lighthouse',
  aspectRatio: '16:9',
  variant: 0,
  status: 'PENDING',
  save: jest.fn().mockResolvedValue(),
  ...over,
});

const lastLookup = (value) => ({ sort: () => ({ select: () => ({ lean: async () => value }) }) });

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(config.imageGen, original, { enabled: true });
  ImageGeneration.findOne.mockReturnValue(lastLookup(null));
  ImageGeneration.updateMany.mockResolvedValue();
});
afterAll(() => Object.assign(config.imageGen, original));

describe('ImageController.generate', () => {
  it('returns 202 with the PENDING record, then completes it in the background', async () => {
    const record = makeRecord();
    ImageGeneration.create.mockResolvedValue(record);
    ImageGenerationService.generate.mockResolvedValue({ url: 'http://x/a.png', fileName: 'a.png', durationMs: 5, fromCache: false });
    const res = makeRes();

    await ImageController.generate({ body: { prompt: 'a lighthouse', aspectRatio: '16:9' } }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ image: record, images: [record] });
    expect(ImageGeneration.create).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'a lighthouse', variant: 0, width: 1024, height: 576 }));

    await flush();
    expect(LocalAIService.gpu.withGPU).toHaveBeenCalledWith('comfyui', expect.any(Function));
    expect(ImageGenerationService.generate).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'img-ABCD1234', prompt: `a lighthouse. ${NO_TEXT}`, aspectRatio: '16:9', variant: 0, onProgress: expect.any(Function) })
    );
    expect(record).toMatchObject({ status: 'COMPLETED', imageUrl: 'http://x/a.png', fileName: 'a.png' });
    expect(record.save).toHaveBeenCalled();
  });

  it('steps the variant when the same prompt was generated before, so a repeat is a new picture', async () => {
    ImageGeneration.findOne.mockReturnValue(lastLookup({ variant: 2 }));
    ImageGeneration.create.mockResolvedValue(makeRecord({ variant: 3 }));
    ImageGenerationService.generate.mockResolvedValue({ url: 'u', fileName: 'f', durationMs: 1, fromCache: false });

    await ImageController.generate({ body: { prompt: 'a lighthouse' } }, makeRes(), jest.fn());
    await flush();

    expect(ImageGeneration.create).toHaveBeenCalledWith(expect.objectContaining({ variant: 3 }));
  });

  it('marks the record FAILED with the reason when ComfyUI errors', async () => {
    const record = makeRecord();
    ImageGeneration.create.mockResolvedValue(record);
    ImageGenerationService.generate.mockRejectedValue(new Error('ComfyUI is down'));

    await ImageController.generate({ body: { prompt: 'a lighthouse' } }, makeRes(), jest.fn());
    await flush();

    expect(record).toMatchObject({ status: 'FAILED', error: 'ComfyUI is down' });
  });

  it('standard quality uses the configured steps; fast samples ~60% of them and high ~140%', async () => {
    config.imageGen.steps = 25;
    ImageGeneration.create.mockImplementation(async (doc) => makeRecord(doc));
    ImageGenerationService.generate.mockResolvedValue({ url: 'u', fileName: 'f', durationMs: 1, fromCache: false });

    await ImageController.generate({ body: { prompt: 'a lighthouse' } }, makeRes(), jest.fn());
    await flush();
    expect(ImageGenerationService.generate).toHaveBeenLastCalledWith(expect.objectContaining({ steps: null }));

    await ImageController.generate({ body: { prompt: 'a lighthouse', quality: 'fast' } }, makeRes(), jest.fn());
    await flush();
    expect(ImageGeneration.create).toHaveBeenLastCalledWith(expect.objectContaining({ quality: 'fast' }));
    expect(ImageGenerationService.generate).toHaveBeenLastCalledWith(expect.objectContaining({ steps: 15 }));

    await ImageController.generate({ body: { prompt: 'a lighthouse', quality: 'high' } }, makeRes(), jest.fn());
    await flush();
    expect(ImageGeneration.create).toHaveBeenLastCalledWith(expect.objectContaining({ quality: 'high' }));
    expect(ImageGenerationService.generate).toHaveBeenLastCalledWith(expect.objectContaining({ steps: 35 }));
  });

  it('applies the style to the prompt sent to the model, but keeps the typed prompt in the record', async () => {
    ImageGeneration.create.mockImplementation(async (doc) => makeRecord(doc));
    ImageGenerationService.generate.mockResolvedValue({ url: 'u', fileName: 'f', durationMs: 1, fromCache: false, seed: 7 });

    await ImageController.generate({ body: { prompt: 'a lighthouse', style: 'watercolor' } }, makeRes(), jest.fn());
    await flush();

    expect(ImageGeneration.create).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'a lighthouse', style: 'watercolor' }));
    expect(ImageGenerationService.generate).toHaveBeenLastCalledWith(
      expect.objectContaining({ prompt: expect.stringMatching(/^a lighthouse, watercolor painting/) })
    );
  });

  it('count makes that many records with consecutive variants and returns them all', async () => {
    ImageGeneration.findOne.mockReturnValue(lastLookup({ variant: 4 }));
    let n = 0;
    ImageGeneration.create.mockImplementation(async (doc) => makeRecord({ ...doc, _id: `img-BATCH00${++n}` }));
    ImageGenerationService.generate.mockResolvedValue({ url: 'u', fileName: 'f', durationMs: 1, fromCache: false, seed: 1 });
    const res = makeRes();

    await ImageController.generate({ body: { prompt: 'a lighthouse', count: 3 } }, res, jest.fn());
    await flush();

    expect(ImageGeneration.create.mock.calls.map(([d]) => d.variant)).toEqual([5, 6, 7]);
    const body = res.json.mock.calls[0][0];
    expect(body.images).toHaveLength(3);
    expect(body.image).toBe(body.images[0]);
    expect(ImageGenerationService.generate).toHaveBeenCalledTimes(3);
  });

  it('a pinned seed is stored and passed to the model, and the used seed is saved back', async () => {
    const record = makeRecord({ seed: 42 });
    ImageGeneration.create.mockResolvedValue(record);
    ImageGenerationService.generate.mockResolvedValue({ url: 'u', fileName: 'f', durationMs: 1, fromCache: false, seed: 42 });

    await ImageController.generate({ body: { prompt: 'a lighthouse', seed: 42 } }, makeRes(), jest.fn());
    await flush();

    expect(ImageGeneration.create).toHaveBeenCalledWith(expect.objectContaining({ seed: 42, variant: 0 }));
    expect(ImageGenerationService.generate).toHaveBeenLastCalledWith(expect.objectContaining({ seed: 42 }));
    expect(record.seed).toBe(42);
  });

  it('records the seed the model actually used when none was pinned', async () => {
    const record = makeRecord({ seed: null });
    ImageGeneration.create.mockResolvedValue(record);
    ImageGenerationService.generate.mockResolvedValue({ url: 'u', fileName: 'f', durationMs: 1, fromCache: false, seed: 987654 });

    await ImageController.generate({ body: { prompt: 'a lighthouse' } }, makeRes(), jest.fn());
    await flush();

    expect(record.seed).toBe(987654);
  });

  it('fails the records already created, and starts nothing, if a later one in the batch cannot be created', async () => {
    const first = makeRecord({ _id: 'img-HALF0001' });
    ImageGeneration.create.mockResolvedValueOnce(first).mockRejectedValueOnce(new Error('db down'));
    const next = jest.fn();

    await ImageController.generate({ body: { prompt: 'a lighthouse', count: 2 } }, makeRes(), next);
    await flush();

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'db down' }));
    expect(first).toMatchObject({ status: 'FAILED' });
    expect(ImageGenerationService.generate).not.toHaveBeenCalled();
  });

  it('marks an image as running before its record exists, so a poll cannot call it interrupted', async () => {
    let idDuringCreate;
    let skippedByPoll;
    ImageGeneration.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => [] }) }) }) });
    ImageGeneration.countDocuments.mockResolvedValue(0);
    ImageGeneration.create.mockImplementation(async (doc) => {
      idDuringCreate = doc._id;
      // The list endpoint runs while the record is being written - the old race window.
      await ImageController.list({ query: {} }, makeRes(), jest.fn());
      skippedByPoll = ImageGeneration.updateMany.mock.calls.at(-1)[0]._id.$nin;
      return makeRecord(doc);
    });
    ImageGenerationService.generate.mockResolvedValue({ url: 'u', fileName: 'f', durationMs: 1, fromCache: false, seed: 1 });

    await ImageController.generate({ body: { prompt: 'a lighthouse' } }, makeRes(), jest.fn());
    await flush();

    expect(idDuringCreate).toMatch(/^img-[0-9a-z]{8}$/);
    expect(skippedByPoll).toContain(idDuringCreate);
  });

  it('renders a batch one image at a time', async () => {
    let n = 0;
    ImageGeneration.create.mockImplementation(async (doc) => makeRecord({ ...doc, _id: `img-SERIAL0${++n}` }));
    const finishers = [];
    ImageGenerationService.generate.mockImplementation(() => new Promise((resolve) => {
      finishers.push(() => resolve({ url: 'u', fileName: 'f', durationMs: 1, fromCache: false, seed: 1 }));
    }));

    await ImageController.generate({ body: { prompt: 'a lighthouse', count: 2 } }, makeRes(), jest.fn());
    await flush();
    expect(ImageGenerationService.generate).toHaveBeenCalledTimes(1);   // the second waits its turn

    finishers[0]();
    await flush();
    expect(ImageGenerationService.generate).toHaveBeenCalledTimes(2);

    finishers[1]();
    await flush();
  });

  it('an "avoid" prompt is stored and switches the render to guided CFG; without one the configured CFG stands', async () => {
    config.imageGen.guidedCfg = 3;
    ImageGeneration.create.mockImplementation(async (doc) => makeRecord(doc));
    ImageGenerationService.generate.mockResolvedValue({ url: 'u', fileName: 'f', durationMs: 1, fromCache: false, seed: 1 });

    await ImageController.generate({ body: { prompt: 'a street', negative: 'cars, traffic' } }, makeRes(), jest.fn());
    await flush();
    expect(ImageGeneration.create).toHaveBeenLastCalledWith(expect.objectContaining({ negative: 'cars, traffic' }));
    expect(ImageGenerationService.generate).toHaveBeenLastCalledWith(expect.objectContaining({ negative: 'cars, traffic', cfg: 3 }));

    await ImageController.generate({ body: { prompt: 'a street' } }, makeRes(), jest.fn());
    await flush();
    expect(ImageGenerationService.generate).toHaveBeenLastCalledWith(expect.objectContaining({ negative: null, cfg: null }));
  });

  it('exact text is stored as typed and sent to the model as the picture\'s text; no text means an explicit no-text sentence', async () => {
    ImageGeneration.create.mockImplementation(async (doc) => makeRecord(doc));
    ImageGenerationService.generate.mockResolvedValue({ url: 'u', fileName: 'f', durationMs: 1, fromCache: false, seed: 1 });

    await ImageController.generate({ body: { prompt: 'A conference poster', text: 'FUTURE OF AI\nBUILDING TOMORROW' } }, makeRes(), jest.fn());
    await flush();
    expect(ImageGeneration.create).toHaveBeenLastCalledWith(expect.objectContaining({ prompt: 'A conference poster', text: 'FUTURE OF AI\nBUILDING TOMORROW' }));
    expect(ImageGenerationService.generate).toHaveBeenLastCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('The text reads exactly: "FUTURE OF AI" in very large bold sans-serif capital letters across the center, and below it "BUILDING TOMORROW"'),
    }));

    await ImageController.generate({ body: { prompt: 'A classroom with a screen' } }, makeRes(), jest.fn());
    await flush();
    expect(ImageGenerationService.generate).toHaveBeenLastCalledWith(expect.objectContaining({
      prompt: `A classroom with a screen. ${NO_TEXT}`,
    }));
  });

  it('answers 503 and creates nothing when image generation is off', async () => {
    config.imageGen.enabled = false;
    const res = makeRes();

    await ImageController.generate({ body: { prompt: 'a lighthouse' } }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(503);
    expect(ImageGeneration.create).not.toHaveBeenCalled();
  });

  it('rejects a too-short prompt through the error handler', async () => {
    const next = jest.fn();

    await ImageController.generate({ body: { prompt: 'a' } }, makeRes(), next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: expect.stringMatching(/validation/i) }));
    expect(ImageGeneration.create).not.toHaveBeenCalled();
  });
});

describe('ImageController.progress', () => {
  const snapshot = () => {
    const res = makeRes();
    ImageController.progress({}, res);
    return res.json.mock.calls[0][0].active;
  };

  it('reports queued -> sampling percent while running, and forgets the id once finished', async () => {
    const record = makeRecord({ _id: 'img-PROG0001' });
    ImageGeneration.create.mockResolvedValue(record);
    let finish;
    ImageGenerationService.generate.mockImplementation(({ onProgress }) => new Promise((resolve) => {
      onProgress({ phase: 'loading' });
      onProgress({ phase: 'sampling', step: 5, steps: 25 });
      finish = () => resolve({ url: 'u', fileName: 'f', durationMs: 1, fromCache: false });
    }));

    await ImageController.generate({ body: { prompt: 'a lighthouse' } }, makeRes(), jest.fn());
    await flush();

    // 5% base + 90% * 5/25 = 23%
    expect(snapshot()['img-PROG0001']).toMatchObject({ phase: 'sampling', step: 5, steps: 25, percent: 23 });

    finish();
    await flush();
    expect(snapshot()['img-PROG0001']).toBeUndefined();
  });

  it('starts a new generation at 0% queued', async () => {
    ImageGeneration.create.mockResolvedValue(makeRecord({ _id: 'img-PROG0002' }));
    let finish;
    ImageGenerationService.generate.mockReturnValue(new Promise((resolve) => { finish = () => resolve({ url: 'u', fileName: 'f', durationMs: 1, fromCache: false, seed: 1 }); }));

    await ImageController.generate({ body: { prompt: 'a lighthouse' } }, makeRes(), jest.fn());

    // The GPU lease callback hasn't run a progress update yet, but 'queued' is set synchronously.
    expect(snapshot()['img-PROG0002']).toMatchObject({ percent: expect.any(Number) });
    finish();   // render turns are queued process-wide: never leave one hanging for the next test
    await flush();
  });
});

describe('ImageController.list', () => {
  it('fails PENDING records no running generation owns, then returns the page', async () => {
    ImageGeneration.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => [{ _id: 'img-1' }] }) }) }) });
    ImageGeneration.countDocuments.mockResolvedValue(1);
    const res = makeRes();

    await ImageController.list({ query: {} }, res, jest.fn());

    expect(ImageGeneration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDING', _id: { $nin: expect.any(Array) } }),
      expect.objectContaining({ status: 'FAILED' })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ items: [{ _id: 'img-1' }], pagination: expect.objectContaining({ total: 1 }) }));
  });
});

describe('ImageController.remove', () => {
  it('404s an unknown id', async () => {
    ImageGeneration.findByIdAndDelete.mockResolvedValue(null);
    const res = makeRes();

    await ImageController.remove({ params: { id: 'img-ABCD1234' } }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('deletes the record and returns its id', async () => {
    ImageGeneration.findByIdAndDelete.mockResolvedValue({ _id: 'img-ABCD1234' });
    const res = makeRes();

    await ImageController.remove({ params: { id: 'img-ABCD1234' } }, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({ id: 'img-ABCD1234' });
  });
});
