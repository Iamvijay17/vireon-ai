jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), llm: jest.fn(),
}));
jest.mock('../../src/services/common/LLMService', () => ({ generateScript: jest.fn() }));

const LLMService = require('../../src/services/common/LLMService');
const ScriptParserService = require('../../src/services/video/ScriptParserService');
const { convertSceneType } = require('../../src/services/video/sceneConversion');

const job = {
  type: 'educational',
  topic: 'How volcanoes form',
  language: 'English',
  hostName: 'Host',
  guestName: 'Guest',
  script: { brief: { styleGuide: { visualPalette: 'warm earth tones' } } },
};

const contentScene = (over = {}) => ({
  sceneNumber: 3,
  sceneType: 'content',
  templateId: '004-content',
  title: 'Magma rises',
  subtitle: '',
  audio: { text: 'Molten rock climbs through cracks in the crust. Pressure builds beneath the surface.', file: 'scene3.mp3', duration: 6 },
  elements: { title: 'Magma rises', items: [{ heading: '', text: 'old' }], backgroundColor: '#112233', styleConfig: { accentColor: '#f00' } },
  imagePrompt: '',
  imageUrl: '',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  LLMService.generateScript.mockResolvedValue({ imagePrompt: 'A glowing magma chamber under a mountain, dramatic side lighting, painterly style' });
});

const isContentWithImageTemplate = (id) =>
  id === ScriptParserService.GENERATIVE_TEMPLATE_ID || ScriptParserService.SCENE_TYPE_TEMPLATE_IDS.contentwithimage.includes(id);

describe('convertSceneType', () => {
  test('content -> contentwithimage builds the full scene and drafts an image prompt', async () => {
    const { patch, promptSource } = await convertSceneType(contentScene(), 'contentwithimage', job);

    expect(patch.sceneType).toBe('contentwithimage');
    expect(isContentWithImageTemplate(patch.templateId)).toBe(true);
    // body is the lead sentence, not the old bullet rows
    expect(patch.subtitle).toBe('Molten rock climbs through cracks in the crust.');
    expect(patch.elements).toMatchObject({ title: 'Magma rises', body: patch.subtitle, image: '' });
    expect(patch.elements.items).toBeUndefined();
    // the style/background picks survive the conversion
    expect(patch.elements.backgroundColor).toBe('#112233');
    expect(patch.elements.styleConfig).toEqual({ accentColor: '#f00' });

    expect(promptSource).toBe('llm');
    expect(patch.imagePrompt).toContain('magma chamber');
    expect(patch.imagePrompt).toContain('warm earth tones');
    expect(patch.imageUrl).toBe('');
    // the LLM is told the shared look and the scene's narration
    expect(LLMService.generateScript.mock.calls[0][0]).toContain('warm earth tones');
    expect(LLMService.generateScript.mock.calls[0][0]).toContain('Molten rock climbs');
  });

  test('an existing image prompt and image are kept, with no LLM call', async () => {
    const scene = contentScene({ imagePrompt: 'my own prompt', imageUrl: 'http://x/pic.png' });
    const { patch, promptSource } = await convertSceneType(scene, 'contentwithimage', job);

    expect(promptSource).toBe('existing');
    expect(patch.imagePrompt).toBe('my own prompt');
    expect(patch.imageUrl).toBe('http://x/pic.png');
    expect(patch.elements.image).toBe('http://x/pic.png');
    expect(LLMService.generateScript).not.toHaveBeenCalled();
  });

  test('falls back to a prompt built from the scene text when the LLM fails', async () => {
    LLMService.generateScript.mockRejectedValue(new Error('Ollama failed after 3 attempts'));
    const { patch, promptSource } = await convertSceneType(contentScene(), 'contentwithimage', job);

    expect(promptSource).toBe('fallback');
    expect(patch.imagePrompt).toContain('Magma rises');
    expect(patch.imagePrompt).toContain('warm earth tones');
  });

  test('falls back when the LLM returns no usable prompt', async () => {
    LLMService.generateScript.mockResolvedValue({ imagePrompt: '' });
    const { promptSource } = await convertSceneType(contentScene(), 'contentwithimage', job);
    expect(promptSource).toBe('fallback');
  });

  test('a scene with no title and no narration gets no prompt rather than an invented one', async () => {
    const scene = contentScene({ title: '', audio: { text: '' } });
    const { patch, promptSource } = await convertSceneType(scene, 'contentwithimage', job);

    expect(promptSource).toBe('none');
    expect(patch.imagePrompt).toBe('');
    expect(LLMService.generateScript).not.toHaveBeenCalled();
  });

  test('contentwithimage -> content drops the image fields and rebuilds the rows from narration', async () => {
    const scene = contentScene({
      sceneType: 'contentwithimage',
      templateId: '001-contentwithimage',
      subtitle: 'Body',
      imagePrompt: 'a volcano',
      imageUrl: 'http://x/v.png',
      elements: { title: 'Magma rises', body: 'Body', image: 'http://x/v.png', badge: '' },
    });
    const { patch, promptSource } = await convertSceneType(scene, 'content', job);

    expect(patch.sceneType).toBe('content');
    expect(patch.imagePrompt).toBe('');
    expect(patch.imageUrl).toBe('');
    expect(patch.elements.image).toBeUndefined();
    expect(patch.elements.items.map((i) => i.text)).toEqual([
      'Molten rock climbs through cracks in the crust.',
      'Pressure builds beneath the surface.',
    ]);
    expect(promptSource).toBe('none');
    expect(LLMService.generateScript).not.toHaveBeenCalled();
  });

  test('the storyboard follows the scene: layout reset, visual pending for a new image', async () => {
    const scene = contentScene({ storyboard: { beat: 2, layout: 'stack-list', visual: { kind: 'none', prompt: '', status: 'none' }, source: 'director' } });
    const { patch } = await convertSceneType(scene, 'contentwithimage', job);

    expect(patch.storyboard).toMatchObject({ beat: 2, layout: '', source: 'director' });
    expect(patch.storyboard.visual).toEqual({ kind: 'image', prompt: patch.imagePrompt, status: 'pending' });
  });

  test('a scene with no storyboard stays without one', async () => {
    const { patch } = await convertSceneType(contentScene(), 'contentwithimage', job);
    expect('storyboard' in patch).toBe(false);
  });

  test('the storyboard visual is cleared when converting away from an image type', async () => {
    const scene = contentScene({
      sceneType: 'contentwithimage',
      imagePrompt: 'a volcano',
      imageUrl: 'http://x/v.png',
      storyboard: { layout: 'split-image', visual: { kind: 'image', prompt: 'a volcano', status: 'generated' } },
    });
    const { patch } = await convertSceneType(scene, 'content', job);

    expect(patch.storyboard.layout).toBe('');
    expect(patch.storyboard.visual).toEqual({ kind: 'none', prompt: '', status: 'none' });
  });

  test('podcast keeps its cover image fields', async () => {
    const scene = contentScene({ imagePrompt: 'studio set', imageUrl: 'http://x/cover.png', speaker: 'host' });
    const { patch } = await convertSceneType(scene, 'podcast', job);

    expect(patch.sceneType).toBe('podcast');
    expect(patch.imagePrompt).toBe('studio set');
    expect(patch.elements.hostImage).toBe('http://x/cover.png');
    expect(LLMService.generateScript).not.toHaveBeenCalled();
  });
});
