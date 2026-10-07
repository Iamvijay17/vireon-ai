/**
 * The IR can only become the source of render props (IR_MODE=authoritative) if it
 * produces exactly what the legacy builder in RemotionService.prepareAssets does.
 * "Shadow mode" logs disagreements on real jobs; this test is the same comparison
 * run over a spread of realistic scripts in CI, so a field added to one builder
 * and forgotten in the other fails here instead of in a render.
 */
jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(), render: jest.fn(),
}));
jest.mock('../../src/services/common/MetricsService', () => ({ recordDuration: jest.fn(), increment: jest.fn() }));
jest.mock('../../src/services/common/JobEventService', () => ({ append: jest.fn().mockResolvedValue() }));
jest.mock('../../src/services/storage/providers', () => ({
  getStorageProvider: () => ({ getPublicUrl: (id, category, file) => `http://minio/${id}/${category}/${file}` }),
}));

const fs = require('fs');
const config = require('../../src/config');
const RemotionService = require('../../src/services/video/RemotionService');
const ScriptParserService = require('../../src/services/video/ScriptParserService');
const { compile } = require('../../src/ir');
const { toRenderProps, diffRenderProps } = require('../../src/ir/toRenderProps');

const originalMode = config.ir.mode;
const originalGenerative = config.generativeEngine.enabled;

beforeEach(() => {
  config.ir.mode = 'shadow';
  jest.spyOn(fs.promises, 'mkdir').mockResolvedValue();
  jest.spyOn(fs.promises, 'writeFile').mockResolvedValue();
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => { config.ir.mode = originalMode; config.generativeEngine.enabled = originalGenerative; });

const raw = (n, over = {}) => ({
  sceneNumber: n,
  sceneType: n === 1 ? 'title' : 'content',
  title: `Scene ${n}`,
  subtitle: n === 1 ? 'Intro' : '',
  backgroundColor: '#112233',
  transition: 'fade',
  imagePrompt: '',
  cameraMotion: 'static',
  animation: '',
  scene_meta: { content: ['One.', 'Two.', 'Three.'] },
  audio: { text: `Narration ${n}.`, voice: 'custom:Ryan', emotion: 'calm' },
  ...over,
});

// Gives each scene the audio fields TTS would have written.
const withAudio = (script) => ({
  ...script,
  scenes: script.scenes.map((s) => ({
    ...s,
    duration: 6,
    audio: { ...s.audio, file: `scene${s.sceneNumber}.mp3`, duration: 6, captionTimestamps: [{ word: 'Hi', start: 0, end: 0.4 }] },
  })),
});

const validated = (scenes, type = 'educational') =>
  withAudio(ScriptParserService.validate({ title: 'A video', description: 'About things', tags: ['a'], scenes }, type, { seed: 'job-1', hostName: 'Hana', guestName: 'Gus' }));

const storyboard = (over = {}) => ({ beat: 1, intent: 'x', layout: '', visual: { kind: 'none', prompt: '', status: 'none' }, cameraMotion: 'zoom-in', transition: 'fade', source: 'director', ...over });

const cases = {
  'plain educational script (never storyboarded)': () => validated([raw(1), raw(2), raw(3)]),
  'storyboarded script with a layout choice': () => validated([
    raw(1, { storyboard: storyboard() }),
    raw(2, { storyboard: storyboard({ layout: 'timeline', cameraMotion: 'pan-left' }) }),
    raw(3, { storyboard: storyboard({ layout: 'grid' }), transition: 'wipe' }),
  ]),
  'script with a generated image applied': () => {
    const script = validated([
      raw(1),
      raw(2, { sceneType: 'contentwithimage', imagePrompt: 'a lighthouse at dusk', storyboard: storyboard({ layout: 'split-image', visual: { kind: 'image', prompt: 'a lighthouse at dusk', status: 'pending' } }) }),
    ]);
    script.scenes[1].imageUrl = 'http://minio/job-1/image/img-abc.png';
    script.scenes[1].elements = { ...script.scenes[1].elements, image: script.scenes[1].imageUrl };
    return script;
  },
  'scene that fell back to text after a failed image': () => {
    const script = validated([raw(1), raw(2, { sceneType: 'contentwithimage', imagePrompt: 'a lighthouse at dusk' })]);
    script.scenes[1] = { ...script.scenes[1], sceneType: 'content', imagePrompt: '', imageUrl: '', storyboard: storyboard({ visual: { kind: 'none', status: 'degraded', reason: 'x' } }) };
    return script;
  },
  'podcast with two speakers and a shared cover image': () => {
    const script = validated(
      [1, 2, 3, 4].map((n) => raw(n, { sceneType: 'podcast', speaker: n % 2 ? 'host' : 'guest', imagePrompt: 'warm studio, soft light' })),
      'podcast'
    );
    script.scenes.forEach((s) => { s.imageUrl = 'http://minio/job-1/image/cover.png'; s.elements = { ...s.elements, hostImage: s.imageUrl }; });
    return script;
  },
  'narration made by the segmented TTS pipeline (carries a segment timeline)': () => {
    const script = validated([raw(1), raw(2)]);
    script.scenes[0].audio.segments = [
      { id: 's01-seg001', sourceText: 'Narration 1.', startMs: 0, endMs: 2000, durationMs: 2000 },
      { id: 's01-seg002', sourceText: 'More.', startMs: 2300, endMs: 3100, durationMs: 800 },
    ];
    return script;
  },
  'legacy hand-coded templates': () => {
    config.generativeEngine.enabled = false;
    const script = validated([raw(1), raw(2), raw(3, { sceneType: 'contentwithimage', imagePrompt: 'a cat at a desk' })]);
    script.scenes[2].imageUrl = 'https://images.example.com/cat.png'; // a manually pasted image
    return script;
  },
};

const jobConfig = (over = {}) => ({
  type: 'educational', language: 'english', resolution: '1920x1080', aspectRatio: '16:9',
  quality: 'standard', fontPairing: 'modern-sans', captionAnimation: 'popScale', ...over,
});

describe('legacy builder and IR agree', () => {
  beforeEach(() => { config.generativeEngine.enabled = true; });

  it.each(Object.keys(cases))('%s', async (name) => {
    const script = cases[name]();
    const legacy = await RemotionService.prepareAssets('job-1', script, jobConfig());

    const { ir, ok, issues } = compile({
      jobId: 'job-1', script, jobConfig: jobConfig(), stage: 'render',
      audioUrlFor: (n) => `http://minio/job-1/audio/scene${n}.mp3`,
    });
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(ok).toBe(true);

    expect(diffRenderProps(legacy, toRenderProps(ir))).toEqual([]);
  });

  it('passes the segment timeline to the renderer, and only for scenes that have one', async () => {
    const script = cases['narration made by the segmented TTS pipeline (carries a segment timeline)']();
    const legacy = await RemotionService.prepareAssets('job-1', script, jobConfig());
    expect(legacy.scenes[0].audio.timeline).toEqual([
      { segmentId: 's01-seg001', text: 'Narration 1.', startMs: 0, endMs: 2000, durationMs: 2000 },
      { segmentId: 's01-seg002', text: 'More.', startMs: 2300, endMs: 3100, durationMs: 800 },
    ]);
    expect(legacy.scenes[1].audio).not.toHaveProperty('timeline');
  });

  it('actually carries the layout through both builders', async () => {
    const script = cases['storyboarded script with a layout choice']();
    const legacy = await RemotionService.prepareAssets('job-1', script, jobConfig());
    expect(legacy.scenes.map((s) => s.layout)).toEqual(['', 'timeline', 'grid']);
  });
});
