jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(),
  llm: jest.fn(), tts: jest.fn(), render: jest.fn(), upload: jest.fn(),
}));
jest.mock('../../src/services/common/LLMService', () => ({ generateScript: jest.fn() }));

const LLMService = require('../../src/services/common/LLMService');
const config = require('../../src/config');
const Storyboard = require('../../src/services/director/StoryboardPlanningService');
const VisualPlanningService = require('../../src/services/director/VisualPlanningService');
const MotionPlanningService = require('../../src/services/director/MotionPlanningService');
const { LAYOUT_IDS } = require('../../src/ir/templateRegistry');

const structure = {
  beats: [
    { beatIndex: 1, purpose: 'Hook the viewer', sceneRange: [1, 2], toneNote: '' },
    { beatIndex: 2, purpose: 'Explain', sceneRange: [3, 6], toneNote: '' },
  ],
  styleGuide: { visualPalette: 'warm teal and amber', motionVocabulary: 'static, zoom-in', voiceTone: 'warm' },
};

const scene = (n, over = {}) => ({
  sceneNumber: n,
  sceneType: 'content',
  title: `Scene ${n}`,
  subtitle: '',
  transition: 'fade',
  cameraMotion: 'static',
  imagePrompt: '',
  audio: { text: `Narration for scene ${n}. It has a second sentence too.` },
  scene_meta: { content: ['a', 'b', 'c'] },
  ...over,
});

const withImages = (enabled) => { config.imageGen.enabled = enabled; };

beforeEach(() => { withImages(true); LLMService.generateScript.mockReset(); });
afterAll(() => { config.imageGen.enabled = false; });

describe('LAYOUT_IDS', () => {
  it("matches the renderer's scene ids (keep in sync with the engine test)", () => {
    expect([...LAYOUT_IDS].sort()).toEqual([
      'comparison-split', 'grid', 'image-fullbleed', 'paragraph-stack', 'podcast-centered', 'podcast-split',
      'quote-feature', 'split-image', 'stack-list', 'stat-highlight', 'timeline', 'title-only',
    ]);
  });
});

describe('imageBudget', () => {
  it('is 0 when image generation is off or for podcasts', () => {
    withImages(false);
    expect(Storyboard.imageBudget({ sceneCount: 12, videoType: 'educational' })).toBe(0);
    withImages(true);
    expect(Storyboard.imageBudget({ sceneCount: 12, videoType: 'podcast' })).toBe(0);
  });

  it('scales with scene count (1 per 3) and is capped by IMAGE_MAX_PER_VIDEO', () => {
    expect(Storyboard.imageBudget({ sceneCount: 3, videoType: 'story' })).toBe(1);
    expect(Storyboard.imageBudget({ sceneCount: 9, videoType: 'story' })).toBe(3);
    expect(Storyboard.imageBudget({ sceneCount: 90, videoType: 'story' })).toBe(config.imageGen.maxPerVideo);
  });
});

describe('plan', () => {
  const scenes = [scene(1), scene(2), scene(3)];
  const base = { scenes, structure, videoType: 'educational', topic: 't', language: 'english', imageBudget: 2, jobId: 'job-1' };

  it('collects entries the model returns for the scenes it was asked about', async () => {
    LLMService.generateScript.mockResolvedValue({
      scenes: [{ sceneNumber: 1, layout: 'grid' }, { sceneNumber: 3, layout: 'timeline' }, { sceneNumber: 99, layout: 'grid' }],
    });
    const { entries, source } = await Storyboard.plan(base);
    expect([...entries.keys()]).toEqual([1, 3]); // 99 was never asked about
    expect(source).toBe('director');
  });

  it('never fails the job when the model errors - scenes just keep their defaults', async () => {
    LLMService.generateScript.mockRejectedValue(new Error('model down'));
    const { entries, source } = await Storyboard.plan(base);
    expect(entries.size).toBe(0);
    expect(source).toBe('default');
  });

  it('survives a garbled response shape', async () => {
    LLMService.generateScript.mockResolvedValue({ scenes: 'nope' });
    expect((await Storyboard.plan(base)).source).toBe('default');
    LLMService.generateScript.mockResolvedValue(null);
    expect((await Storyboard.plan(base)).source).toBe('default');
  });

  it('does not call the model for podcasts (fixed composition, shared cover)', async () => {
    const { entries } = await Storyboard.plan({ ...base, videoType: 'podcast' });
    expect(entries.size).toBe(0);
    expect(LLMService.generateScript).not.toHaveBeenCalled();
  });

  it('asks in chunks, and reports a partial result when only some chunks answer', async () => {
    const many = Array.from({ length: 14 }, (_, i) => scene(i + 1));
    LLMService.generateScript
      .mockResolvedValueOnce({ scenes: [{ sceneNumber: 1, layout: 'grid' }] })
      .mockRejectedValueOnce(new Error('timeout'));
    const { source } = await Storyboard.plan({ ...base, scenes: many });
    expect(LLMService.generateScript).toHaveBeenCalledTimes(2);
    expect(source).toBe('partial');
  });

  it('lets cancellation through', async () => {
    const err = Object.assign(new Error('stopped'), { cancelled: true });
    await expect(Storyboard.plan({ ...base, checkCancelled: async () => { throw err; } })).rejects.toBe(err);
  });
});

describe('apply', () => {
  const run = (scenes, entries, extra = {}) =>
    Storyboard.apply(scenes, new Map(entries), { structure, imageBudget: 2, videoType: 'educational', ...extra });

  it('validates every field against what the renderer has', () => {
    const [out] = run([scene(1)], [[1, { layout: 'not-a-layout', cameraMotion: 'barrel-roll', transition: 'spin', visual: { kind: 'none' } }]]);
    expect(out.storyboard.layout).toBe('');
    expect(out.storyboard.cameraMotion).toBeNull();
    expect(out.storyboard.transition).toBeNull();
    expect(out.transition).toBe('fade'); // script's own value kept
  });

  it('applies valid planner choices to the scene and records the beat and intent', () => {
    const [out] = run([scene(3)], [[3, { layout: 'timeline', cameraMotion: 'zoom-in', transition: 'wipe', visual: { kind: 'none' } }]]);
    expect(out).toMatchObject({ transition: 'wipe', cameraMotion: 'zoom-in' });
    expect(out.storyboard).toMatchObject({ beat: 2, intent: 'Explain', layout: 'timeline', source: 'director' });
  });

  it('promotes a content scene to contentwithimage when it gets an image, keeping a body to show', () => {
    const [out] = run([scene(1)], [[1, { visual: { kind: 'image', prompt: 'a lighthouse on a cliff at dusk' } }]]);
    expect(out.sceneType).toBe('contentwithimage');
    expect(out.imagePrompt).toBe('a lighthouse on a cliff at dusk, warm teal and amber');
    expect(out.subtitle).toBe('Narration for scene 1.');
    expect(out.storyboard.visual).toEqual({ kind: 'image', prompt: out.imagePrompt, status: 'pending' });
  });

  it('demotes an image-bearing scene that ends up without an image (validate requires a prompt for those types)', () => {
    const [out] = run(
      [scene(1, { sceneType: 'image', imagePrompt: 'old prompt that is long enough' })],
      [[1, { visual: { kind: 'none' } }]]
    );
    expect(out.sceneType).toBe('content');
    expect(out.imagePrompt).toBe('');
  });

  it('enforces the image budget in scene order', () => {
    const scenes = [1, 2, 3, 4].map((n) => scene(n));
    const entries = scenes.map((s) => [s.sceneNumber, { visual: { kind: 'image', prompt: `a distinct picture number ${s.sceneNumber}` } }]);
    const out = run(scenes, entries, { imageBudget: 2 });
    expect(out.map((s) => s.storyboard.visual.kind)).toEqual(['image', 'image', 'none', 'none']);
  });

  it('refuses images entirely when generation is disabled, and demotes the scenes that expected one', () => {
    withImages(false);
    const prompt = 'a prompt that is long enough';
    const [out] = run([scene(1, { sceneType: 'contentwithimage', imagePrompt: prompt })], [[1, { visual: { kind: 'image', prompt } }]]);
    expect(out.storyboard.visual.kind).toBe('none');
    expect(out.sceneType).toBe('content');
    expect(out.imagePrompt).toBe('');
  });

  it('ignores image prompts that are too short to mean anything', () => {
    const [out] = run([scene(1)], [[1, { visual: { kind: 'image', prompt: 'x' } }]]);
    expect(out.storyboard.visual.kind).toBe('none');
  });

  it('drops an image layout when the scene has no image, and podcast layouts always', () => {
    const [a] = run([scene(1)], [[1, { layout: 'split-image', visual: { kind: 'none' } }]]);
    expect(a.storyboard.layout).toBe('');
    const [b] = run([scene(1)], [[1, { layout: 'podcast-split', visual: { kind: 'none' } }]]);
    expect(b.storyboard.layout).toBe('');
    const [c] = run([scene(1)], [[1, { layout: 'split-image', visual: { kind: 'image', prompt: 'a calm harbour at sunrise' } }]]);
    expect(c.storyboard.layout).toBe('split-image');
  });

  it('title cards cannot carry a generated image', () => {
    const [out] = run([scene(1, { sceneType: 'title' })], [[1, { visual: { kind: 'image', prompt: 'a skyline at night, neon' } }]]);
    expect(out.storyboard.visual.kind).toBe('none');
    expect(out.sceneType).toBe('title');
  });

  it("without an entry, keeps the script's own image prompt as the default plan", () => {
    const [out] = run([scene(1, { sceneType: 'image', imagePrompt: 'a quiet forest path in morning mist' })], []);
    expect(out.storyboard.source).toBe('default');
    expect(out.storyboard.visual.kind).toBe('image');
    expect(out.sceneType).toBe('image');
  });

  it('podcast turns share one cover image without spending the budget', () => {
    const turns = [1, 2, 3].map((n) => scene(n, { sceneType: 'podcast', imagePrompt: 'warm podcast studio, soft light' }));
    const out = Storyboard.apply(turns, new Map(), { structure, imageBudget: 0, videoType: 'podcast' });
    expect(out.map((s) => s.storyboard.visual.kind)).toEqual(['image', 'image', 'image']);
    expect(out.every((s) => s.sceneType === 'podcast')).toBe(true);
    expect(out.every((s) => s.storyboard.layout === '')).toBe(true);
  });
});

describe('finalize + MotionPlanningService', () => {
  it('keeps a planner-chosen "static" instead of cycling it, and cycles the unset ones', () => {
    const applied = Storyboard.apply(
      [scene(1), scene(2), scene(3)],
      new Map([[1, { cameraMotion: 'static', visual: { kind: 'none' } }]]),
      { structure, imageBudget: 0, videoType: 'educational' }
    );
    const moved = MotionPlanningService.apply(applied, { motionVocabulary: 'zoom-in, zoom-out' });
    expect(moved[0].cameraMotion).toBe('static');
    expect(moved[1].cameraMotion).toBe('zoom-in');
    expect(moved[2].cameraMotion).toBe('zoom-out');

    const final = Storyboard.finalize(moved);
    expect(final.map((s) => s.storyboard.cameraMotion)).toEqual(['static', 'zoom-in', 'zoom-out']);
  });
});

describe('VisualPlanningService.styledPrompt', () => {
  it('appends the palette once and is idempotent', () => {
    const once = VisualPlanningService.styledPrompt('a lighthouse', { visualPalette: 'warm teal' });
    expect(once).toBe('a lighthouse, warm teal');
    expect(VisualPlanningService.styledPrompt(once, { visualPalette: 'warm teal' })).toBe(once);
  });

  it('returns an empty prompt as empty', () => {
    expect(VisualPlanningService.styledPrompt('', { visualPalette: 'x' })).toBe('');
  });
});

describe('buildBrief', () => {
  it('records the plan the storyboard was made against', () => {
    const brief = Storyboard.buildBrief({ structure, imageBudget: 3, source: 'director', videoType: 'story', extraInstructions: '- be brief' });
    expect(brief).toMatchObject({ videoType: 'story', imageBudget: 3, storyboardSource: 'director', extraInstructions: '- be brief' });
    expect(brief.beats).toHaveLength(2);
  });
});
