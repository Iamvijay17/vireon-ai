jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(),
}));
jest.mock('../../src/services/image/ImageGenerationService', () => ({ generate: jest.fn() }));
jest.mock('../../src/utils/abortableDelay', () => ({
  ...jest.requireActual('../../src/utils/abortableDelay'),
  abortableDelay: jest.fn().mockResolvedValue(undefined),
}));

const config = require('../../src/config');
const { ensureSceneImages, needsImage, applyImage, degradeScene } = require('../../src/services/image/sceneImages');

const original = { ...config.imageGen };
const generator = { generate: jest.fn() };

const scene = (n, over = {}) => ({
  sceneNumber: n,
  sceneType: 'contentwithimage',
  templateId: 'generative',
  title: `Scene ${n}`,
  subtitle: 'A body paragraph',
  imagePrompt: `prompt ${n}`,
  imageUrl: '',
  audio: { text: 'First sentence here. Second sentence here! Third one?', duration: 5 },
  elements: { title: `Scene ${n}`, body: 'A body paragraph', image: '', badge: '' },
  storyboard: { layout: 'split-image', visual: { kind: 'image', prompt: `prompt ${n}`, status: 'pending' }, source: 'director' },
  ...over,
});

beforeEach(() => {
  Object.assign(config.imageGen, original, { enabled: true, required: false, maxRetries: 2 });
  jest.clearAllMocks();
  generator.generate.mockImplementation(async ({ prompt }) => ({ url: `http://minio/${encodeURIComponent(prompt)}.png`, fromCache: false }));
});
afterAll(() => Object.assign(config.imageGen, original));

const run = (scenes, extra = {}) => ensureSceneImages({ id: 'job-1', scenes, aspectRatio: '16:9', generator, ...extra });

describe('needsImage', () => {
  it('is true only for a scene with a prompt and no image yet', () => {
    expect(needsImage(scene(1))).toBe(true);
    expect(needsImage(scene(1, { imageUrl: 'http://x/a.png' }))).toBe(false);
    expect(needsImage(scene(1, { imagePrompt: '  ' }))).toBe(false);
    expect(needsImage(scene(1, { imagePrompt: '' }))).toBe(false);
  });
});

describe('ensureSceneImages: generation', () => {
  it('generates each image, sets it everywhere a template reads it, and persists as they land', async () => {
    const persist = jest.fn();
    const result = await run([scene(1), scene(2), scene(3, { sceneType: 'content', imagePrompt: '' })], { persist });

    expect(result).toMatchObject({ total: 2, generated: 2, cached: 0, degraded: [] });
    const [a, b, c] = result.scenes;
    expect(a.imageUrl).toBe('http://minio/prompt%201.png');
    expect(a.elements.image).toBe(a.imageUrl);
    expect(a.storyboard.visual.status).toBe('generated');
    expect(b.imageUrl).toContain('prompt%202');
    expect(c).toEqual(scene(3, { sceneType: 'content', imagePrompt: '' })); // untouched
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[0][0].map((s) => s.sceneNumber)).toEqual([1]);
  });

  it('generates a shared prompt once and applies it to every scene that uses it (podcast cover)', async () => {
    const turns = [1, 2, 3].map((n) => scene(n, { sceneType: 'podcast', imagePrompt: 'warm studio', elements: { title: 't', hostImage: '' } }));
    const result = await run(turns);

    expect(generator.generate).toHaveBeenCalledTimes(1);
    expect(result.total).toBe(1);
    expect(result.scenes.every((s) => s.imageUrl && s.elements.hostImage === s.imageUrl && !('image' in s.elements))).toBe(true);
  });

  it('skips scenes that already have an image (resume, or a manual URL)', async () => {
    const result = await run([scene(1, { imageUrl: 'http://x/manual.png' }), scene(2)]);
    expect(generator.generate).toHaveBeenCalledTimes(1);
    expect(result.scenes[0].imageUrl).toBe('http://x/manual.png');
  });

  it('counts cache hits separately', async () => {
    generator.generate.mockResolvedValueOnce({ url: 'http://x/1.png', fromCache: true });
    const result = await run([scene(1), scene(2)]);
    expect(result).toMatchObject({ generated: 1, cached: 1 });
  });

  it('does nothing for a script with no image prompts', async () => {
    const result = await run([scene(1, { sceneType: 'content', imagePrompt: '' })]);
    expect(result.total).toBe(0);
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it('reports progress per distinct image', async () => {
    const onProgress = jest.fn();
    await run([scene(1), scene(2)], { onProgress });
    expect(onProgress.mock.calls).toEqual([[1, 2], [2, 2]]);
  });

  it('retries a transient failure, then succeeds', async () => {
    generator.generate.mockRejectedValueOnce(new Error('ComfyUI busy')).mockResolvedValueOnce({ url: 'http://x/ok.png', fromCache: false });
    const result = await run([scene(1)]);
    expect(generator.generate).toHaveBeenCalledTimes(2);
    expect(result.generated).toBe(1);
    expect(result.degraded).toEqual([]);
  });

  it('does not retry a configuration error', async () => {
    generator.generate.mockRejectedValue(Object.assign(new Error('COMFYUI_CHECKPOINT is not set'), { permanent: true }));
    const result = await run([scene(1)]);
    expect(generator.generate).toHaveBeenCalledTimes(1);
    expect(result.degraded).toEqual([1]);
  });
});

describe('ensureSceneImages: falling back to text', () => {
  it('rewrites a contentwithimage scene as a content scene built from the narration', async () => {
    generator.generate.mockRejectedValue(new Error('model not found'));
    const persist = jest.fn();
    const result = await run([scene(1)], { persist });
    const [out] = result.scenes;

    expect(result.degraded).toEqual([1]);
    expect(result.reasons).toEqual(['model not found']);
    expect(out).toMatchObject({ sceneType: 'content', imagePrompt: '', imageUrl: '', templateId: 'generative' });
    expect(out.elements.items.map((i) => i.text)).toEqual(['First sentence here.', 'Second sentence here!', 'Third one?']);
    expect(out.elements.title).toBe('Scene 1');
    expect(out.audio).toEqual(scene(1).audio); // narration and timing untouched
    expect(out.storyboard.visual).toMatchObject({ kind: 'none', status: 'degraded', reason: 'model not found' });
    expect(out.storyboard.layout).toBe(''); // split-image needs the image that is not coming
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('rewrites an image scene as a title card', async () => {
    generator.generate.mockRejectedValue(new Error('x'));
    const [out] = (await run([scene(1, { sceneType: 'image', subtitle: 'sub', elements: { image: '', caption: 'The caption', label: 'Featured' } })])).scenes;
    expect(out.sceneType).toBe('title');
    expect(out.elements).toMatchObject({ title: 'The caption', subtitle: 'sub', image: '' });
  });

  it('gives a rewritten scene a template of its new type when not using the generative engine', async () => {
    generator.generate.mockRejectedValue(new Error('x'));
    const [out] = (await run([scene(1, { templateId: '003-contentwithimage' })])).scenes;
    expect(out.sceneType).toBe('content');
    expect(out.templateId).toMatch(/^(generative|\d{3}-content)$/);
    expect(out.templateId).not.toBe('003-contentwithimage');
  });

  it('keeps a scene\'s own styling when rewriting it', async () => {
    const out = degradeScene(scene(1, { elements: { title: 'T', body: 'b', image: '', backgroundColor: '#123456', styleConfig: { visualStyle: 'modern' } } }), 'r');
    expect(out.elements).toMatchObject({ backgroundColor: '#123456', styleConfig: { visualStyle: 'modern' } });
  });

  it('falls back to the body when there is no narration to split', () => {
    const out = degradeScene(scene(1, { audio: { text: '' } }), 'r');
    expect(out.elements.items).toEqual([{ heading: '', text: 'A body paragraph' }]);
  });

  it('turns everything into text when image generation is disabled, without calling the generator', async () => {
    config.imageGen.enabled = false;
    const persist = jest.fn();
    const result = await run([scene(1), scene(2)], { persist });
    expect(generator.generate).not.toHaveBeenCalled();
    expect(result.degraded).toEqual([1, 2]);
    expect(result.reasons).toEqual(['Image generation is not enabled']);
    expect(result.scenes.every((s) => s.sceneType === 'content' && !s.imagePrompt)).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('leaves a podcast turn\'s layout alone but clears its prompt', () => {
    const turn = scene(1, { sceneType: 'podcast', storyboard: { layout: '', visual: { kind: 'image' } }, elements: { hostImage: '' } });
    const out = degradeScene(turn, 'r');
    expect(out).toMatchObject({ sceneType: 'podcast', imagePrompt: '' });
  });

  it('a scene with no storyboard stays without one', () => {
    expect(degradeScene(scene(1, { storyboard: null }), 'r').storyboard).toBeNull();
    expect(applyImage(scene(1, { storyboard: null }), 'http://x/a.png').storyboard).toBeNull();
  });
});

describe('ensureSceneImages: required mode and cancellation', () => {
  it('fails the job instead of falling back when images are required', async () => {
    config.imageGen.required = true;
    generator.generate.mockRejectedValue(new Error('no GPU'));
    await expect(run([scene(1)])).rejects.toThrow('no GPU');
  });

  it('refuses up front when required but disabled', async () => {
    config.imageGen.required = true;
    config.imageGen.enabled = false;
    await expect(run([scene(1)])).rejects.toThrow(/IMAGE_GEN_REQUIRED/);
  });

  it('lets a cancellation through instead of treating it as a failed image', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    generator.generate.mockRejectedValue(abort);
    await expect(run([scene(1)])).rejects.toBe(abort);

    const stop = Object.assign(new Error('stopped'), { cancelled: true });
    await expect(run([scene(1)], { checkCancelled: async () => { throw stop; } })).rejects.toBe(stop);
  });

  it('keeps the images that finished before a later one was cancelled', async () => {
    const persist = jest.fn();
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    generator.generate.mockResolvedValueOnce({ url: 'http://x/1.png', fromCache: false }).mockRejectedValueOnce(abort);
    await expect(run([scene(1), scene(2)], { persist })).rejects.toBe(abort);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0][0][0]).toMatchObject({ sceneNumber: 1, imageUrl: 'http://x/1.png' });
  });
});
