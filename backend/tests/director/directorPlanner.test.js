jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn(), debug: jest.fn(),
  llm: jest.fn(),
}));

const DirectorPlanner = require('../../src/services/director/DirectorPlanner');
const { planAssets, composeImagePrompt, similarity } = require('../../src/services/director/AssetPlanner');
const { DirectorPlanSchema } = require('../../src/services/director/schemas');
const { LAYOUT_IDS } = require('../../src/ir/templateRegistry');
const { TRANSITION_REGISTRY, CAMERA_REGISTRY } = require('../../src/ir/compositionRegistry');

const structure = {
  title: 'Tides',
  beats: [
    { beatIndex: 1, purpose: 'Hook the viewer with a surprising claim', sceneRange: [1, 2], toneNote: '' },
    { beatIndex: 2, purpose: 'Explain the core mechanism', sceneRange: [3, 6], toneNote: '' },
    { beatIndex: 3, purpose: 'Summarise and land the takeaway', sceneRange: [7, 8], toneNote: '' },
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
  audio: { text: `Narration for scene ${n}. It carries on for a little while so there is something to say.` },
  scene_meta: { content: ['First idea.', 'Second idea.', 'Third idea.'] },
  storyboard: { beat: null, intent: '', layout: '', visual: { kind: 'none', prompt: '', status: 'none' }, cameraMotion: null, transition: null, source: 'default' },
  ...over,
});

const imageScene = (n, prompt = 'the moon rising over a calm harbour at dusk') => scene(n, {
  sceneType: 'contentwithimage',
  imagePrompt: prompt,
  storyboard: { beat: null, intent: '', layout: 'split-image', visual: { kind: 'image', prompt, status: 'pending' }, cameraMotion: null, transition: null, source: 'director' },
});

const refine = (scenes, extra = {}) => DirectorPlanner.refine({ scenes, structure, videoType: 'educational', source: 'director', ...extra });

describe('refine - the plan', () => {
  it('produces a plan that satisfies its own schema', () => {
    const { plan } = refine([1, 2, 3, 4].map((n) => scene(n)));
    expect(plan).not.toBeNull();
    expect(DirectorPlanSchema.safeParse(plan).success).toBe(true);
    expect(plan.version).toBe(1);
    expect(plan.scenes).toHaveLength(4);
  });

  it('gives every scene a purpose and a visual strategy', () => {
    const { plan } = refine([1, 2, 3, 4, 5, 6, 7, 8].map((n) => scene(n)));
    for (const s of plan.scenes) {
      expect(s.scene.purpose).toEqual(expect.any(String));
      expect(s.scene.strategy).toEqual(expect.any(String));
    }
    expect(plan.scenes[0].scene.purpose).toBe('hook');
    expect(plan.scenes[7].scene.purpose).toBe('conclusion');
  });

  it('ends marketing-style videos on a call to action', () => {
    const { plan } = refine([1, 2, 3].map((n) => scene(n)), { videoType: 'marketing' });
    expect(plan.scenes[2].scene.purpose).toBe('cta');
  });

  it('recovers a scene\'s purpose from its beat when the model gave none', () => {
    const { plan } = refine([1, 2, 3, 4, 5, 6, 7, 8].map((n) => scene(n)));
    expect(plan.scenes[1].scene.purpose).toBe('hook'); // beat 1: "Hook the viewer..."
    expect(plan.scenes[3].scene.purpose).toBe('explanation');
    expect(plan.scenes[6].scene.purpose).toBe('summary');
  });

  it('respects a purpose the model proposed', () => {
    const scenes = [1, 2, 3].map((n) => scene(n));
    scenes[1].storyboard.purpose = 'example';
    expect(refine(scenes).plan.scenes[1].scene.purpose).toBe('example');
  });

  it('estimates a duration from the narration with the script budget\'s pacing', () => {
    const long = scene(1, { audio: { text: 'word '.repeat(65) } }); // ~30s at 130 wpm
    const short = scene(2, { audio: { text: 'Short.' } });
    const { plan } = refine([long, short]);
    expect(plan.scenes[0].scene.estimatedDuration).toBeGreaterThan(28);
    expect(plan.scenes[0].scene.estimatedDuration).toBeLessThan(35);
    expect(plan.scenes[1].scene.estimatedDuration).toBe(2.5); // floor
  });

  it('records the audience and the story it was planned against', () => {
    const { plan } = refine([scene(1), scene(2)]);
    expect(plan.story.audience).toMatch(/learners/);
    expect(plan.story.beats).toHaveLength(3);
    expect(plan.story.styleGuide.visualPalette).toBe('warm teal and amber');
  });

  it('passes through how much of the plan the model supplied, and what had to be repaired', () => {
    const { plan } = refine([scene(1)], { source: 'partial', repairs: 2, rejectedScenes: [3] });
    expect(plan).toMatchObject({ source: 'partial', validation: { repairs: 2, rejectedScenes: [3] } });
  });
});

describe('refine - variety and readability of the scenes it returns', () => {
  const many = (n, make) => Array.from({ length: n }, (_, i) => (make ? make(i + 1) : scene(i + 1)));

  it('plans a layout for every non-podcast scene and none repeats its neighbour', () => {
    const { scenes } = refine(many(8));
    const layouts = scenes.map((s) => s.storyboard.layout);
    layouts.forEach((l, i) => {
      expect(LAYOUT_IDS).toContain(l);
      if (i > 0) expect(l).not.toBe(layouts[i - 1]);
    });
  });

  it('writes the planned values onto the scene itself (what the renderer reads)', () => {
    const { scenes } = refine(many(4));
    for (const s of scenes) {
      expect(s.storyboard.layout).toBe(s.storyboard.layout);
      expect(s.cameraMotion).toBe(s.storyboard.cameraMotion);
      expect(s.transition).toBe(s.storyboard.transition);
    }
  });

  it('only emits values the renderer has', () => {
    const { scenes } = refine(many(10, (n) => (n % 3 === 0 ? imageScene(n, `picture number ${n} of a quiet place`) : scene(n))));
    for (const s of scenes) {
      expect(CAMERA_REGISTRY).toContain(s.cameraMotion);
      expect(TRANSITION_REGISTRY).toContain(s.transition);
      expect(['', ...LAYOUT_IDS]).toContain(s.storyboard.layout);
    }
  });

  it('merges bullets beyond what the layout shows readably, leaving the narration alone', () => {
    const crowded = scene(1, { scene_meta: { content: Array.from({ length: 9 }, (_, i) => `Point number ${i}.`) } });
    const { scenes, plan } = refine([crowded]);
    expect(scenes[0].scene_meta.content.length).toBeLessThanOrEqual(6);
    expect(scenes[0].audio.text).toBe(crowded.audio.text);
    expect(plan.scenes[0].warnings.join()).toMatch(/merged/);
    expect(plan.scenes[0].visual.contentItems).toBe(scenes[0].scene_meta.content.length);
  });

  it('does not touch a scene that already fits', () => {
    const fits = scene(1);
    expect(refine([fits]).scenes[0].scene_meta).toEqual(fits.scene_meta);
  });

  it('leaves podcasts to the engine\'s fixed composition', () => {
    const turns = [1, 2, 3].map((n) => scene(n, { sceneType: 'podcast', scene_meta: undefined }));
    const { scenes } = DirectorPlanner.refine({ scenes: turns, structure, videoType: 'podcast', source: 'default' });
    expect(scenes.map((s) => s.storyboard.layout)).toEqual(['', '', '']);
  });

  it('keeps a long video varied: report shows no adjacent repeats', () => {
    const { plan } = refine(many(12));
    expect(plan.diversity.maxLayoutRun).toBe(1);
    expect(plan.diversity.score).toBeGreaterThan(0.6);
  });

  it('is deterministic', () => {
    const a = refine(many(8)).scenes.map((s) => [s.storyboard.layout, s.cameraMotion, s.transition]);
    const b = refine(many(8)).scenes.map((s) => [s.storyboard.layout, s.cameraMotion, s.transition]);
    expect(a).toEqual(b);
  });

  it('works with no storyboard at all (the model never answered)', () => {
    const bare = many(5).map((s) => { const { storyboard, ...rest } = s; return { ...rest, storyboard: undefined, _s: storyboard }; });
    const { scenes, plan } = refine(bare, { source: 'default' });
    expect(plan.source).toBe('default');
    expect(scenes.every((s) => s.storyboard.layout !== undefined)).toBe(true);
  });
});

describe('refine - composable motion slots', () => {
  const { sanitizeComposition } = require('../../src/ir/compositionRegistry');
  const ScriptParserService = require('../../src/services/video/ScriptParserService');

  it('gives every scene a background, decoration and text motion, and pictures an image motion', () => {
    const { scenes } = refine([scene(1), imageScene(2), scene(3)]);
    for (const s of scenes) {
      expect(s.composition).toMatchObject({ background: expect.any(String), decoration: expect.any(String), textMotion: expect.any(String) });
    }
    expect(scenes[1].composition.imageMotion).toBeDefined();
    expect(scenes[0].composition).not.toHaveProperty('imageMotion');
  });

  it('only names ids the renderer has', () => {
    const { scenes } = refine(Array.from({ length: 10 }, (_, i) => scene(i + 1)));
    for (const s of scenes) expect(sanitizeComposition(s.composition)).toEqual(s.composition);
  });

  it('records the same slots in the plan', () => {
    const { scenes, plan } = refine([scene(1), imageScene(2)]);
    expect(plan.scenes[0].motion.composition).toEqual(scenes[0].composition);
    expect(plan.scenes[1].motion.composition).toEqual(scenes[1].composition);
  });

  it('survives ScriptParserService.validate, which rebuilds each scene', () => {
    const { scenes } = refine([1, 2, 3].map((n) => scene(n)));
    const raw = scenes.map((s) => ({ ...s, scene_meta: s.scene_meta, audio: { ...s.audio, voice: '', emotion: '' } }));
    const validated = ScriptParserService.validate({ title: 'T', description: '', tags: [], scenes: raw }, 'educational', { seed: 'job-1' });
    validated.scenes.forEach((s, i) => expect(s.composition).toEqual(scenes[i].composition));
  });

  it('a podcast keeps its fixed look', () => {
    const turns = [1, 2].map((n) => scene(n, { sceneType: 'podcast', scene_meta: undefined }));
    const { scenes } = DirectorPlanner.refine({ scenes: turns, structure, videoType: 'podcast', source: 'default' });
    expect(scenes.every((s) => !s.composition)).toBe(true);
  });
});

describe('refine - pictures', () => {
  it('builds a dedicated prompt from the scene\'s subject, purpose, style and audience', () => {
    const { scenes, plan } = refine([scene(1), imageScene(2), scene(3)]);
    const prompt = scenes[1].imagePrompt;
    expect(prompt).toContain('the moon rising over a calm harbour at dusk');
    expect(prompt).toContain('curious learners');
    expect(plan.scenes[1].asset).toMatchObject({ needsImage: true, role: 'supporting', status: 'pending', imagePrompt: prompt });
    expect(scenes[1].storyboard.visual.prompt).toBe(prompt);
  });

  it('records the neighbouring scenes the prompt was written against', () => {
    const { plan } = refine([scene(1), imageScene(2), scene(3)]);
    expect(plan.scenes[1].asset.context).toEqual({ previous: 'Scene 1', next: 'Scene 3' });
  });

  it('does not invent pictures for scenes without one', () => {
    const { scenes, plan } = refine([scene(1), scene(2)]);
    expect(scenes.every((s) => s.imagePrompt === '')).toBe(true);
    expect(plan.scenes.every((s) => !s.asset.needsImage)).toBe(true);
  });

  it('is idempotent: planning an already-planned prompt changes nothing', () => {
    const once = refine([imageScene(1)]).scenes[0].imagePrompt;
    const twice = refine([imageScene(1, once)]).scenes[0].imagePrompt;
    expect(twice).toBe(once);
  });
});

describe('AssetPlanner', () => {
  const ctx = { styleGuide: { visualPalette: 'warm teal' }, videoType: 'story' };
  const item = (n, prompt) => ({
    sceneNumber: n, hasImage: true, purpose: 'explanation', strategy: 'split-visual', previous: '', next: '',
    scene: { title: `Scene ${n}`, imagePrompt: prompt, audio: { text: 'Some narration here.' } },
  });

  it('gives near-identical prompts a different shot so the same picture is not shown twice', () => {
    const [a, b, c] = planAssets([item(1, 'a lighthouse on a cliff at dusk'), item(2, 'a lighthouse on a cliff at dusk'), item(3, 'a lighthouse on a cliff at dusk')], ctx);
    expect(a.imagePrompt).not.toBe(b.imagePrompt);
    expect(b.imagePrompt).not.toBe(c.imagePrompt);
    expect(similarity(a.imagePrompt, b.imagePrompt)).toBeLessThan(1);
  });

  it('lets podcast turns share their one cover image', () => {
    const [a, b] = planAssets([item(1, 'warm podcast studio, soft light'), item(2, 'warm podcast studio, soft light')], { ...ctx, videoType: 'podcast' });
    expect(a.imagePrompt).toBe(b.imagePrompt);
  });

  it('derives a subject from the title and narration when no prompt was given', () => {
    const prompt = composeImagePrompt({ base: '', scene: { title: 'Tides', audio: { text: 'The moon pulls on the oceans. More text.' } }, purpose: 'explanation', styleGuide: {}, videoType: 'educational' });
    expect(prompt).toContain('Tides');
    expect(prompt).toContain('The moon pulls on the oceans');
  });

  it('keeps a prompt within the length the image model takes', () => {
    const prompt = composeImagePrompt({ base: 'x '.repeat(500), scene: {}, purpose: 'hook', styleGuide: {}, videoType: 'story' });
    expect(prompt.length).toBeLessThanOrEqual(600);
  });

  it('puts a full-screen picture in the hero role', () => {
    const [asset] = planAssets([{ ...item(1, 'a vast desert at sunrise'), strategy: 'full-screen-visual' }], ctx);
    expect(asset.role).toBe('hero');
  });

  it('drops the picture when it ends up with no usable description', () => {
    const [asset] = planAssets([{ ...item(1, ''), scene: { title: '', audio: { text: '' } } }], { styleGuide: {}, videoType: 'unknown' });
    expect(asset.needsImage).toBe(false);
  });
});
