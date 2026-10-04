jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(),
}));
jest.mock('../../src/services/image/ImageGenerationService', () => ({ generate: jest.fn() }));
jest.mock('../../src/utils/abortableDelay', () => ({
  ...jest.requireActual('../../src/utils/abortableDelay'),
  abortableDelay: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/models/VideoJob', () => ({ findById: jest.fn(), findByIdAndUpdate: jest.fn() }));
jest.mock('../../src/services/common/cancellationBus', () => ({}));

const fs = require('fs');
const config = require('../../src/config');
const VideoJob = require('../../src/models/VideoJob');
const ImageGenerationService = require('../../src/services/image/ImageGenerationService');
const { ensureSceneImages, prepareSceneForImage } = require('../../src/services/image/sceneImages');
const lifecycle = require('../../src/services/video/videoService/lifecycle');
const { JOB_STATUS } = require('../../src/constants');

// The real seed function, since the service module is mocked above.
const { seedFor } = jest.requireActual('../../src/services/image/ImageGenerationService');

const original = { ...config.imageGen };
beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(config.imageGen, original, { enabled: true, required: false, maxRetries: 1 });
  jest.spyOn(fs.promises, 'unlink').mockResolvedValue();
  ImageGenerationService.generate.mockImplementation(async ({ prompt, variant }) => ({ url: `http://x/${encodeURIComponent(prompt)}-v${variant}.png`, fromCache: false }));
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => Object.assign(config.imageGen, original));

const imageScene = (n, over = {}) => ({
  sceneNumber: n,
  sceneType: 'contentwithimage',
  templateId: 'generative',
  title: `Scene ${n}`,
  subtitle: 'Body text',
  imagePrompt: `prompt ${n}`,
  imageUrl: `http://x/old-${n}.png`,
  audio: { text: 'The first sentence is here. And a second one follows.' },
  elements: { title: `Scene ${n}`, body: 'Body text', image: `http://x/old-${n}.png`, badge: '' },
  storyboard: { layout: 'split-image', visual: { kind: 'image', prompt: `prompt ${n}`, status: 'generated' } },
  ...over,
});

describe('seed variants', () => {
  it('variant 0 is the original seed; each variant is a different one', () => {
    const real = jest.requireActual('../../src/services/image/ImageGenerationService');
    expect(real.seedFor('a cat')).toBe(real.seedFor('a cat', 0));
    expect(real.seedFor('a cat', 1)).not.toBe(real.seedFor('a cat'));
    expect(real.seedFor('a cat', 1)).not.toBe(real.seedFor('a cat', 2));
    expect(real.seedFor('a cat', 1)).toBe(real.seedFor('a cat', 1));
    expect(seedFor).toBeDefined();
  });
});

describe('prepareSceneForImage', () => {
  it('clears the old image everywhere, keeps the prompt, and bumps the variant', () => {
    const out = prepareSceneForImage(imageScene(1));
    expect(out).toMatchObject({ imageUrl: '', imagePrompt: 'prompt 1', sceneType: 'contentwithimage' });
    expect(out.elements.image).toBe('');
    expect(out.storyboard.visual).toMatchObject({ kind: 'image', status: 'pending', variant: 1, prompt: 'prompt 1' });
    expect(out.storyboard.layout).toBe('split-image'); // untouched
  });

  it('counts re-rolls', () => {
    const second = prepareSceneForImage(prepareSceneForImage(imageScene(1)));
    expect(second.storyboard.visual.variant).toBe(2);
  });

  it('uses a replacement prompt when given one', () => {
    const out = prepareSceneForImage(imageScene(1), '  a red barn in snow  ');
    expect(out.imagePrompt).toBe('a red barn in snow');
    expect(out.storyboard.visual.prompt).toBe('a red barn in snow');
  });

  it('falls back to the storyboard\'s prompt when the scene prompt was cleared by a text fallback', () => {
    const degraded = imageScene(1, { sceneType: 'content', imagePrompt: '', storyboard: { visual: { kind: 'none', prompt: 'the original idea', status: 'degraded', reason: 'ComfyUI down' } } });
    const out = prepareSceneForImage(degraded);
    expect(out.imagePrompt).toBe('the original idea');
    expect(out.storyboard.visual.reason).toBeUndefined();
  });

  it('returns null when there is no prompt anywhere', () => {
    expect(prepareSceneForImage(imageScene(1, { imagePrompt: '', storyboard: null }))).toBeNull();
    expect(prepareSceneForImage(imageScene(1, { imagePrompt: '', storyboard: null }), '   ')).toBeNull();
  });

  it('turns a text scene into an image-and-text scene when given a prompt', () => {
    const text = imageScene(1, {
      sceneType: 'content', subtitle: '', imagePrompt: '', imageUrl: '', storyboard: null,
      elements: { title: 'Tides', items: [{ text: 'a' }, { text: 'b' }], caption: '', backgroundColor: '#123456' },
    });
    const out = prepareSceneForImage(text, 'the moon over a harbour');
    expect(out.sceneType).toBe('contentwithimage');
    expect(out.elements).toMatchObject({ title: 'Tides', body: 'The first sentence is here.', image: '', backgroundColor: '#123456' });
    expect(out.elements.items).toBeUndefined();
    expect(out.imagePrompt).toBe('the moon over a harbour');
    expect(out.storyboard.visual.variant).toBe(1);
  });

  it('puts a podcast scene\'s picture in hostImage', () => {
    const out = prepareSceneForImage(imageScene(1, { sceneType: 'podcast', elements: { hostImage: 'http://x/cover.png' } }));
    expect(out.elements.hostImage).toBe('');
    expect('image' in out.elements).toBe(false);
  });
});

describe('ensureSceneImages with re-rolled scenes', () => {
  it('passes the variant to the generator', async () => {
    const result = await ensureSceneImages({ id: 'job-1', scenes: [prepareSceneForImage(imageScene(1))], aspectRatio: '16:9', generator: ImageGenerationService });
    expect(ImageGenerationService.generate).toHaveBeenCalledWith(expect.objectContaining({ prompt: expect.stringMatching(/^prompt 1\./), variant: 1 }));
    expect(result.scenes[0].imageUrl).toContain('-v1.png');
  });

  it('generates the same prompt separately when the variants differ', async () => {
    const a = prepareSceneForImage(imageScene(1, { imagePrompt: 'shared' }));
    const b = imageScene(2, { imagePrompt: 'shared', imageUrl: '', storyboard: { visual: { kind: 'image', status: 'pending' } } });
    await ensureSceneImages({ id: 'job-1', scenes: [a, b], aspectRatio: '16:9', generator: ImageGenerationService });
    expect(ImageGenerationService.generate).toHaveBeenCalledTimes(2);
    expect(ImageGenerationService.generate.mock.calls.map(([o]) => o.variant).sort()).toEqual([0, 1]);
  });

  it('still shares one picture between scenes with the same prompt and variant', async () => {
    const a = prepareSceneForImage(imageScene(1, { imagePrompt: 'shared' }));
    const b = prepareSceneForImage(imageScene(2, { imagePrompt: 'shared' }));
    await ensureSceneImages({ id: 'job-1', scenes: [a, b], aspectRatio: '16:9', generator: ImageGenerationService });
    expect(ImageGenerationService.generate).toHaveBeenCalledTimes(1);
  });
});

describe('VideoService.regenerateSceneImage', () => {
  // A stand-in for a Mongoose job: scenes with toObject(), and a save().
  const makeJob = (status, scenes) => ({
    _id: 'job-1',
    status,
    script: {
      scenes: scenes.map((s) => {
        const doc = { ...s };
        doc.toObject = () => { const { toObject, ...plain } = doc; return JSON.parse(JSON.stringify(plain)); };
        return doc;
      }),
    },
    save: jest.fn().mockResolvedValue(),
  });

  beforeEach(() => {
    VideoJob.findByIdAndUpdate.mockImplementation(async (_id, update) => ({ _id: 'job-1', ...update.$set }));
  });

  it('clears the scene\'s image, re-queues at the image step, and leaves other scenes alone', async () => {
    const job = makeJob(JOB_STATUS.COMPLETED, [imageScene(1), imageScene(2)]);
    VideoJob.findById.mockResolvedValue(job);

    const updated = await lifecycle.regenerateSceneImage('job-1', 2);

    const [one, two] = job.script.scenes;
    expect(two).toMatchObject({ imageUrl: '', imagePrompt: 'prompt 2' });
    expect(two.storyboard.visual.variant).toBe(1);
    expect(one.imageUrl).toBe('http://x/old-1.png');
    expect(job.save).toHaveBeenCalled();
    expect(VideoJob.findByIdAndUpdate).toHaveBeenCalledWith('job-1', expect.objectContaining({
      $set: expect.objectContaining({ status: JOB_STATUS.GENERATING_IMAGES, progress: 56, videoUrl: '' }),
      $unset: { error: '' },
    }), { new: true });
    expect(updated.status).toBe(JOB_STATUS.GENERATING_IMAGES);
    expect(fs.promises.unlink).toHaveBeenCalledWith(expect.stringMatching(/assets\.json$/));
  });

  it('applies a new prompt', async () => {
    const job = makeJob(JOB_STATUS.FAILED, [imageScene(1)]);
    VideoJob.findById.mockResolvedValue(job);
    await lifecycle.regenerateSceneImage('job-1', 1, { prompt: 'a red barn in snow' });
    expect(job.script.scenes[0].imagePrompt).toBe('a red barn in snow');
  });

  it('re-rolls every podcast turn that shares the cover', async () => {
    const turns = [1, 2, 3].map((n) => imageScene(n, { sceneType: 'podcast', imagePrompt: 'warm studio', elements: { hostImage: 'http://x/cover.png' } }));
    turns.push(imageScene(4, { sceneType: 'podcast', imagePrompt: 'a different prompt', elements: { hostImage: 'http://x/other.png' } }));
    const job = makeJob(JOB_STATUS.COMPLETED, turns);
    VideoJob.findById.mockResolvedValue(job);

    await lifecycle.regenerateSceneImage('job-1', 2);

    const cleared = job.script.scenes.map((s) => s.imageUrl === '');
    expect(cleared).toEqual([true, true, true, false]);
    expect(job.script.scenes[0].elements.hostImage).toBe('');
  });

  it('refuses while the job is still working through the pipeline', async () => {
    for (const status of [JOB_STATUS.RENDERING, JOB_STATUS.GENERATING_AUDIO, JOB_STATUS.AWAITING_APPROVAL, JOB_STATUS.QUEUED]) {
      VideoJob.findById.mockResolvedValue(makeJob(status, [imageScene(1)]));
      await expect(lifecycle.regenerateSceneImage('job-1', 1)).rejects.toThrow(/Images can be regenerated once/);
    }
    expect(VideoJob.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('404s for a missing job or scene', async () => {
    VideoJob.findById.mockResolvedValue(null);
    await expect(lifecycle.regenerateSceneImage('job-1', 1)).rejects.toThrow(/Job not found/);

    VideoJob.findById.mockResolvedValue(makeJob(JOB_STATUS.COMPLETED, [imageScene(1)]));
    await expect(lifecycle.regenerateSceneImage('job-1', 9)).rejects.toThrow(/Scene 9 not found/);
  });

  it('asks for a prompt when the scene has none, without changing anything', async () => {
    const job = makeJob(JOB_STATUS.COMPLETED, [imageScene(1, { sceneType: 'content', imagePrompt: '', storyboard: null })]);
    VideoJob.findById.mockResolvedValue(job);
    await expect(lifecycle.regenerateSceneImage('job-1', 1)).rejects.toThrow(/no image prompt/);
    expect(job.save).not.toHaveBeenCalled();
    expect(VideoJob.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
