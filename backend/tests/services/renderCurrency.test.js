/**
 * RemotionService.renderCurrency: not just "is the render reusable?" but WHY not,
 * so the cache ledger can tell a first render from one whose inputs changed.
 */
const fsp = require('fs').promises;
jest.mock('../../src/services/common/LoggerService', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), success: jest.fn(), debug: jest.fn(),
}));
const RemotionService = require('../../src/services/video/RemotionService');

let access;
let readFile;
beforeEach(() => {
  access = jest.spyOn(fsp, 'access').mockResolvedValue();
  readFile = jest.spyOn(fsp, 'readFile').mockResolvedValue('abc\n');
  jest.spyOn(RemotionService, '_fingerprintAssets').mockReturnValue('abc');
});
afterEach(() => jest.restoreAllMocks());

describe('renderCurrency', () => {
  it('is current when the stored fingerprint matches the assets', async () => {
    expect(await RemotionService.renderCurrency('j', {})).toEqual({ current: true, reason: null });
    expect(await RemotionService.isRenderCurrent('j', {})).toBe(true);
  });

  it('says inputs-changed when a render exists but was built from other assets', async () => {
    readFile.mockResolvedValue('different');
    expect(await RemotionService.renderCurrency('j', {})).toEqual({ current: false, reason: 'inputs-changed' });
    expect(await RemotionService.isRenderCurrent('j', {})).toBe(false);
  });

  it('says no-previous-render when there is no video or no fingerprint', async () => {
    access.mockRejectedValue(Object.assign(new Error('nope'), { code: 'ENOENT' }));
    expect(await RemotionService.renderCurrency('j', {})).toEqual({ current: false, reason: 'no-previous-render' });
    access.mockResolvedValue();
    readFile.mockRejectedValue(Object.assign(new Error('nope'), { code: 'ENOENT' }));
    expect(await RemotionService.renderCurrency('j', {})).toEqual({ current: false, reason: 'no-previous-render' });
  });
});
