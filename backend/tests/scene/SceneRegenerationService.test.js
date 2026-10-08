jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../src/services/common/ActivityLogService', () => ({ add: jest.fn().mockResolvedValue() }));
jest.mock('../../src/services/pipeline/stageTracker', () => ({ invalidate: jest.fn().mockResolvedValue() }));
jest.mock('../../src/services/video/VideoService', () => ({ regenerateSceneImage: jest.fn() }));
jest.mock('../../src/services/scene/SceneVersionService', () => ({
  settle: jest.fn().mockResolvedValue([]),
  revert: jest.fn(),
  list: jest.fn().mockResolvedValue({ versions: [{ version: 2 }, { version: 1 }], activeVersion: 2 }),
}));

/**
 * A minimal stand-in for the Mongoose job document: scenes behave like subdocuments
 * (toObject / markModified) and save() records what was persisted.
 */
const mockState = { job: null, saved: 0, update: null, order: [] };

function mockSubdoc(plain) {
  return Object.assign(plain, {
    toObject() {
      const copy = JSON.parse(JSON.stringify(this));
      return copy;
    },
    markModified() {},
  });
}
function mockMakeJob(over = {}) {
  const scenes = (over.scenes || []).map((s) => mockSubdoc(s));
  return {
    _id: 'job-aaaaaaaa', status: 'COMPLETED', voice: 'female-1', fastAudio: false,
    script: { scenes },
    async save() { mockState.saved += 1; mockState.order.push('save'); },
    ...over,
    ...{ script: { scenes } },
  };
}
jest.mock('../../src/models/VideoJob', () => ({
  findById: jest.fn(async () => mockState.job),
  findByIdAndUpdate: jest.fn(async (_id, update) => {
    mockState.update = update;
    return { ...mockState.job, status: update.$set.status, progress: update.$set.progress };
  }),
}));

const VideoService = require('../../src/services/video/VideoService');
const SceneVersionService = require('../../src/services/scene/SceneVersionService');
const stageTracker = require('../../src/services/pipeline/stageTracker');
const ActivityLogService = require('../../src/services/common/ActivityLogService');
const Regen = require('../../src/services/scene/SceneRegenerationService');

const scene = (n, over = {}) => ({
  sceneId: `sce-0000000${n}`,
  sceneNumber: n,
  sceneType: 'content',
  templateId: 'generative',
  title: `Scene ${n}`,
  subtitle: '',
  imagePrompt: '',
  imageUrl: '',
  cameraMotion: 'static',
  transition: 'fade',
  elements: { title: `Scene ${n}`, items: [{ heading: '', text: 'One.' }, { heading: '', text: 'Two.' }, { heading: '', text: 'Three.' }], captionTimestamps: [1] },
  storyboard: { layout: 'stack-list', visual: { kind: 'none' } },
  audio: { text: `Narration ${n}.`, voice: 'female-1', emotion: '', duration: 5, file: `scene${n}.mp3`, captionTimestamps: [{ w: 'a' }], segments: [{ id: 's' }], ttsMeta: { x: 1 }, speechTimeline: { y: 1 } },
  ...over,
});
const imageScene = (n) => scene(n, {
  sceneType: 'contentwithimage', imagePrompt: 'a lighthouse at dusk', imageUrl: 'http://x/old.png',
  elements: { title: 'T', body: 'Body.', image: 'http://x/old.png', badge: '' },
  storyboard: { layout: 'split-image', visual: { kind: 'image', prompt: 'a lighthouse at dusk', variant: 0 } },
});

const sceneOf = (n) => mockState.job.script.scenes.find((s) => s.sceneNumber === n);
const snapshot = (n) => JSON.stringify(sceneOf(n));

beforeEach(() => {
  jest.clearAllMocks();
  mockState.saved = 0;
  mockState.update = null;
  mockState.order = [];
  SceneVersionService.settle.mockImplementation(async () => { mockState.order.push('settle'); return []; });
  mockState.job = mockMakeJob({ scenes: [scene(1), imageScene(2), scene(3)] });
  VideoService.regenerateSceneImage.mockResolvedValue({ _id: 'job-aaaaaaaa', status: 'GENERATING_IMAGES', progress: 56 });
});

describe('guards', () => {
  it.each(['QUEUED', 'SCRIPT_GENERATION', 'GENERATING_AUDIO', 'RENDERING', 'UPLOADING', 'AWAITING_APPROVAL', 'CANCELLED'])('refuses while the video is %s', async (status) => {
    mockState.job.status = status;
    await expect(Regen.regenerate('job-aaaaaaaa', 1, { target: 'voice' })).rejects.toThrow(/can be regenerated once it has finished/);
    expect(mockState.saved).toBe(0);
    expect(SceneVersionService.settle).not.toHaveBeenCalled();
  });

  it.each(['COMPLETED', 'FAILED', 'SCRIPT_COMPLETED', 'AUDIO_COMPLETED'])('allows it when the video is %s', async (status) => {
    mockState.job.status = status;
    await expect(Regen.regenerate('job-aaaaaaaa', 1, { target: 'voice' })).resolves.toBeDefined();
  });

  it('404s for an unknown scene before touching anything', async () => {
    await expect(Regen.regenerate('job-aaaaaaaa', 42, { target: 'voice' })).rejects.toThrow(/Scene 42 not found/);
    expect(SceneVersionService.settle).not.toHaveBeenCalled();
  });

  it('records the scene as a version BEFORE changing it, so the change can be undone', async () => {
    await Regen.regenerate('job-aaaaaaaa', 1, { target: 'voice' });
    expect(SceneVersionService.settle).toHaveBeenCalledWith('job-aaaaaaaa', expect.objectContaining({ reason: expect.stringContaining('before voice') }));
    expect(mockState.order).toEqual(['settle', 'save']);
  });

  it('validates the request shape', () => {
    const { regenerateSceneSchema: schema } = Regen;
    expect(schema.safeParse({ target: 'image' }).success).toBe(true);
    expect(schema.safeParse({ target: 'layout' }).success).toBe(false);
    expect(schema.safeParse({ target: 'layout', layout: 'carousel' }).success).toBe(false);
    expect(schema.safeParse({ target: 'style', preset: 'neon' }).success).toBe(false);
    expect(schema.safeParse({ target: 'script', text: '  ' }).success).toBe(false);
    expect(schema.safeParse({ target: 'dance' }).success).toBe(false);
  });
});

describe('regenerate voice', () => {
  it('clears only this scene\'s narration and leaves every other scene byte-for-byte alone', async () => {
    const before = { 2: snapshot(2), 3: snapshot(3) };
    await Regen.regenerate('job-aaaaaaaa', 1, { target: 'voice' });

    expect(sceneOf(1).audio).toMatchObject({ file: '', duration: 0, captionTimestamps: null });
    expect(sceneOf(1).audio.segments).toBeUndefined();
    expect(sceneOf(1).audio.speechTimeline).toBeUndefined();
    expect(snapshot(2)).toBe(before[2]);
    expect(snapshot(3)).toBe(before[3]);
    expect(mockState.saved).toBe(1);
  });

  it('keeps the text, title and layout - only the recording is redone', async () => {
    await Regen.regenerate('job-aaaaaaaa', 1, { target: 'voice' });
    expect(sceneOf(1).audio.text).toBe('Narration 1.');
    expect(sceneOf(1).title).toBe('Scene 1');
    expect(sceneOf(1).storyboard.layout).toBe('stack-list');
  });

  it('asks for a fresh take (bypassing the cache) when the voice is unchanged', async () => {
    await Regen.regenerate('job-aaaaaaaa', 1, { target: 'voice' });
    expect(sceneOf(1).audio.fresh).toBe(true);
  });

  it('a different voice is a different recording on its own - the cache may serve it', async () => {
    await Regen.regenerate('job-aaaaaaaa', 1, { target: 'voice', voice: 'male-2' });
    expect(sceneOf(1).audio.voice).toBe('male-2');
    expect(sceneOf(1).audio.fresh).toBeUndefined();
  });

  it('plans audio, captions, composition and render - and reuses script and image', async () => {
    const { plan } = await Regen.regenerate('job-aaaaaaaa', 2, { target: 'voice' });
    expect(plan.changed).toEqual(['audio']);
    expect(plan.regenerate).toEqual(['captions', 'scene-composition', 'render']);
    expect(plan.reusable).toEqual(expect.arrayContaining(['script', 'image', 'layout']));
    expect(plan.stages).toEqual(['audio', 'assets', 'render', 'upload']);
  });

  it('rewinds the job to audio only, invalidates from there, and keeps the existing video', async () => {
    const { job } = await Regen.regenerate('job-aaaaaaaa', 1, { target: 'voice' });
    expect(job.status).toBe('AUDIO_COMPLETED'); // not GENERATING_AUDIO: a manual-mode job must not stop and wait
    expect(stageTracker.invalidate).toHaveBeenCalledWith('job-aaaaaaaa', 'audio');
    expect(mockState.update.$set).not.toHaveProperty('videoUrl');
    expect(mockState.update.$unset).toMatchObject({ error: '' });
  });

  it('refuses a scene with no narration', async () => {
    sceneOf(1).audio.text = '';
    await expect(Regen.regenerate('job-aaaaaaaa', 1, { target: 'voice' })).rejects.toThrow(/no narration/);
  });
});

describe('change the script', () => {
  it('changes the narration and clears the recording, plan includes audio and captions', async () => {
    const { plan } = await Regen.regenerate('job-aaaaaaaa', 1, { target: 'script', text: 'Brand new narration.' });
    expect(sceneOf(1).audio.text).toBe('Brand new narration.');
    expect(sceneOf(1).audio.file).toBe('');
    expect(plan.regenerate).toEqual(['audio', 'captions', 'scene-composition', 'render']);
    expect(plan.reusable).toContain('image');
  });

  it('is a no-op when the narration did not change: nothing is cleared, nothing queued', async () => {
    const out = await Regen.regenerate('job-aaaaaaaa', 1, { target: 'script', text: 'Narration 1.' });
    expect(out.noop).toBe(true);
    expect(sceneOf(1).audio.file).toBe('scene1.mp3');
    expect(mockState.saved).toBe(0);
    expect(stageTracker.invalidate).not.toHaveBeenCalled();
  });
});

describe('change layout', () => {
  it('applies a compatible layout and rebuilds only the composition and render', async () => {
    const before = { 2: snapshot(2), 3: snapshot(3) };
    const { plan, job } = await Regen.regenerate('job-aaaaaaaa', 1, { target: 'layout', layout: 'grid' });

    expect(sceneOf(1).storyboard).toMatchObject({ layout: 'grid', source: 'user' });
    expect(plan).toMatchObject({ changed: ['layout'], regenerate: ['scene-composition', 'render'], produce: [] });
    expect(plan.reusable).toEqual(expect.arrayContaining(['script', 'audio', 'captions', 'image']));
    expect(job.status).toBe('PREPARING_ASSETS');
    expect(stageTracker.invalidate).toHaveBeenCalledWith('job-aaaaaaaa', 'assets');
    // no model runs, no audio touched, other scenes identical
    expect(sceneOf(1).audio.file).toBe('scene1.mp3');
    expect(snapshot(2)).toBe(before[2]);
    expect(snapshot(3)).toBe(before[3]);
  });

  it('refuses a layout that would drop the scene\'s content, naming the ones that fit', async () => {
    await expect(Regen.regenerate('job-aaaaaaaa', 1, { target: 'layout', layout: 'stat-highlight' }))
      .rejects.toThrow(/cannot show this scene's content.*Compatible layouts: .*stack-list/);
    expect(mockState.saved).toBe(0);
  });

  it('refuses an image layout for a scene without a picture', async () => {
    await expect(Regen.regenerate('job-aaaaaaaa', 1, { target: 'layout', layout: 'split-image' })).rejects.toThrow(/cannot show/);
  });

  it('refuses a layout on a scene drawn by a numbered template', async () => {
    sceneOf(1).templateId = '003-content';
    await expect(Regen.regenerate('job-aaaaaaaa', 1, { target: 'layout', layout: 'grid' })).rejects.toThrow(/numbered template/);
  });

  it('is a no-op when the scene already uses that layout', async () => {
    const out = await Regen.regenerate('job-aaaaaaaa', 1, { target: 'layout', layout: 'stack-list' });
    expect(out.noop).toBe(true);
    expect(mockState.saved).toBe(0);
  });
});

describe('apply a look', () => {
  it('"more cinematic" sets camera, transition and the composable slots', async () => {
    const { plan } = await Regen.regenerate('job-aaaaaaaa', 1, { target: 'style', preset: 'cinematic' });
    expect(sceneOf(1)).toMatchObject({ cameraMotion: 'zoom-in', transition: 'fade' });
    expect(sceneOf(1).composition).toMatchObject({ background: 'glow', textMotion: 'blurIn' });
    expect(plan.changed).toEqual(['layout', 'motion', 'transition']);
    expect(plan.produce).toEqual([]);
    expect(plan.stages).toEqual(['assets', 'render', 'upload']);
  });

  it('lets a picture do the moving instead of the camera', async () => {
    await Regen.regenerate('job-aaaaaaaa', 2, { target: 'style', preset: 'cinematic' });
    expect(sceneOf(2).cameraMotion).toBe('static');
    expect(sceneOf(2).composition.imageMotion).toBe('slowZoom');
  });

  it('keeps crowded text still', async () => {
    sceneOf(3).elements.items = Array.from({ length: 6 }, (_, i) => ({ heading: '', text: `Point ${i}.` }));
    await Regen.regenerate('job-aaaaaaaa', 3, { target: 'style', preset: 'dynamic' });
    expect(sceneOf(3).cameraMotion).toBe('static');
    expect(sceneOf(3).composition.decoration).toBe('dots');
  });

  it('does not touch the narration, picture or other scenes', async () => {
    const before = { audio: JSON.stringify(sceneOf(1).audio), 2: snapshot(2), 3: snapshot(3) };
    await Regen.regenerate('job-aaaaaaaa', 1, { target: 'style', preset: 'minimal' });
    expect(JSON.stringify(sceneOf(1).audio)).toBe(before.audio);
    expect(snapshot(2)).toBe(before[2]);
    expect(snapshot(3)).toBe(before[3]);
  });
});

describe('regenerate image', () => {
  it('uses the existing image regeneration (which already handles a podcast\'s shared cover) and adds the plan', async () => {
    const { plan, job } = await Regen.regenerate('job-aaaaaaaa', 2, { target: 'image', prompt: 'a different lighthouse' });
    expect(VideoService.regenerateSceneImage).toHaveBeenCalledWith('job-aaaaaaaa', 2, { prompt: 'a different lighthouse' });
    expect(job.status).toBe('GENERATING_IMAGES');
    expect(plan).toMatchObject({ changed: ['image'], regenerate: ['scene-composition', 'render'] });
    expect(plan.reusable).toEqual(expect.arrayContaining(['script', 'audio', 'captions']));
    expect(plan.stages).toEqual(['images', 'assets', 'render', 'upload']);
    expect(ActivityLogService.add).toHaveBeenCalledWith('job-aaaaaaaa', expect.stringContaining('Scene 2'));
  });

  it('leaves the narration alone - no audio is cleared', async () => {
    await Regen.regenerate('job-aaaaaaaa', 2, { target: 'image' });
    expect(sceneOf(2).audio.file).toBe('scene2.mp3');
  });
});

describe('regenerate the whole scene', () => {
  it('takes a fresh voice and a fresh picture, but keeps the script and layout', async () => {
    const { plan } = await Regen.regenerate('job-aaaaaaaa', 2, { target: 'scene' });
    expect(sceneOf(2).audio).toMatchObject({ file: '', fresh: true });
    expect(sceneOf(2).imageUrl).toBe('');
    expect(sceneOf(2).storyboard.visual).toMatchObject({ status: 'pending', variant: 1 });
    expect(sceneOf(2).audio.text).toBe('Narration 2.');
    expect(plan.changed).toEqual(['audio', 'image']);
    expect(plan.produce).toEqual(['audio', 'captions', 'image']);
    expect(plan.reusable).toEqual(expect.arrayContaining(['script', 'layout']));
    expect(plan.stages).toEqual(['audio', 'images', 'assets', 'render', 'upload']);
  });

  it('works on a scene with no picture (voice only)', async () => {
    await Regen.regenerate('job-aaaaaaaa', 1, { target: 'scene' });
    expect(sceneOf(1).audio.file).toBe('');
    expect(sceneOf(1).imageUrl).toBe('');
  });

  it('never touches the other scenes', async () => {
    const before = { 1: snapshot(1), 3: snapshot(3) };
    await Regen.regenerate('job-aaaaaaaa', 2, { target: 'scene' });
    expect(snapshot(1)).toBe(before[1]);
    expect(snapshot(3)).toBe(before[3]);
  });
});

describe('revert', () => {
  beforeEach(() => {
    SceneVersionService.revert.mockResolvedValue({
      sceneId: 'sce-00000001', sceneNumber: 1, version: 1, audioRestored: true, warnings: [],
      plan: { regenerate: ['scene-composition', 'render'], stages: ['assets', 'render', 'upload'], produce: [] },
    });
  });

  it('saves the state being left as a version, restores, and rewinds to assets only', async () => {
    const out = await Regen.revert('job-aaaaaaaa', 1, 1);
    expect(SceneVersionService.settle).toHaveBeenCalledWith('job-aaaaaaaa', expect.objectContaining({ reason: expect.stringContaining('before reverting') }));
    expect(SceneVersionService.revert).toHaveBeenCalledWith('job-aaaaaaaa', 1, 1);
    expect(stageTracker.invalidate).toHaveBeenCalledWith('job-aaaaaaaa', 'assets');
    expect(out.job.status).toBe('PREPARING_ASSETS');
    expect(out.plan.stages).toEqual(['assets', 'render', 'upload']);
  });

  it.each(['RENDERING', 'GENERATING_AUDIO', 'AUDIO_COMPLETED', 'QUEUED'])('refuses while the video is %s', async (status) => {
    mockState.job.status = status;
    await expect(Regen.revert('job-aaaaaaaa', 1, 1)).rejects.toThrow(/can be reverted once it has finished/);
    expect(SceneVersionService.revert).not.toHaveBeenCalled();
  });
});

describe('options for the Studio', () => {
  it('offers everything on a finished video, with the layouts that fit and the looks', async () => {
    const o = await Regen.getOptions('job-aaaaaaaa', 1);
    expect(o.allowed).toMatchObject({ image: false, voice: true, script: true, layout: true, style: true, scene: true, revert: true });
    expect(o.layouts).toEqual(expect.arrayContaining(['stack-list', 'grid', 'paragraph-stack']));
    expect(o.layouts).not.toContain('split-image');
    expect(o.presets.map((p) => p.id)).toEqual(['cinematic', 'minimal', 'dynamic']);
    expect(o.currentLayout).toBe('stack-list');
    expect(o.versionCount).toBe(2);
  });

  it('offers image regeneration only where there is a picture to redraw', async () => {
    expect((await Regen.getOptions('job-aaaaaaaa', 2)).allowed.image).toBe(true);
    expect((await Regen.getOptions('job-aaaaaaaa', 1)).allowed.image).toBe(false);
  });

  it('explains why nothing is on offer while the video is still being made', async () => {
    mockState.job.status = 'RENDERING';
    const o = await Regen.getOptions('job-aaaaaaaa', 1);
    expect(Object.values(o.allowed).some(Boolean)).toBe(false);
    expect(o.reason).toMatch(/once it has finished/);
  });

  it('offers no layouts or looks for a scene drawn by a numbered template', async () => {
    sceneOf(1).templateId = '003-content';
    const o = await Regen.getOptions('job-aaaaaaaa', 1);
    expect(o.allowed).toMatchObject({ layout: false, style: false });
    expect(o.layouts).toEqual([]);
    expect(o.presets).toEqual([]);
  });

  it('offers revert only once there is something to revert to', async () => {
    SceneVersionService.list.mockResolvedValueOnce({ versions: [{ version: 1 }], activeVersion: 1 });
    expect((await Regen.getOptions('job-aaaaaaaa', 1)).allowed.revert).toBe(false);
  });
});
