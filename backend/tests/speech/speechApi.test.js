jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(),
}));
jest.mock('../../src/models/VideoJob', () => ({ findById: jest.fn(), findByIdAndUpdate: jest.fn() }));
jest.mock('../../src/services/video/VideoService', () => ({}));

const VideoJob = require('../../src/models/VideoJob');
const SceneController = require('../../src/controllers/sceneController');
const config = require('../../src/config');

const goodTimeline = {
  version: 1, duration: 3, alignmentStatus: 'complete',
  segments: [{ segmentId: 's', index: 0, start: 0, end: 3, duration: 3 }],
  words: [{ wordId: 'w', segmentId: 's', start: 0, end: 1, duration: 1, text: 'hi' }],
  phrases: [], pauses: [],
};
const corrupt = { ...goodTimeline, words: [{ wordId: 'w', segmentId: 's', start: 2, end: 1, duration: 1, text: 'hi' }] };

function mockJob(job) {
  VideoJob.findById.mockReturnValue({ select: () => ({ lean: async () => job }) });
}

async function get(id, query = {}) {
  const res = { json: jest.fn() };
  const next = jest.fn();
  await SceneController.getSpeechTimeline({ params: { id }, query }, res, next);
  return { res, next };
}

beforeEach(() => jest.clearAllMocks());

describe('GET /api/videos/:id/speech-timeline', () => {
  const job = {
    script: {
      scenes: [
        { sceneNumber: 1, audio: { file: 'scene1.mp3', duration: 3, speechTimeline: goodTimeline } },
        { sceneNumber: 2, audio: { file: 'scene2.mp3', duration: 2 } },
        { sceneNumber: 3, audio: { file: 'scene3.mp3', duration: 2, speechTimeline: corrupt } },
      ],
    },
  };

  it('returns each scene timeline with its invariant check; a scene without one reports null', async () => {
    mockJob(job);
    const { res, next } = await get('job-ABCD1234');
    expect(next).not.toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ alignmentEnabled: config.speech.alignmentEnabled, drivenAnimationEnabled: config.speech.drivenAnimationEnabled });
    expect(body.scenes.map((s) => [s.sceneNumber, s.timeline ? 'timeline' : null])).toEqual([[1, 'timeline'], [2, null], [3, 'timeline']]);
    expect(body.scenes[0]).toMatchObject({ audioFile: 'scene1.mp3', duration: 3, issues: [] });
    expect(body.scenes[1].issues).toEqual([]);
    expect(body.scenes[2].issues.length).toBeGreaterThan(0); // corrupt timing is reported, not hidden
  });

  it('can be limited to one scene', async () => {
    mockJob(job);
    const { res } = await get('job-ABCD1234', { scene: '1' });
    expect(res.json.mock.calls[0][0].scenes).toHaveLength(1);
  });

  it('404s for an unknown job or scene, and rejects a bad scene number', async () => {
    mockJob(null);
    expect((await get('job-ABCD1234')).next.mock.calls[0][0]).toMatchObject({ status: 404 });
    mockJob(job);
    expect((await get('job-ABCD1234', { scene: '9' })).next.mock.calls[0][0]).toMatchObject({ status: 404 });
    expect((await get('job-ABCD1234', { scene: 'abc' })).next).toHaveBeenCalled();
    expect((await get('not-a-job-id')).next).toHaveBeenCalled();
  });
});
