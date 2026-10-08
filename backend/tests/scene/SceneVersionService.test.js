jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn(), debug: jest.fn(),
}));

// In-memory stand-ins for the two collections and for object storage, so the
// tests assert what ends up persisted rather than the shape of Mongo calls.
const mockDb = { job: null, versions: new Map(), objects: new Set() };

jest.mock('../../src/models/VideoJob', () => ({
  findById: jest.fn(() => ({ lean: () => Promise.resolve(mockDb.job && JSON.parse(JSON.stringify(mockDb.job))) })),
  updateOne: jest.fn((filter, update) => {
    const scenes = mockDb.job.script.scenes;
    const target = filter['script.scenes.sceneId']
      ? scenes.find((s) => s.sceneId === filter['script.scenes.sceneId'])
      : scenes.find((s) => s.sceneNumber === filter['script.scenes.sceneNumber']);
    for (const [path, value] of Object.entries(update.$set || {})) {
      if (path === 'script.scenes.$') {
        Object.keys(target).forEach((k) => delete target[k]);
        Object.assign(target, value);
      } else target[path.replace('script.scenes.$.', '')] = value;
    }
    return Promise.resolve();
  }),
}));

jest.mock('../../src/models/SceneVersion', () => {
  const sorted = (jobId, sceneId) => [...mockDb.versions.values()]
    .filter((v) => v.jobId === jobId && v.sceneId === sceneId)
    .sort((a, b) => b.version - a.version);
  return {
    create: jest.fn(async (doc) => {
      if (mockDb.versions.has(doc._id)) throw Object.assign(new Error('dup'), { code: 11000 });
      mockDb.versions.set(doc._id, JSON.parse(JSON.stringify(doc)));
      return doc;
    }),
    findOne: jest.fn((q) => ({ sort: () => ({ lean: () => Promise.resolve(sorted(q.jobId, q.sceneId)[0] || null) }) })),
    findById: jest.fn((id) => ({ lean: () => Promise.resolve(mockDb.versions.get(id) || null) })),
    find: jest.fn((q) => ({
      sort: () => ({ select: () => ({ lean: () => Promise.resolve(sorted(q.jobId, q.sceneId).map((version) => { const rest = { ...version }; delete rest.snapshot; return rest; })) }) }),
    })),
  };
});

const mockCopy = jest.fn(async (_destBucket, destKey, _srcBucket, srcKey) => {
  if (!mockDb.objects.has(srcKey)) throw Object.assign(new Error('NoSuchKey'), { code: 'NoSuchKey' });
  mockDb.objects.add(destKey);
});
jest.mock('../../src/services/storage/providers', () => ({ getStorageProvider: () => ({ copyObject: mockCopy }) }));

const SceneVersionService = require('../../src/services/scene/SceneVersionService');
const { fingerprintScene } = require('../../src/services/scene/sceneFingerprint');

const makeScene = (n, over = {}) => ({
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
  elements: { title: `Scene ${n}`, items: [{ heading: '', text: 'a point' }] },
  storyboard: { layout: 'stack-list', visual: { kind: 'none' } },
  audio: { text: `Narration ${n}.`, voice: 'female-1', emotion: '', duration: 5, file: `scene${n}.mp3` },
  ...over,
});

const JOB = 'job-aaaaaaaa';
const archive = (n, fp) => `${JOB}/audio/versions/scene${n}.${fp.slice(0, 12)}.mp3`;

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.versions = new Map();
  mockDb.objects = new Set([`${JOB}/audio/scene1.mp3`, `${JOB}/audio/scene2.mp3`, `${JOB}/audio/scene3.mp3`]);
  mockDb.job = {
    _id: JOB, voice: 'female-1', fastAudio: false,
    script: { brief: { storyboardSource: 'director' }, scenes: [makeScene(1), makeScene(2), makeScene(3)] },
  };
});

const sceneOf = (n) => mockDb.job.script.scenes.find((s) => s.sceneNumber === n);

describe('first settle', () => {
  it('records v1 of every scene and marks it active', async () => {
    const recorded = await SceneVersionService.settle(JOB);
    expect(recorded).toHaveLength(3);
    expect(mockDb.versions.size).toBe(3);
    for (const n of [1, 2, 3]) {
      const v = mockDb.versions.get(`${JOB}:${sceneOf(n).sceneId}:v1`);
      expect(v).toMatchObject({ version: 1, parentVersion: null, changeType: 'initial', sceneNumber: n });
      expect(sceneOf(n).activeVersion).toBe(1);
    }
  });

  it('is idempotent: a second settle with nothing changed records nothing', async () => {
    await SceneVersionService.settle(JOB);
    expect(await SceneVersionService.settle(JOB)).toEqual([]);
    expect(mockDb.versions.size).toBe(3);
  });

  it('snapshots the whole scene and records how it was made', async () => {
    await SceneVersionService.settle(JOB);
    const v = mockDb.versions.get(`${JOB}:${sceneOf(1).sceneId}:v1`);
    expect(v.snapshot).toMatchObject({ title: 'Scene 1', templateId: 'generative', audio: { text: 'Narration 1.' } });
    expect(v.provenance).toMatchObject({
      prompt: 'Narration 1.',
      template: 'generative',
      layout: 'stack-list',
      transition: 'fade',
      ttsConfig: { voice: 'female-1' },
    });
    expect(v.provenance.llmModel).toEqual(expect.any(String));
    expect(v.provenance.ttsModel).toMatch(/Qwen3-TTS/);
    expect(v.fingerprints['scene-composition']).toEqual(expect.any(String));
  });

  it('gives a legacy scene with no stored sceneId a persisted one', async () => {
    delete sceneOf(2).sceneId;
    await SceneVersionService.settle(JOB);
    expect(sceneOf(2).sceneId).toMatch(/^sce-/);
    expect(sceneOf(2).activeVersion).toBe(1);
  });
});

describe('a change creates a new immutable version', () => {
  it('only the changed scene gets v2; the others keep v1', async () => {
    await SceneVersionService.settle(JOB);
    sceneOf(3).imagePrompt = 'a new picture';
    sceneOf(3).imageUrl = 'http://x/new.png';
    const recorded = await SceneVersionService.settle(JOB);

    expect(recorded).toEqual([expect.objectContaining({ sceneNumber: 3, version: 2, changed: ['image'] })]);
    expect(sceneOf(1).activeVersion).toBe(1);
    expect(sceneOf(2).activeVersion).toBe(1);
    expect(sceneOf(3).activeVersion).toBe(2);
  });

  it('links the new version to its parent and names the change', async () => {
    await SceneVersionService.settle(JOB);
    sceneOf(1).transition = 'wipe';
    await SceneVersionService.settle(JOB);
    const v2 = mockDb.versions.get(`${JOB}:${sceneOf(1).sceneId}:v2`);
    expect(v2).toMatchObject({ version: 2, parentVersion: 1, changeType: 'transition', changed: ['transition'] });
  });

  it('never modifies an earlier version', async () => {
    await SceneVersionService.settle(JOB);
    const v1Before = JSON.stringify(mockDb.versions.get(`${JOB}:${sceneOf(1).sceneId}:v1`));
    sceneOf(1).title = 'A completely different title';
    sceneOf(1).audio.text = 'Different narration.';
    await SceneVersionService.settle(JOB);
    expect(JSON.stringify(mockDb.versions.get(`${JOB}:${sceneOf(1).sceneId}:v1`))).toBe(v1Before);
    expect(mockDb.versions.get(`${JOB}:${sceneOf(1).sceneId}:v1`).snapshot.title).toBe('Scene 1');
  });

  it('builds a chain v1 → v2 → v3', async () => {
    await SceneVersionService.settle(JOB);
    sceneOf(1).transition = 'wipe';
    await SceneVersionService.settle(JOB);
    sceneOf(1).cameraMotion = 'zoom-in';
    await SceneVersionService.settle(JOB);
    const { versions, activeVersion } = await SceneVersionService.list(JOB, 1);
    expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
    expect(versions.map((v) => v.parentVersion)).toEqual([2, 1, null]);
    expect(activeVersion).toBe(3);
    expect(versions.find((v) => v.version === 3).active).toBe(true);
  });

  it('survives two settles racing for the same version number', async () => {
    await SceneVersionService.settle(JOB);
    sceneOf(2).transition = 'wipe';
    const [a, b] = await Promise.all([SceneVersionService.settle(JOB), SceneVersionService.settle(JOB)]);
    expect(a.length + b.length).toBeGreaterThanOrEqual(1);
    expect([...mockDb.versions.keys()].filter((k) => k.includes(`${sceneOf(2).sceneId}:v2`))).toHaveLength(1);
  });
});

describe('narration archive', () => {
  it('copies a new recording to a name that cannot be overwritten, and points the version at it', async () => {
    await SceneVersionService.settle(JOB);
    const fp1 = fingerprintScene(sceneOf(1), mockDb.job).audio;
    expect(mockDb.objects.has(archive(1, fp1))).toBe(true);

    sceneOf(1).audio.duration = 6.4; // a fresh take overwrote scene1.mp3
    await SceneVersionService.settle(JOB);
    const fp2 = fingerprintScene(sceneOf(1), mockDb.job).audio;
    expect(fp2).not.toBe(fp1);
    expect(mockDb.objects.has(archive(1, fp2))).toBe(true);
    expect(mockDb.versions.get(`${JOB}:${sceneOf(1).sceneId}:v2`).provenance.assets.audioArchive).toBe(archive(1, fp2));
    expect(mockDb.versions.get(`${JOB}:${sceneOf(1).sceneId}:v1`).provenance.assets.audioArchive).toBe(archive(1, fp1));
  });

  it('does not copy audio again when only the layout changed', async () => {
    await SceneVersionService.settle(JOB);
    mockCopy.mockClear();
    sceneOf(1).transition = 'wipe';
    await SceneVersionService.settle(JOB);
    expect(mockCopy).not.toHaveBeenCalled();
  });

  it('still records the version when the audio object is missing from storage', async () => {
    mockDb.objects.delete(`${JOB}/audio/scene1.mp3`);
    await SceneVersionService.settle(JOB);
    expect(mockDb.versions.get(`${JOB}:${sceneOf(1).sceneId}:v1`).provenance.assets.audioArchive).toBeNull();
  });
});

describe('settle never fails the render it follows', () => {
  it('returns [] and does not throw when the database errors', async () => {
    const VideoJob = require('../../src/models/VideoJob');
    VideoJob.findById.mockImplementationOnce(() => { throw new Error('mongo down'); });
    await expect(SceneVersionService.settle(JOB)).resolves.toEqual([]);
  });

  it('returns [] for a job with no script', async () => {
    mockDb.job.script = null;
    expect(await SceneVersionService.settle(JOB)).toEqual([]);
  });
});

describe('revert', () => {
  const setup = async () => {
    await SceneVersionService.settle(JOB);
    sceneOf(1).title = 'Edited title';
    sceneOf(1).transition = 'wipe';
    sceneOf(1).audio.text = 'Edited narration.';
    sceneOf(1).audio.duration = 7.1;
    await SceneVersionService.settle(JOB);
  };

  it('restores the scene from the older version without touching either version', async () => {
    await setup();
    const v1 = JSON.stringify(mockDb.versions.get(`${JOB}:${sceneOf(1).sceneId}:v1`));
    const v2 = JSON.stringify(mockDb.versions.get(`${JOB}:${sceneOf(1).sceneId}:v2`));
    expect(sceneOf(1).activeVersion).toBe(2);

    const result = await SceneVersionService.revert(JOB, 1, 1);

    expect(sceneOf(1)).toMatchObject({ title: 'Scene 1', transition: 'fade', activeVersion: 1, sceneNumber: 1 });
    expect(sceneOf(1).audio).toMatchObject({ text: 'Narration 1.', duration: 5 });
    expect(JSON.stringify(mockDb.versions.get(`${JOB}:${sceneOf(1).sceneId}:v1`))).toBe(v1);
    expect(JSON.stringify(mockDb.versions.get(`${JOB}:${sceneOf(1).sceneId}:v2`))).toBe(v2);
    expect(mockDb.versions.size).toBe(4); // 3 scenes' v1 + scene 1's v2: reverting adds nothing
    expect(result.audioRestored).toBe(true);
  });

  it('copies the archived narration back to where the renderer reads it', async () => {
    await setup();
    mockCopy.mockClear();
    await SceneVersionService.revert(JOB, 1, 1);
    const v1Fp = mockDb.versions.get(`${JOB}:${sceneOf(1).sceneId}:v1`).fingerprints.audio;
    expect(mockCopy).toHaveBeenCalledWith(expect.any(String), `${JOB}/audio/scene1.mp3`, expect.any(String), archive(1, v1Fp));
  });

  it('plans only a composition + render rebuild - the restored state is already consistent', async () => {
    await setup();
    const { plan } = await SceneVersionService.revert(JOB, 1, 1);
    expect(plan.regenerate).toEqual(['scene-composition', 'render']);
    expect(plan.produce).toEqual([]);
    expect(plan.stages).toEqual(['assets', 'render', 'upload']);
  });

  it('after a revert, settling does not invent a new version', async () => {
    await setup();
    await SceneVersionService.revert(JOB, 1, 1);
    expect(await SceneVersionService.settle(JOB)).toEqual([]);
    expect(sceneOf(1).activeVersion).toBe(1);
  });

  it('a change after a revert branches from the reverted version, not the newest', async () => {
    await setup();
    await SceneVersionService.revert(JOB, 1, 1);
    sceneOf(1).cameraMotion = 'pan-left';
    await SceneVersionService.settle(JOB);
    const v3 = mockDb.versions.get(`${JOB}:${sceneOf(1).sceneId}:v3`);
    expect(v3).toMatchObject({ version: 3, parentVersion: 1, changed: ['motion'] });
    expect(sceneOf(1).activeVersion).toBe(3);
  });

  it('keeps the live scene\'s position when it has moved since the version was taken', async () => {
    await setup();
    sceneOf(1).sceneNumber = 5;
    await SceneVersionService.revert(JOB, 5, 1);
    expect(sceneOf(5)).toMatchObject({ sceneNumber: 5, title: 'Scene 1' });
  });

  it('keeps the current recording, and says so, when the archived one is gone', async () => {
    await setup();
    const v1Fp = mockDb.versions.get(`${JOB}:${sceneOf(1).sceneId}:v1`).fingerprints.audio;
    mockDb.objects.delete(archive(1, v1Fp));
    const result = await SceneVersionService.revert(JOB, 1, 1);
    expect(result.audioRestored).toBe(false);
    expect(result.warnings[0]).toMatch(/could not be restored/i);
    expect(sceneOf(1).audio.duration).toBe(7.1);
    expect(sceneOf(1).title).toBe('Scene 1');
  });

  it('rejects a version that does not exist and a bad version number', async () => {
    await SceneVersionService.settle(JOB);
    await expect(SceneVersionService.revert(JOB, 1, 9)).rejects.toThrow(/no version 9/);
    await expect(SceneVersionService.revert(JOB, 1, 0)).rejects.toThrow(/positive integer/);
    await expect(SceneVersionService.revert(JOB, 42, 1)).rejects.toThrow(/Scene 42 not found/);
  });
});

describe('planFor', () => {
  it('is empty when the scene matches its active version', async () => {
    await SceneVersionService.settle(JOB);
    expect(await SceneVersionService.planFor(JOB, 1)).toMatchObject({ changed: [], regenerate: [], stages: [] });
  });

  it('derives the regeneration plan from what actually differs', async () => {
    await SceneVersionService.settle(JOB);
    sceneOf(1).storyboard = { layout: 'timeline', visual: { kind: 'none' } };
    const plan = await SceneVersionService.planFor(JOB, 1);
    expect(plan).toMatchObject({ version: 1, changed: ['layout'], regenerate: ['scene-composition', 'render'], produce: [] });
    expect(plan.reusable).toEqual(expect.arrayContaining(['script', 'audio', 'captions', 'image']));
  });

  it('plans against a chosen older version', async () => {
    await SceneVersionService.settle(JOB);
    sceneOf(1).audio.text = 'New narration.';
    await SceneVersionService.settle(JOB);
    const plan = await SceneVersionService.planFor(JOB, 1, { version: 1 });
    expect(plan.changed).toEqual(expect.arrayContaining(['script', 'audio']));
  });
});

describe('SceneVersion model immutability', () => {
  // The real model: its hooks must refuse every mutation before touching the database.
  const RealSceneVersion = jest.requireActual('../../src/models/SceneVersion');

  it.each(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace'])('refuses %s', async (op) => {
    await expect(RealSceneVersion[op]({ _id: 'x' }, { $set: { reason: 'tampered' } })).rejects.toThrow(/immutable/);
  });

  it('refuses to save an existing version', async () => {
    const existing = RealSceneVersion.hydrate({
      _id: 'a:b:v1', jobId: 'a', sceneId: 'b', sceneNumber: 1, version: 1, snapshot: {}, fingerprints: {},
    });
    existing.reason = 'tampered';
    await expect(existing.save()).rejects.toThrow(/immutable/);
  });
});
