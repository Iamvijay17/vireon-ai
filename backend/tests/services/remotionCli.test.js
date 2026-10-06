/**
 * Render progress comes from parsing Remotion's plain-text CLI output; the
 * weights mirror Remotion's own (bundling 0.3, rendering 0.6, stitching 0.1).
 */
const { parseRemotionProgressLine, remotionProgressFraction } = require('../../src/services/video/remotionCli');

const fresh = () => ({ bundling: 0, rendering: 0, stitching: 0 });

describe('parseRemotionProgressLine', () => {
  it('tracks each phase and implies the earlier ones are done', () => {
    const state = fresh();
    expect(parseRemotionProgressLine('Bundling 50%', state)).toBe(true);
    expect(remotionProgressFraction(state)).toBeCloseTo(0.15);

    expect(parseRemotionProgressLine('Rendered 30/60', state)).toBe(true);
    expect(state).toMatchObject({ bundling: 1, rendering: 0.5 });
    expect(remotionProgressFraction(state)).toBeCloseTo(0.6);

    expect(parseRemotionProgressLine('Encoded 60/60', state)).toBe(true);
    expect(remotionProgressFraction(state)).toBeCloseTo(1);
  });

  it('ignores lines that are not progress', () => {
    const state = fresh();
    expect(parseRemotionProgressLine('Copying public dir...', state)).toBe(false);
    expect(state).toEqual(fresh());
  });
});
