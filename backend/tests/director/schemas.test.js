const {
  StoryboardEntrySchema, StoryPlanSchema, AssetPlanSchema, MotionPlanSchema, DirectorPlanSchema, formatIssues,
} = require('../../src/services/director/schemas');

describe('StoryboardEntrySchema', () => {
  it('accepts a complete, valid entry', () => {
    const parsed = StoryboardEntrySchema.parse({
      sceneNumber: 2, purpose: 'explanation', strategy: 'timeline', layout: 'timeline',
      visual: { kind: 'none', prompt: '' }, cameraMotion: 'zoom-in', transition: 'wipe',
    });
    expect(parsed).toMatchObject({ sceneNumber: 2, purpose: 'explanation', layout: 'timeline', transition: 'wipe' });
  });

  it('needs only a scene number - everything else takes its default', () => {
    expect(StoryboardEntrySchema.parse({ sceneNumber: 4 })).toEqual({
      sceneNumber: 4, layout: '', visual: { kind: 'none', prompt: '' },
    });
  });

  it('coerces a numeric string scene number', () => {
    expect(StoryboardEntrySchema.parse({ sceneNumber: '7' }).sceneNumber).toBe(7);
  });

  it.each([
    ['Zoom In', 'zoom-in'], ['zoom_in', 'zoom-in'], ['PAN-LEFT', 'pan-left'], [' static ', 'static'],
  ])('normalises the camera move %p to %p', (input, expected) => {
    expect(StoryboardEntrySchema.parse({ sceneNumber: 1, cameraMotion: input }).cameraMotion).toBe(expected);
  });

  it.each([
    ['slideup', 'slideUp'], ['Iris Wipe', 'irisWipe'], ['iris-wipe', 'irisWipe'], ['FADE', 'fade'],
  ])('normalises the transition %p to %p', (input, expected) => {
    expect(StoryboardEntrySchema.parse({ sceneNumber: 1, transition: input }).transition).toBe(expected);
  });

  it.each([
    ['Split Image', 'split-image'], ['stack_list', 'stack-list'], ['TITLE-ONLY', 'title-only'], ['splitImage', 'split-image'],
  ])('normalises the layout %p to %p', (input, expected) => {
    expect(StoryboardEntrySchema.parse({ sceneNumber: 1, layout: input }).layout).toBe(expected);
  });

  describe('rejects what the renderer does not have', () => {
    it.each([
      ['an unknown layout', { layout: 'carousel' }, 'layout'],
      ['an unknown camera move', { cameraMotion: 'barrel-roll' }, 'cameraMotion'],
      ['an unknown transition', { transition: 'spin' }, 'transition'],
      ['an unknown purpose', { purpose: 'vibes' }, 'purpose'],
      ['an unknown strategy', { strategy: 'collage' }, 'strategy'],
      ['an unknown visual kind', { visual: { kind: 'video', prompt: '' } }, 'visual.kind'],
    ])('%s', (_name, patch, path) => {
      const result = StoryboardEntrySchema.safeParse({ sceneNumber: 1, ...patch });
      expect(result.success).toBe(false);
      expect(formatIssues(result.error).join('\n')).toContain(path);
    });

    it('a missing or invalid scene number', () => {
      expect(StoryboardEntrySchema.safeParse({}).success).toBe(false);
      expect(StoryboardEntrySchema.safeParse({ sceneNumber: 0 }).success).toBe(false);
      expect(StoryboardEntrySchema.safeParse({ sceneNumber: 'two' }).success).toBe(false);
      expect(StoryboardEntrySchema.safeParse({ sceneNumber: 1.5 }).success).toBe(false);
    });

    it('an image scene with no picture description', () => {
      const result = StoryboardEntrySchema.safeParse({ sceneNumber: 1, visual: { kind: 'image', prompt: 'x' } });
      expect(result.success).toBe(false);
      expect(formatIssues(result.error)[0]).toMatch(/visual\.prompt.*at least 8 characters/);
    });

    it('non-object entries', () => {
      for (const bad of [null, undefined, 'scene', 4, []]) expect(StoryboardEntrySchema.safeParse(bad).success).toBe(false);
    });
  });

  it('strips fields it does not know instead of passing them on', () => {
    const parsed = StoryboardEntrySchema.parse({ sceneNumber: 1, evil: '<script>', visual: { kind: 'none', prompt: '', extra: 1 } });
    expect(parsed).not.toHaveProperty('evil');
    expect(parsed.visual).not.toHaveProperty('extra');
  });
});

describe('StoryPlanSchema', () => {
  const plan = (over = {}) => ({
    title: 'Tides', description: 'How tides work', tags: ['tides'], thumbnailPrompt: 'a harbour',
    beats: [{ beatIndex: 1, purpose: 'Explain', sceneRange: [1, 4], toneNote: 'calm' }],
    styleGuide: { visualPalette: 'warm teal', motionVocabulary: 'static, zoom-in', voiceTone: 'calm' },
    ...over,
  });

  it('accepts a complete plan', () => {
    expect(StoryPlanSchema.parse(plan()).beats).toHaveLength(1);
  });

  it('defaults the optional parts', () => {
    const parsed = StoryPlanSchema.parse({ title: 'T', beats: plan().beats });
    expect(parsed).toMatchObject({ description: '', tags: [], thumbnailPrompt: '', styleGuide: { visualPalette: '' } });
  });

  it.each([
    ['no title', { title: '' }],
    ['no beats', { beats: [] }],
    ['beats that are not a list', { beats: 'one' }],
    ['a beat with no purpose', { beats: [{ beatIndex: 1, purpose: '', sceneRange: [1, 2] }] }],
    ['a beat range that runs backwards', { beats: [{ beatIndex: 1, purpose: 'x', sceneRange: [5, 2] }] }],
    ['a beat range that is not a pair', { beats: [{ beatIndex: 1, purpose: 'x', sceneRange: [1] }] }],
  ])('rejects %s', (_name, patch) => {
    expect(StoryPlanSchema.safeParse(plan(patch)).success).toBe(false);
  });

  it('coerces numeric strings in a beat', () => {
    const parsed = StoryPlanSchema.parse(plan({ beats: [{ beatIndex: '1', purpose: 'x', sceneRange: ['1', '3'] }] }));
    expect(parsed.beats[0]).toMatchObject({ beatIndex: 1, sceneRange: [1, 3] });
  });
});

describe('AssetPlanSchema', () => {
  const base = { sceneNumber: 1, needsImage: true, imagePrompt: 'a quiet harbour at dawn', role: 'supporting', status: 'pending' };
  it('accepts an image asset with a prompt', () => expect(AssetPlanSchema.safeParse(base).success).toBe(true));
  it('rejects an image asset with no prompt', () => {
    expect(AssetPlanSchema.safeParse({ ...base, imagePrompt: '' }).success).toBe(false);
  });
  it('accepts a no-image asset', () => {
    expect(AssetPlanSchema.safeParse({ ...base, needsImage: false, imagePrompt: '', role: 'none', status: 'none' }).success).toBe(true);
  });
});

describe('MotionPlanSchema', () => {
  it('accepts registry ids and rejects invented ones', () => {
    const ok = { sceneNumber: 1, cameraMotion: 'static', transition: 'fade', composition: { background: 'aurora', textMotion: 'fadeSlideUp' } };
    expect(MotionPlanSchema.safeParse(ok).success).toBe(true);
    expect(MotionPlanSchema.safeParse({ ...ok, composition: { background: 'plasma' } }).success).toBe(false);
    expect(MotionPlanSchema.safeParse({ ...ok, cameraMotion: 'spin' }).success).toBe(false);
  });
});

describe('DirectorPlanSchema', () => {
  it('rejects a plan with an unknown source or version', () => {
    expect(DirectorPlanSchema.safeParse({ version: 2 }).success).toBe(false);
    expect(DirectorPlanSchema.safeParse({}).success).toBe(false);
  });
});
