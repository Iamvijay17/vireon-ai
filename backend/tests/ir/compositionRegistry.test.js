const registry = require('../../src/ir/compositionRegistry');

/**
 * These literal lists are the contract with Remotion's registries
 * (remotion/src/engine/__tests__/composition.test.js pins the same ones from the
 * other side). Adding or renaming an id means changing it in both places - which
 * is the point: the Director may only name something the renderer can draw.
 */
describe('composition registry ids', () => {
  it('layouts', () => {
    expect([...registry.LAYOUT_REGISTRY].sort()).toEqual([
      'comparison-split', 'grid', 'image-fullbleed', 'paragraph-stack', 'podcast-centered', 'podcast-split',
      'quote-feature', 'split-image', 'stack-list', 'stat-highlight', 'timeline', 'title-only',
    ]);
  });

  it('backgrounds', () => {
    expect([...registry.BACKGROUND_REGISTRY].sort()).toEqual(['aurora', 'blobs', 'glow', 'gradient', 'grid', 'meshGradient', 'particles', 'solid']);
  });

  it('decorations', () => {
    expect([...registry.DECORATION_REGISTRY].sort()).toEqual(['arrows', 'connectingLines', 'dots', 'floatingShapes', 'geometric', 'orbit', 'waves']);
  });

  it('text motions', () => {
    expect([...registry.TEXT_MOTION_REGISTRY].sort()).toEqual([
      'blurIn', 'bounceIn', 'fadeIn', 'fadeSlideLeft', 'fadeSlideUp', 'maskWipe', 'popIn', 'rotateIn', 'scaleIn', 'typewriterReveal',
    ]);
  });

  it('image motions', () => {
    expect([...registry.IMAGE_MOTION_REGISTRY].sort()).toEqual(['driftUp', 'none', 'slowPan', 'slowZoom']);
  });

  it('camera moves', () => {
    expect([...registry.CAMERA_REGISTRY]).toEqual(['static', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right']);
  });

  it('transitions', () => {
    expect([...registry.TRANSITION_REGISTRY].sort()).toEqual(['cut', 'dissolve', 'fade', 'irisWipe', 'none', 'slide', 'slideUp', 'wipe', 'zoom']);
  });

  it('are frozen, so no caller can extend a registry at runtime', () => {
    for (const list of Object.values(registry.COMPOSITION_SLOTS)) expect(Object.isFrozen(list)).toBe(true);
  });
});

describe('sanitizeComposition', () => {
  it('keeps what the renderer has', () => {
    const input = { layout: 'grid', background: 'aurora', decoration: 'dots', textMotion: 'fadeSlideUp', imageMotion: 'slowZoom', camera: 'zoom-in', transition: 'wipe' };
    expect(registry.sanitizeComposition(input)).toEqual(input);
  });

  it('drops anything it does not, and anything that is not a string', () => {
    expect(registry.sanitizeComposition({ background: 'plasma', decoration: 4, textMotion: null, camera: 'warp', extra: 'x' })).toEqual({});
  });

  it('copes with no input', () => {
    for (const bad of [undefined, null, 'x', 4, []]) expect(registry.sanitizeComposition(bad)).toEqual({});
  });
});
