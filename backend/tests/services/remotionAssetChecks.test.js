/**
 * Pre-render validation: reports every structural problem in one pass so a
 * broken job fails in seconds instead of after a multi-minute render.
 */
const mockProvider = { objectExists: jest.fn() };
jest.mock('../../src/services/storage/providers', () => ({ getStorageProvider: () => mockProvider }));
jest.mock('../../src/utils/assetUrlGuard', () => ({
  buildAllowedHosts: () => [],
  checkImageUrl: jest.fn(async (url) => (url.includes('169.254') ? 'points at a private address' : null)),
}));

const { validateAssets, verifySceneAudioFiles } = require('../../src/services/video/remotionAssetChecks');

const scene = (n, over = {}) => ({
  sceneNumber: n,
  templateId: 'title',
  audio: { text: 'Hello', duration: 3 },
  ...over,
});

beforeEach(() => {
  mockProvider.objectExists.mockReset().mockResolvedValue(true);
});

describe('validateAssets', () => {
  it('passes a well-formed script', async () => {
    await expect(validateAssets('job-1', [scene(1), scene(2)])).resolves.toBeUndefined();
  });

  it('rejects an empty script', async () => {
    await expect(validateAssets('job-1', [])).rejects.toThrow('script has no scenes');
  });

  it('collects every issue instead of stopping at the first', async () => {
    mockProvider.objectExists.mockImplementation(async (_job, _kind, file) => file !== 'scene2.mp3');
    const scenes = [
      scene(1, { imagePrompt: 'a robot' }),                       // image never generated
      scene(2),                                                   // audio missing from storage
      scene(2, { audio: { text: 'x', duration: 0 } }),            // duplicate number + empty TTS clip
      scene(4, { imageUrl: 'http://169.254.169.254/latest' }),    // blocked image host
    ];

    const err = await validateAssets('job-1', scenes).catch((e) => e);
    expect(err.message).toMatch(/^Pre-render validation failed:/);
    expect(err.message).toContain('Scene 1: image prompt set but no image was generated');
    expect(err.message).toContain('Scene 2: audio file is missing from storage');
    expect(err.message).toContain('Scene 2: duplicate sceneNumber');
    expect(err.message).toContain('TTS likely produced an empty clip');
    expect(err.message).toContain('Scene 4: imageUrl points at a private address');
  });
});

describe('verifySceneAudioFiles', () => {
  it('skips silent scenes and names the ones whose audio is missing', async () => {
    mockProvider.objectExists.mockImplementation(async (_job, _kind, file) => file !== 'scene3.mp3');
    const scenes = [{ sceneNumber: 1, audio: { duration: 0 } }, { sceneNumber: 3, audio: { duration: 2 } }];
    await expect(verifySceneAudioFiles('job-1', scenes)).rejects.toThrow('scene(s) 3');
    expect(mockProvider.objectExists).toHaveBeenCalledTimes(1);
  });
});
