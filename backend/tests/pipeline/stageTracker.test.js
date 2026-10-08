jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../src/services/common/SocketService', () => ({ emitStageUpdate: jest.fn() }));

// A tiny in-memory stand-in for the one document the tracker touches, applying
// the $set / $inc operators it uses, so the tests assert the persisted result
// rather than the shape of the Mongo call.
const mockStore = { doc: null };
function mockApplyUpdate(update) {
  for (const [path, value] of Object.entries(update.$set || {})) {
    const parts = path.split('.');
    let node = mockStore.doc;
    parts.slice(0, -1).forEach((p) => { node[p] = node[p] || {}; node = node[p]; });
    node[parts.at(-1)] = value;
  }
  for (const [path, by] of Object.entries(update.$inc || {})) {
    const parts = path.split('.');
    let node = mockStore.doc;
    parts.slice(0, -1).forEach((p) => { node[p] = node[p] || {}; node = node[p]; });
    node[parts.at(-1)] = (node[parts.at(-1)] || 0) + by;
  }
}
jest.mock('../../src/models/VideoJob', () => ({
  findByIdAndUpdate: jest.fn((_id, update) => {
    if (mockStore.fail) return { select: () => ({ lean: () => Promise.reject(new Error('mongo down')) }) };
    mockApplyUpdate(update);
    return {
      select: (selection) => {
        const key = selection.split('.')[1];
        return { lean: () => Promise.resolve({ stages: { [key]: mockStore.doc.stages[key] } }) };
      },
    };
  }),
  updateOne: jest.fn((_filter, update) => { mockApplyUpdate(update); return Promise.resolve(); }),
  findById: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(mockStore.doc) }) })),
}));

const SocketService = require('../../src/services/common/SocketService');
const tracker = require('../../src/services/pipeline/stageTracker');
const { toStructuredError } = require('../../src/services/pipeline/pipelineErrors');

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.doc = { stages: {} };
  mockStore.fail = false;
});

describe('stage lifecycle', () => {
  it('records running, then completed with timing', async () => {
    const { attempt } = await tracker.begin('j1', 'audio');
    expect(attempt).toBe(1);
    expect(mockStore.doc.stages.audio).toMatchObject({ status: 'running', attempt: 1, completedAt: null, error: null });
    expect(mockStore.doc.stages.audio.startedAt).toBeInstanceOf(Date);

    await tracker.complete('j1', 'audio', { durationMs: 1234 });
    expect(mockStore.doc.stages.audio).toMatchObject({ status: 'completed', durationMs: 1234, reused: false, error: null });
    expect(mockStore.doc.stages.audio.completedAt).toBeInstanceOf(Date);
  });

  it('counts an attempt per run, so a stage retried twice shows attempt 3', async () => {
    for (let i = 0; i < 3; i += 1) {
      await tracker.begin('j1', 'audio');
      await tracker.fail('j1', 'audio', toStructuredError(new Error('x'), { stage: 'audio', attempt: i + 1 }), { durationMs: 5 });
    }
    expect(mockStore.doc.stages.audio.attempt).toBe(3);
  });

  it('does not count a reuse as extra work: reused is recorded', async () => {
    await tracker.begin('j1', 'script');
    await tracker.complete('j1', 'script', { durationMs: 2, reused: true });
    expect(mockStore.doc.stages.script.reused).toBe(true);
  });

  it('stores a failure as the structured error and no stack', async () => {
    await tracker.begin('j1', 'render');
    const err = toStructuredError(new Error('Remotion rendering failed after 2 attempts: x\n    at fn (a.js:1:1)'), { stage: 'render', attempt: 1 });
    await tracker.fail('j1', 'render', err, { durationMs: 9 });
    const stored = mockStore.doc.stages.render;
    expect(stored.status).toBe('failed');
    expect(Object.keys(stored.error).sort()).toEqual(['attempt', 'code', 'message', 'retryable', 'stage', 'timestamp']);
    expect(JSON.stringify(stored.error)).not.toMatch(/a\.js/);
  });

  it('beginning again clears the previous failure', async () => {
    await tracker.begin('j1', 'render');
    await tracker.fail('j1', 'render', toStructuredError(new Error('x'), { stage: 'render' }));
    await tracker.begin('j1', 'render');
    expect(mockStore.doc.stages.render).toMatchObject({ status: 'running', error: null, attempt: 2 });
  });

  it('emits a stageUpdate for each transition', async () => {
    await tracker.begin('j1', 'audio');
    await tracker.complete('j1', 'audio', { durationMs: 1 });
    expect(SocketService.emitStageUpdate).toHaveBeenCalledTimes(2);
    expect(SocketService.emitStageUpdate).toHaveBeenLastCalledWith('j1', 'audio', expect.objectContaining({ status: 'completed' }));
  });

  it('records a cancelled stage', async () => {
    await tracker.begin('j1', 'images');
    await tracker.cancel('j1', 'images', { durationMs: 3 });
    expect(mockStore.doc.stages.images.status).toBe('cancelled');
  });
});

describe('best-effort persistence', () => {
  it('swallows a database failure instead of breaking the pipeline', async () => {
    mockStore.fail = true;
    await expect(tracker.begin('j1', 'audio')).resolves.toEqual({ attempt: 1 });
    await expect(tracker.complete('j1', 'audio', { durationMs: 1 })).resolves.toBeNull();
    expect(SocketService.emitStageUpdate).not.toHaveBeenCalled();
  });
});

describe('invalidate', () => {
  it('resets the stage and everything downstream, keeping attempt history and earlier stages', async () => {
    for (const key of ['script', 'audio', 'images', 'assets', 'render', 'upload']) {
      await tracker.begin('j1', key);
      await tracker.complete('j1', key, { durationMs: 1 });
    }
    await tracker.invalidate('j1', 'images');
    const { stages } = mockStore.doc;
    expect(stages.script.status).toBe('completed');
    expect(stages.audio.status).toBe('completed');
    for (const key of ['images', 'assets', 'render', 'upload']) {
      expect(stages[key]).toMatchObject({ status: 'pending', error: null, completedAt: null });
      expect(stages[key].attempt).toBe(1);
    }
  });

  it('ignores an unknown stage key', async () => {
    const VideoJob = require('../../src/models/VideoJob');
    await tracker.invalidate('j1', 'nope');
    expect(VideoJob.updateOne).not.toHaveBeenCalled();
  });
});

describe('interruption and resume', () => {
  it('marks the stage that was running as failed, with the stage on the error', async () => {
    mockStore.doc = { stages: { script: { status: 'completed' }, audio: { status: 'running', attempt: 1 } } };
    const interrupted = await tracker.markInterrupted('j1', toStructuredError(new Error('worker died'), { stage: null }));
    expect(interrupted).toBe('audio');
    expect(mockStore.doc.stages.audio.status).toBe('failed');
    expect(mockStore.doc.stages.audio.error.stage).toBe('audio');
  });

  it('returns null when nothing was running', async () => {
    mockStore.doc = { stages: { script: { status: 'completed' } } };
    expect(await tracker.markInterrupted('j1', {})).toBeNull();
  });

  it('resumeStageOf finds the first stage that did not finish', () => {
    expect(tracker.resumeStageOf({ stages: { script: { status: 'completed' }, audio: { status: 'failed' }, images: { status: 'pending' } } })).toBe('audio');
    expect(tracker.resumeStageOf({ stages: { script: { status: 'completed' }, audio: { status: 'completed' } } })).toBeNull();
    expect(tracker.resumeStageOf({})).toBeNull();
  });
});
