/**
 * Malformed model output must be detected, repaired once, validated again and -
 * if it is still wrong - replaced by the deterministic default. At no point may
 * it reach the renderer. These tests drive the whole Director with a model that
 * misbehaves in specific ways and check what comes out the other end.
 */
jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(),
  llm: jest.fn(), tts: jest.fn(), render: jest.fn(), upload: jest.fn(),
}));
jest.mock('../../src/services/common/LLMService', () => ({ generateScript: jest.fn() }));

const LLMService = require('../../src/services/common/LLMService');
const config = require('../../src/config');
const AIDirectorService = require('../../src/services/director/AIDirectorService');
const Storyboard = require('../../src/services/director/StoryboardPlanningService');
const StoryStructureService = require('../../src/services/director/StoryStructureService');
const ScriptParserService = require('../../src/services/video/ScriptParserService');
const { compile } = require('../../src/ir');
const { LAYOUT_IDS } = require('../../src/ir/templateRegistry');
const { TRANSITION_REGISTRY, CAMERA_REGISTRY } = require('../../src/ir/compositionRegistry');

const goodStructure = {
  title: 'Tides', description: 'How tides work', tags: ['tides'], thumbnailPrompt: 'a harbour',
  beats: [{ beatIndex: 1, purpose: 'Explain tides', sceneRange: [1, 4], toneNote: 'calm' }],
  styleGuide: { visualPalette: 'warm teal', motionVocabulary: 'static, zoom-in', voiceTone: 'calm' },
};

const scriptScene = (n) => ({
  sceneNumber: n,
  sceneType: n === 1 ? 'title' : 'content',
  title: `Scene ${n}`,
  subtitle: n === 1 ? 'An introduction' : '',
  backgroundColor: '#112233',
  transition: 'fade',
  imagePrompt: '',
  cameraMotion: 'static',
  animation: '',
  scene_meta: { content: ['First point.', 'Second point.', 'Third point.'] },
  audio: { text: `Narration for scene ${n}. The moon pulls on the oceans.`, voice: '', emotion: 'calm' },
});

const sceneNarrationResponse = { scenes: [1, 2, 3, 4].map(scriptScene) };

const entry = (n, over = {}) => ({
  sceneNumber: n, purpose: 'explanation', strategy: 'list', layout: 'stack-list',
  visual: { kind: 'none', prompt: '' }, cameraMotion: 'static', transition: 'fade', ...over,
});

/**
 * @param {object} behaviour
 * @param {Function} behaviour.storyboard  (callIndex, prompt) => response, for each storyboard call
 * @param {Function} [behaviour.structure] (callIndex, prompt) => response
 */
const mockLLM = ({ storyboard, structure = () => goodStructure }) => {
  const calls = { storyboard: [], structure: [] };
  LLMService.generateScript.mockImplementation(async (prompt) => {
    if (prompt.includes('executive producer')) {
      calls.structure.push(prompt);
      return structure(calls.structure.length - 1, prompt);
    }
    if (prompt.includes('director of a')) {
      calls.storyboard.push(prompt);
      return storyboard(calls.storyboard.length - 1, prompt);
    }
    return sceneNarrationResponse;
  });
  return calls;
};

const direct = () => AIDirectorService.direct({
  videoType: 'educational', topic: 'tides', language: 'english',
  sceneCount: 4, wordCount: 400, wordsPerScene: 100, durationMinutes: 1, jobId: 'job-1',
});

/** The renderer-facing guarantee: every choice on every scene is one Remotion has. */
const expectRenderable = (scenes) => {
  for (const s of scenes) {
    expect(['', ...LAYOUT_IDS]).toContain(s.storyboard.layout);
    expect(CAMERA_REGISTRY).toContain(s.cameraMotion);
    expect(TRANSITION_REGISTRY).toContain(s.transition);
  }
};

beforeEach(() => {
  LLMService.generateScript.mockReset();
  config.imageGen.enabled = true;
  config.director.maxRepairs = 1;
});
afterAll(() => { config.imageGen.enabled = false; });

describe('storyboard output', () => {
  it('detects an invalid entry, asks the model to correct just that scene, and uses the correction', async () => {
    const calls = mockLLM({
      storyboard: (i) => (i === 0
        ? { scenes: [entry(1, { layout: 'title-only' }), entry(2, { layout: 'carousel', transition: 'spin' }), entry(3, { layout: 'grid' }), entry(4)] }
        : { scenes: [entry(2, { layout: 'timeline', transition: 'wipe' })] }),
    });
    const { scenes, brief } = await direct();

    expect(calls.storyboard).toHaveLength(2);
    // The repair prompt names the scene and the problem, and asks only for it.
    expect(calls.storyboard[1]).toContain('scene 2:');
    expect(calls.storyboard[1]).toMatch(/layout/);
    expect(calls.storyboard[1]).toMatch(/exactly one corrected entry for each of these scenes: 2/);

    expect(brief.storyboardSource).toBe('director');
    expect(brief.directorPlan.validation).toMatchObject({ repairs: 1, rejectedScenes: [] });
    expect(scenes[1].storyboard.source).toBe('director');
    expectRenderable(scenes);
  });

  it('validates the correction again: a model that stays wrong gets the default for that scene only', async () => {
    mockLLM({
      storyboard: (i) => (i === 0
        ? { scenes: [entry(1, { layout: 'title-only' }), entry(2, { layout: 'carousel' }), entry(3, { layout: 'grid' }), entry(4)] }
        : { scenes: [entry(2, { layout: 'still-not-a-layout' })] }),
    });
    const { scenes, brief } = await direct();

    expect(brief.directorPlan.validation.rejectedScenes).toEqual([2]);
    expect(scenes[1].storyboard.source).toBe('default'); // no model entry survived for scene 2
    expect(scenes[0].storyboard.source).toBe('director');
    expect(scenes[2].storyboard.source).toBe('director');
    expectRenderable(scenes);
  });

  it('does not fail the job when the correction call itself errors', async () => {
    mockLLM({
      storyboard: (i) => {
        if (i === 0) return { scenes: [entry(1), entry(2, { cameraMotion: 'barrel-roll' }), entry(3), entry(4)] };
        throw new Error('model unavailable');
      },
    });
    const { scenes, brief } = await direct();
    expect(scenes).toHaveLength(4);
    expect(brief.directorPlan.validation.rejectedScenes).toEqual([2]);
    expectRenderable(scenes);
  });

  it('skips correction entirely when DIRECTOR_MAX_REPAIRS is 0', async () => {
    config.director.maxRepairs = 0;
    const calls = mockLLM({ storyboard: () => ({ scenes: [entry(1), entry(2, { layout: 'carousel' }), entry(3), entry(4)] }) });
    const { brief } = await direct();
    expect(calls.storyboard).toHaveLength(1);
    expect(brief.directorPlan.validation).toMatchObject({ repairs: 0, rejectedScenes: [2] });
  });

  it('accepts a near-miss (casing, separators) without spending a correction on it', async () => {
    const calls = mockLLM({
      storyboard: () => ({ scenes: [entry(1, { layout: 'Title Only' }), entry(2, { transition: 'SlideUp', cameraMotion: 'Zoom In' }), entry(3), entry(4)] }),
    });
    const { scenes } = await direct();
    expect(calls.storyboard).toHaveLength(1);
    expect(scenes[1].storyboard.source).toBe('director');
    expectRenderable(scenes);
  });

  it.each([
    ['not JSON-shaped at all', () => 'sorry, I cannot do that'],
    ['an object with no scenes', () => ({ note: 'hello' })],
    ['scenes that are not a list', () => ({ scenes: 'nope' })],
    ['a list of junk', () => ({ scenes: [null, 4, 'x', [], {}] })],
    ['null', () => null],
  ])('survives a model that returns %s', async (_name, response) => {
    mockLLM({ storyboard: response });
    const { scenes, brief } = await direct();
    expect(scenes).toHaveLength(4);
    expect(brief.storyboardSource).toBe('default');
    expect(brief.directorPlan).not.toBeNull();
    expectRenderable(scenes);
  });

  it('never lets an unknown value through into a scene, whatever the model sends', async () => {
    mockLLM({
      storyboard: () => ({
        scenes: [1, 2, 3, 4].map((n) => entry(n, {
          layout: '<script>alert(1)</script>', cameraMotion: 'warp', transition: 'explode', purpose: 'vibes', strategy: 'collage',
        })),
      }),
    });
    const { scenes } = await direct();
    expectRenderable(scenes);
    expect(JSON.stringify(scenes)).not.toContain('<script>');
  });
});

describe('story structure output', () => {
  it('repairs a plan whose beats are unusable, then uses the corrected plan', async () => {
    const calls = mockLLM({
      structure: (i) => (i === 0 ? { ...goodStructure, beats: [{ beatIndex: 1, purpose: '', sceneRange: [4, 1] }] } : goodStructure),
      storyboard: () => ({ scenes: [] }),
    });
    const structure = await StoryStructureService.plan({ videoType: 'educational', topic: 'tides', language: 'english', sceneCount: 4, durationMinutes: 1 });

    expect(calls.structure).toHaveLength(2);
    expect(calls.structure[1]).toContain('Your previous answer had problems');
    expect(structure.validated).toBe(true);
    expect(structure.repairs).toBe(1);
    expect(structure.beats[0].purpose).toBe('Explain tides');
  });

  it('falls back to a one-beat plan, with no style guide, when the model cannot produce a valid one', async () => {
    mockLLM({ structure: () => ({ title: 'T', beats: 'garbage' }), storyboard: () => ({ scenes: [] }) });
    const structure = await StoryStructureService.plan({ videoType: 'educational', topic: 'tides', language: 'english', sceneCount: 4, durationMinutes: 1 });
    expect(structure.validated).toBe(false);
    expect(structure.beats).toEqual([{ beatIndex: 1, purpose: 'Cover tides start to finish', sceneRange: [1, 4], toneNote: '' }]);
    expect(structure.styleGuide).toEqual({ visualPalette: '', motionVocabulary: '', voiceTone: '' });
    expect(structure.title).toBe('T'); // a usable title from the rejected answer is still kept
  });

  it('keeps going end to end when the structure is hopeless', async () => {
    mockLLM({ structure: () => null, storyboard: () => ({ scenes: [] }) });
    const result = await direct();
    expect(result.scenes).toHaveLength(4);
    expect(result.title).toBe('tides');
    expectRenderable(result.scenes);
  });
});

describe('what reaches Remotion', () => {
  it('a Director script validates and compiles clean even after the model misbehaved', async () => {
    mockLLM({
      storyboard: (i) => (i === 0
        ? { scenes: [entry(1, { layout: 'title-only' }), entry(2, { layout: 'nope' }), entry(3, { transition: 'spin' }), entry(4)] }
        : { scenes: [entry(2), entry(3)] }),
    });
    const script = await direct();
    const validated = ScriptParserService.validate(script, 'educational', { seed: 'job-1' });
    const { ok, issues } = compile({ jobId: 'job-1', script: validated, jobConfig: { type: 'educational' }, stage: 'script' });
    expect(issues.filter((x) => x.severity === 'error')).toEqual([]);
    expect(ok).toBe(true);
  });

  it('the stored plan is the validated, renderer-safe one', async () => {
    mockLLM({ storyboard: () => ({ scenes: [entry(1), entry(2), entry(3), entry(4)] }) });
    const { brief } = await direct();
    expect(brief.directorPlan.version).toBe(1);
    expect(brief.directorVersion).toBe(2);
    expect(brief.llmModel).toBe(config.ollama.model);
    for (const s of brief.directorPlan.scenes) expect(CAMERA_REGISTRY).toContain(s.motion.cameraMotion);
  });
});

describe('Storyboard.plan reports what it rejected', () => {
  it('returns repairs and the rejected scene numbers', async () => {
    mockLLM({ storyboard: () => ({ scenes: [entry(1), entry(2, { layout: 'x' })] }) });
    const scenes = [1, 2].map(scriptScene);
    const out = await Storyboard.plan({
      scenes, structure: goodStructure, videoType: 'educational', topic: 't', language: 'english', imageBudget: 0, jobId: 'job-1',
    });
    expect(out.rejected).toEqual([2]);
    expect(out.repairs).toBe(1);
    expect([...out.entries.keys()]).toEqual([1]);
  });
});
