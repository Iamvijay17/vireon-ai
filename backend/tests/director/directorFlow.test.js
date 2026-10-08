jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(),
  llm: jest.fn(), tts: jest.fn(), render: jest.fn(), upload: jest.fn(),
}));
jest.mock('../../src/services/common/LLMService', () => ({ generateScript: jest.fn() }));

const LLMService = require('../../src/services/common/LLMService');
const config = require('../../src/config');
const AIDirectorService = require('../../src/services/director/AIDirectorService');
const ScriptParserService = require('../../src/services/video/ScriptParserService');
const { compile } = require('../../src/ir');
const { toRenderProps } = require('../../src/ir/toRenderProps');

const structureResponse = {
  title: 'Tides',
  description: 'How tides work',
  tags: ['tides'],
  thumbnailPrompt: 'a harbour',
  beats: [{ beatIndex: 1, purpose: 'Explain tides', sceneRange: [1, 3], toneNote: 'calm' }],
  styleGuide: { visualPalette: 'warm teal', motionVocabulary: 'static, zoom-in', voiceTone: 'calm' },
};

const scriptScene = (n, over = {}) => ({
  sceneNumber: n,
  sceneType: n === 1 ? 'title' : 'content',
  title: `Scene ${n}`,
  subtitle: n === 1 ? 'An introduction' : '',
  backgroundColor: '#112233',
  transition: 'fade',
  imagePrompt: '',
  cameraMotion: 'static',
  animation: '',
  scene_meta: { content: ['First point.', 'Second point.', 'Third point.', 'Fourth point.'] },
  audio: { text: `Narration for scene ${n}. The moon pulls on the oceans.`, voice: '', emotion: 'calm' },
  ...over,
});

const storyboardResponse = {
  scenes: [
    { sceneNumber: 1, layout: '', visual: { kind: 'none', prompt: '' }, cameraMotion: 'zoom-in', transition: 'fade' },
    { sceneNumber: 2, layout: 'timeline', visual: { kind: 'none', prompt: '' }, cameraMotion: 'static', transition: 'wipe' },
    { sceneNumber: 3, layout: 'split-image', visual: { kind: 'image', prompt: 'the moon rising over a calm harbour at dusk' }, cameraMotion: 'pan-left', transition: 'fade' },
  ],
};

// Routes each LLM call by which prompt it is, the way the real model would see them.
const mockLLM = ({ storyboard = storyboardResponse } = {}) => {
  LLMService.generateScript.mockImplementation(async (prompt) => {
    if (prompt.includes('executive producer')) return structureResponse;
    if (prompt.includes('director of a')) {
      if (storyboard instanceof Error) throw storyboard;
      return storyboard;
    }
    return { scenes: [scriptScene(1), scriptScene(2), scriptScene(3)] };
  });
};

const direct = (extra = {}) => AIDirectorService.direct({
  videoType: 'educational', topic: 'tides', language: 'english',
  sceneCount: 3, wordCount: 300, wordsPerScene: 100, durationMinutes: 1, jobId: 'job-1', ...extra,
});

beforeEach(() => { LLMService.generateScript.mockReset(); config.imageGen.enabled = true; });
afterAll(() => { config.imageGen.enabled = false; });

describe('AIDirectorService with the storyboard pass', () => {
  it('returns the brief and gives every scene a storyboard', async () => {
    mockLLM();
    const result = await direct();

    expect(result.brief).toMatchObject({ videoType: 'educational', imageBudget: 1, storyboardSource: 'director' });
    expect(result.brief.beats).toHaveLength(1);
    expect(result.scenes).toHaveLength(3);
    expect(result.scenes.map((s) => s.storyboard.layout)).toEqual(['title-only', 'timeline', 'split-image']);
    expect(result.scenes.map((s) => s.storyboard.cameraMotion)).toEqual(['zoom-in', 'static', 'pan-left']);
    expect(result.scenes.map((s) => s.transition)).toEqual(['fade', 'wipe', 'fade']);
  });

  it('turns the planner\'s image choice into an image-bearing scene with a styled prompt', async () => {
    mockLLM();
    const { scenes } = await direct();
    expect(scenes[2].sceneType).toBe('contentwithimage');
    // The Director's prompt keeps the model's subject and shared palette, then adds the scene's framing and audience.
    expect(scenes[2].imagePrompt).toMatch(/^the moon rising over a calm harbour at dusk, warm teal, /);
    expect(scenes[2].imagePrompt).toContain('resolved composition');
    expect(scenes[2].imagePrompt).toContain('curious learners');
    expect(scenes[2].storyboard.visual).toMatchObject({ kind: 'image', status: 'pending' });
    expect(scenes[1].imagePrompt).toBe('');
  });

  it('still produces a complete storyboard when the planner call fails', async () => {
    mockLLM({ storyboard: new Error('model unavailable') });
    const result = await direct();
    expect(result.brief.storyboardSource).toBe('default');
    expect(result.scenes).toHaveLength(3);
    expect(result.scenes.every((s) => s.storyboard && s.storyboard.source === 'default')).toBe(true);
    // the motion pass filled in a camera move for every scene
    expect(result.scenes.every((s) => s.storyboard.cameraMotion)).toBe(true);
  });

  it('asks for no pictures at all when image generation is off', async () => {
    config.imageGen.enabled = false;
    mockLLM();
    const result = await direct();
    expect(result.brief.imageBudget).toBe(0);
    expect(result.scenes.every((s) => s.storyboard.visual.kind === 'none' && !s.imagePrompt)).toBe(true);
    expect(result.scenes.map((s) => s.sceneType)).toEqual(['title', 'content', 'content']);
  });

  it('uses the caller\'s title and threads extra instructions into the script prompts', async () => {
    mockLLM();
    const result = await direct({ titleOverride: 'Lesson 4: Tides', extraInstructions: '- cover ONLY tides' });
    expect(result.title).toBe('Lesson 4: Tides');
    const prompts = LLMService.generateScript.mock.calls.map(([p]) => p);
    expect(prompts.filter((p) => p.includes('- cover ONLY tides')).length).toBeGreaterThanOrEqual(2); // structure + scenes
    expect(result.brief.extraInstructions).toBe('- cover ONLY tides');
  });

  it('does not storyboard podcasts with the model', async () => {
    mockLLM();
    LLMService.generateScript.mockImplementation(async (prompt) => {
      if (prompt.includes('executive producer')) return structureResponse;
      if (prompt.includes('director of a')) throw new Error('should not be asked');
      return { scenes: [1, 2, 3].map((n) => scriptScene(n, { sceneType: 'podcast', speaker: n % 2 ? 'host' : 'guest' })) };
    });
    const result = await direct({ videoType: 'podcast', hostVoice: 'custom:Ryan', guestVoice: 'custom:Serena' });
    expect(result.scenes.every((s) => s.sceneType === 'podcast' && s.storyboard.layout === '')).toBe(true);
  });
});

describe('storyboard survives validation and reaches the render props', () => {
  it('ScriptParserService.validate keeps the storyboard and brief', async () => {
    mockLLM();
    const raw = await direct();
    const script = ScriptParserService.validate(raw, 'educational', { seed: 'job-1' });

    expect(script.brief).toEqual(raw.brief);
    expect(script.scenes[1].storyboard).toMatchObject({ layout: 'timeline', cameraMotion: 'static' });
    expect(script.scenes[2].sceneType).toBe('contentwithimage');
    expect(script.scenes[2].imagePrompt).toContain('the moon rising');
  });

  it('a script that was never storyboarded validates to storyboard null', () => {
    const script = ScriptParserService.validate({ title: 'Old', scenes: [scriptScene(1), scriptScene(2)] }, 'educational', { seed: 's' });
    expect(script.brief).toBeNull();
    expect(script.scenes.every((s) => s.storyboard === null)).toBe(true);
  });

  it('the IR carries the layout to the renderer and keeps the storyboard out of the render props', async () => {
    mockLLM();
    const script = ScriptParserService.validate(await direct(), 'educational', { seed: 'job-1' });
    const { ir, ok } = compile({ jobId: 'job-1', script, jobConfig: { type: 'educational' }, stage: 'script' });
    expect(ok).toBe(true);
    expect(ir.scenes.map((s) => s.layout)).toEqual(['title-only', 'timeline', 'split-image']);
    expect(ir.scenes[1].storyboard).toMatchObject({ layout: 'timeline' });

    const props = toRenderProps(ir);
    expect(props.scenes.map((s) => s.layout)).toEqual(['title-only', 'timeline', 'split-image']);
    expect(props.scenes[1].storyboard).toBeUndefined();
  });
});
