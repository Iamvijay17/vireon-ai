// The compiler pulls in the whole service layer at require time; none of it
// is exercised by topology tests, so stub it out rather than booting Mongo.
jest.mock('../../src/services/audio/audioService', () => ({ generateSceneAudio: jest.fn(), predictCacheKey: jest.fn() }));
jest.mock('../../src/services/avatar/avatarService', () => ({ resolveDefaultSourceImage: jest.fn(), animatePortrait: jest.fn() }));
jest.mock('../../src/services/avatar/narrationTrack', () => ({ buildNarrationTrack: jest.fn() }));
jest.mock('../../src/services/video/RemotionService', () => ({ prepareAssets: jest.fn(), renderVideo: jest.fn() }));
jest.mock('../../src/services/storage/StorageService', () => ({ cleanupJob: jest.fn() }));
jest.mock('../../src/services/storage/providers', () => ({ getStorageProvider: jest.fn() }));

const { compileVideoGraph } = require('../../src/core/graph/videoStepGraph');
const { analyze, analyzeParallelism } = require('../../src/core/graph/DagRunner');

const scene = (n, overrides = {}) => ({
  sceneNumber: n,
  sceneType: 'text',
  audio: { text: `narration ${n}` },
  ...overrides,
});

const compile = (scenes, videoJob = {}) =>
  compileVideoGraph({
    jobId: 'job-TEST1234',
    ir: { scenes },
    videoJob: { avatarEnabled: false, ...videoJob },
    handlers: {},
  });

describe('compileVideoGraph', () => {
  it('produces a valid, acyclic graph', () => {
    expect(() => analyze(compile([scene(1), scene(2)]))).not.toThrow();
  });

  it('gives every narrated scene its own audio node with no sibling edges', () => {
    const nodes = compile([scene(1), scene(2), scene(3)]);
    const audio = nodes.filter((n) => n.id.startsWith('scene.audio.'));

    expect(audio.map((n) => n.id)).toEqual(['scene.audio.1', 'scene.audio.2', 'scene.audio.3']);
    // The whole reason for the DAG: no scene waits on another scene.
    expect(audio.every((n) => n.deps.length === 0)).toBe(true);
  });

  it('skips the audio node for a scene with no narration', () => {
    const nodes = compile([scene(1), scene(2, { audio: { text: '' } })]);
    expect(nodes.map((n) => n.id)).toContain('scene.audio.1');
    expect(nodes.map((n) => n.id)).not.toContain('scene.audio.2');
  });

  it('adds an image node only for an image-bearing scene type with a prompt', () => {
    const nodes = compile([
      scene(1, { sceneType: 'image', imagePrompt: 'a cat' }),
      scene(2, { sceneType: 'contentWithImage'.toLowerCase(), imagePrompt: 'a dog' }),
      scene(3, { sceneType: 'image' }), // no prompt
      scene(4, { sceneType: 'text', imagePrompt: 'ignored' }), // not image-bearing
    ]);
    const ids = nodes.map((n) => n.id);
    expect(ids).toContain('scene.image.1');
    expect(ids).toContain('scene.image.2');
    expect(ids).not.toContain('scene.image.3');
    expect(ids).not.toContain('scene.image.4');
  });

  it('includes an avatar node only when the job enables it', () => {
    expect(compile([scene(1)], { avatarEnabled: false }).map((n) => n.id)).not.toContain('avatar');
    expect(compile([scene(1)], { avatarEnabled: true }).map((n) => n.id)).toContain('avatar');
  });

  it('makes compose wait on every piece of scene work, including the avatar', () => {
    const nodes = compile(
      [scene(1), scene(2, { sceneType: 'image', imagePrompt: 'x' })],
      { avatarEnabled: true }
    );
    const compose = nodes.find((n) => n.id === 'compose');

    expect(compose.deps.sort()).toEqual(
      ['avatar', 'scene.audio.1', 'scene.audio.2', 'scene.image.2'].sort()
    );
  });

  it('keeps compose -> render -> upload strictly sequential', () => {
    const nodes = compile([scene(1)]);
    expect(nodes.find((n) => n.id === 'render').deps).toEqual(['compose']);
    expect(nodes.find((n) => n.id === 'upload').deps).toEqual(['render']);
  });

  it('collapses N scenes into 4 levels instead of N sequential steps', () => {
    const nodes = compile([scene(1), scene(2), scene(3), scene(4), scene(5)]);
    const { levels, maxWidth } = analyzeParallelism(nodes);

    // scene work -> compose -> render -> upload, with all 5 scenes at depth 0.
    expect(levels).toBe(4);
    expect(maxWidth).toBe(5);
  });

  it('still produces a runnable graph for a script with no scenes', () => {
    const nodes = compile([]);
    expect(nodes.map((n) => n.id)).toEqual(['compose', 'render', 'upload']);
    expect(nodes.find((n) => n.id === 'compose').deps).toEqual([]);
    expect(() => analyze(nodes)).not.toThrow();
  });
});
