jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn(), debug: jest.fn(), tts: jest.fn(),
}));

const mockPredict = jest.fn();
const mockConnect = jest.fn();
jest.mock('@gradio/client', () => ({ Client: { connect: (...a) => mockConnect(...a) } }));

const mockCheckHealth = jest.fn();
jest.mock('../../src/services/localAI/serviceHealth', () => ({
  ...jest.requireActual('../../src/services/localAI/serviceHealth'),
  checkHealth: (...a) => mockCheckHealth(...a),
}));

const ttsManager = require('../../src/services/localAI/ttsManager');

describe('ttsManager.unload', () => {
  beforeEach(() => {
    mockConnect.mockResolvedValue({ predict: mockPredict });
    mockPredict.mockResolvedValue({ data: [] });
    jest.spyOn(ttsManager.process, 'isAlive').mockReturnValue(false);
    jest.spyOn(ttsManager.process, 'stop').mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('kills a process this backend spawned (the only way to free its VRAM)', async () => {
    ttsManager.process.isAlive.mockReturnValue(true);

    await ttsManager.unload();

    expect(ttsManager.process.stop).toHaveBeenCalledTimes(1);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('asks an externally managed server to drop its models and leaves it running', async () => {
    mockCheckHealth.mockResolvedValue(true);

    await ttsManager.unload();

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockPredict).toHaveBeenCalledWith('/unload_all_models', {});
    expect(ttsManager.process.stop).not.toHaveBeenCalled();
  });

  it('does nothing when no server is running', async () => {
    mockCheckHealth.mockResolvedValue(false);

    await ttsManager.unload();

    expect(mockConnect).not.toHaveBeenCalled();
    expect(ttsManager.process.stop).not.toHaveBeenCalled();
  });

  it('swallows an unload failure so GPU eviction still completes', async () => {
    mockCheckHealth.mockResolvedValue(true);
    mockPredict.mockRejectedValue(new Error('boom'));

    await expect(ttsManager.unload()).resolves.toBeUndefined();
  });
});
