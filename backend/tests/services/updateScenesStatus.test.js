jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(), success: jest.fn(),
}));
jest.mock('../../src/models/VideoJob', () => ({ findById: jest.fn(), findByIdAndUpdate: jest.fn() }));
jest.mock('../../src/services/video/VideoService', () => ({}));

const VideoJob = require('../../src/models/VideoJob');
const SceneController = require('../../src/controllers/sceneController');
const { JOB_STATUS } = require('../../src/constants');

const voiced = (n) => ({ sceneNumber: n, audio: { text: 'hi', file: `scene${n}.mp3` } });
const unvoiced = (n) => ({ sceneNumber: n, audio: { text: 'hi', file: '' } });

async function save(existingStatus, scenes) {
  VideoJob.findById.mockReturnValue({ select: () => ({ lean: async () => ({ status: existingStatus }) }) });
  VideoJob.findByIdAndUpdate.mockImplementation(async (_id, update) => ({ _id: 'job-ABCD1234', ...update }));
  const res = { json: jest.fn() };
  const next = jest.fn();
  await SceneController.updateScenes({ params: { id: 'job-ABCD1234' }, body: { scenes } }, res, next);
  expect(next).not.toHaveBeenCalled();
  return VideoJob.findByIdAndUpdate.mock.calls[0][1];
}

beforeEach(() => jest.clearAllMocks());

describe('SceneController.updateScenes status after a save', () => {
  test('AUDIO_COMPLETED stays AUDIO_COMPLETED while every scene still has audio', async () => {
    const update = await save(JOB_STATUS.AUDIO_COMPLETED, [voiced(1), voiced(2)]);
    expect(update).toMatchObject({ status: JOB_STATUS.AUDIO_COMPLETED, currentStep: JOB_STATUS.AUDIO_COMPLETED, progress: 50 });
  });

  test('AUDIO_COMPLETED goes back to SCRIPT_COMPLETED when a scene has no audio yet', async () => {
    const update = await save(JOB_STATUS.AUDIO_COMPLETED, [voiced(1), unvoiced(2)]);
    expect(update).toMatchObject({ status: JOB_STATUS.SCRIPT_COMPLETED, progress: 20 });
  });

  test('AWAITING_APPROVAL is preserved', async () => {
    const update = await save(JOB_STATUS.AWAITING_APPROVAL, [unvoiced(1)]);
    expect(update).toMatchObject({ status: JOB_STATUS.AWAITING_APPROVAL, progress: 20 });
  });

  test.each([JOB_STATUS.COMPLETED, JOB_STATUS.FAILED, JOB_STATUS.SCRIPT_COMPLETED])('%s becomes SCRIPT_COMPLETED', async (status) => {
    const update = await save(status, [voiced(1)]);
    expect(update).toMatchObject({ status: JOB_STATUS.SCRIPT_COMPLETED, progress: 20 });
  });
});
