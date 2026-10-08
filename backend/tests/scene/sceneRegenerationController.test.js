jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../src/services/common/ActivityLogService', () => ({ add: jest.fn().mockResolvedValue() }));
jest.mock('../../src/services/common/SocketService', () => ({ emitJobCreated: jest.fn() }));
jest.mock('../../src/services/video/enqueueVideoJob', () => jest.fn().mockResolvedValue());
jest.mock('../../src/services/video/videoQueueJobs', () => ({ isActive: jest.fn().mockResolvedValue(false) }));
jest.mock('../../src/services/video/VideoService', () => ({}));
jest.mock('../../src/models/VideoJob', () => ({}));
jest.mock('../../src/services/scene/SceneVersionService', () => ({ list: jest.fn(), planFor: jest.fn() }));
jest.mock('../../src/services/scene/SceneRegenerationService', () => {
  const actual = jest.requireActual('../../src/services/scene/SceneRegenerationService');
  return { ...actual, regenerate: jest.fn(), revert: jest.fn(), getOptions: jest.fn() };
});

const SceneController = require('../../src/controllers/sceneController');
const Regen = require('../../src/services/scene/SceneRegenerationService');
const enqueueJob = require('../../src/services/video/enqueueVideoJob');
const videoQueueJobs = require('../../src/services/video/videoQueueJobs');
const SocketService = require('../../src/services/common/SocketService');

const JOB = 'job-aaaaaaaa';
const run = async (handler, { params = {}, body = {} } = {}) => {
  const res = { json: jest.fn() };
  const next = jest.fn();
  await handler({ params: { id: JOB, sceneNumber: '2', ...params }, body, query: {} }, res, next);
  return { res, next };
};

beforeEach(() => {
  jest.clearAllMocks();
  videoQueueJobs.isActive.mockResolvedValue(false);
});

describe('POST .../regenerate', () => {
  const plan = { changed: ['layout'], regenerate: ['scene-composition', 'render'], reusable: [], produce: [], stages: ['assets', 'render', 'upload'] };

  it('queues the rebuild and answers with the plan', async () => {
    Regen.regenerate.mockResolvedValue({ job: { _id: JOB, status: 'PREPARING_ASSETS', progress: 60 }, plan });
    const { res, next } = await run(SceneController.regenerateScenePart, { body: { target: 'layout', layout: 'grid' } });

    expect(next).not.toHaveBeenCalled();
    expect(Regen.regenerate).toHaveBeenCalledWith(JOB, 2, { target: 'layout', layout: 'grid' });
    expect(enqueueJob).toHaveBeenCalledWith(JOB);
    expect(SocketService.emitJobCreated).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ queued: true, target: 'layout', sceneNumber: 2, status: 'PREPARING_ASSETS', plan }));
  });

  it('does not queue anything when nothing changed', async () => {
    Regen.regenerate.mockResolvedValue({ job: {}, noop: true, message: 'The scene already uses that layout.', plan });
    const { res } = await run(SceneController.regenerateScenePart, { body: { target: 'layout', layout: 'grid' } });
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ queued: false, noop: true, message: 'The scene already uses that layout.' }));
  });

  it('refuses while the worker is processing the video, before changing anything', async () => {
    videoQueueJobs.isActive.mockResolvedValue(true);
    const { next } = await run(SceneController.regenerateScenePart, { body: { target: 'voice' } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, message: expect.stringMatching(/being processed/) }));
    expect(Regen.regenerate).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown target', { target: 'dance' }],
    ['a layout that does not exist', { target: 'layout', layout: 'carousel' }],
    ['a layout target with no layout', { target: 'layout' }],
    ['an empty script', { target: 'script', text: '' }],
  ])('rejects %s', async (_name, body) => {
    const { next } = await run(SceneController.regenerateScenePart, { body });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(Regen.regenerate).not.toHaveBeenCalled();
  });

  it('rejects a bad scene number and a bad job id', async () => {
    expect((await run(SceneController.regenerateScenePart, { params: { sceneNumber: '0' }, body: { target: 'voice' } })).next).toHaveBeenCalled();
    expect((await run(SceneController.regenerateScenePart, { params: { id: 'nope' }, body: { target: 'voice' } })).next).toHaveBeenCalled();
    expect(Regen.regenerate).not.toHaveBeenCalled();
  });

  it('passes a service error (e.g. an incompatible layout) on to the error handler', async () => {
    const err = Object.assign(new Error('"stat-highlight" cannot show this scene\'s content'), { status: 400 });
    Regen.regenerate.mockRejectedValue(err);
    const { next } = await run(SceneController.regenerateScenePart, { body: { target: 'layout', layout: 'stat-highlight' } });
    expect(next).toHaveBeenCalledWith(err);
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});

describe('POST .../revert', () => {
  it('restores and queues the rebuild', async () => {
    Regen.revert.mockResolvedValue({ job: { _id: JOB, status: 'PREPARING_ASSETS', progress: 60 }, plan: { stages: ['assets', 'render', 'upload'] }, warnings: [], audioRestored: true });
    const { res } = await run(SceneController.revertScene, { body: { version: 1 } });
    expect(Regen.revert).toHaveBeenCalledWith(JOB, 2, 1);
    expect(enqueueJob).toHaveBeenCalledWith(JOB);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ queued: true, version: 1, audioRestored: true }));
  });

  it.each([[undefined], [0], ['x'], [1.5]])('rejects version %p', async (version) => {
    const { next } = await run(SceneController.revertScene, { body: { version } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(Regen.revert).not.toHaveBeenCalled();
  });

  it('refuses while the video is being processed', async () => {
    videoQueueJobs.isActive.mockResolvedValue(true);
    const { next } = await run(SceneController.revertScene, { body: { version: 1 } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(Regen.revert).not.toHaveBeenCalled();
  });
});

describe('GET .../options', () => {
  it('returns what the service says is on offer', async () => {
    Regen.getOptions.mockResolvedValue({ allowed: { voice: true } });
    const { res } = await run(SceneController.sceneOptions);
    expect(Regen.getOptions).toHaveBeenCalledWith(JOB, 2);
    expect(res.json).toHaveBeenCalledWith({ allowed: { voice: true } });
  });
});
