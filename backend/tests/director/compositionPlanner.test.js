const { planComposition, BACKGROUND_POOLS, DECORATION_POOLS, TEXT_MOTION_BY_PURPOSE } = require('../../src/services/director/CompositionPlanner');
const registry = require('../../src/ir/compositionRegistry');

const entry = (over = {}) => ({ isPodcast: false, hasImage: false, purpose: 'explanation', density: 'balanced', ...over });
const run = (n, make) => Array.from({ length: n }, (_, i) => entry(make?.(i)));
const same = (value, n) => Array.from({ length: n }, () => value);

describe('planComposition - only what the renderer has', () => {
  it('every pool entry is a registered id', () => {
    for (const pool of Object.values(BACKGROUND_POOLS)) pool.forEach((id) => expect(registry.BACKGROUND_REGISTRY).toContain(id));
    for (const pool of Object.values(DECORATION_POOLS)) pool.forEach((id) => expect(registry.DECORATION_REGISTRY).toContain(id));
    for (const pool of Object.values(TEXT_MOTION_BY_PURPOSE)) pool.forEach((id) => expect(registry.TEXT_MOTION_REGISTRY).toContain(id));
  });

  it('every output survives the registry\'s own sanitiser unchanged', () => {
    const entries = run(12, (i) => ({ hasImage: i % 3 === 0, purpose: ['hook', 'explanation', 'data', 'quote', 'cta'][i % 5] }));
    const layouts = entries.map((e) => (e.hasImage ? 'split-image' : 'stack-list'));
    for (const c of planComposition(entries, layouts, same('static', 12))) {
      expect(registry.sanitizeComposition(c)).toEqual(c);
    }
  });
});

describe('planComposition - variety across neighbours', () => {
  it('does not repeat a background or a text motion within two scenes', () => {
    const entries = run(8);
    const out = planComposition(entries, same('stack-list', 8), same('static', 8));
    for (const slot of ['background', 'textMotion']) {
      out.forEach((c, i) => {
        if (i > 0) expect(c[slot]).not.toBe(out[i - 1][slot]);
      });
    }
  });

  it('varies decoration where the pool allows it', () => {
    const out = planComposition(run(6), same('stack-list', 6), same('static', 6));
    expect(new Set(out.map((c) => c.decoration)).size).toBeGreaterThan(1);
  });

  it('is deterministic', () => {
    const args = () => [run(9, (i) => ({ hasImage: i % 2 === 0 })), same('grid', 9), same('static', 9)];
    expect(planComposition(...args())).toEqual(planComposition(...args()));
  });
});

describe('planComposition - suited to the scene', () => {
  it('uses the engine\'s mood pool for the layout', () => {
    const [stat] = planComposition([entry({ purpose: 'data' })], ['stat-highlight'], ['static']);
    expect(BACKGROUND_POOLS.stat).toContain(stat.background);
    const [timeline] = planComposition([entry()], ['timeline'], ['static']);
    expect(BACKGROUND_POOLS.technical).toContain(timeline.background);
  });

  it('keeps the loud entrances for hooks and calls to action', () => {
    const loud = new Set(['popIn', 'bounceIn', 'rotateIn']);
    const calm = planComposition(run(6, () => ({ purpose: 'explanation' })), same('stack-list', 6), same('static', 6));
    calm.forEach((c) => expect(loud.has(c.textMotion)).toBe(false));
  });

  it('keeps dense text quiet: plainest decoration, gentle entrances only', () => {
    const out = planComposition(run(6, () => ({ density: 'dense', purpose: 'hook' })), same('grid', 6), same('static', 6));
    for (const c of out) {
      expect(c.decoration).toBe('dots');
      expect(['fadeIn', 'fadeSlideUp', 'fadeSlideLeft', 'blurIn']).toContain(c.textMotion);
    }
  });

  it('drifts a picture only when the camera is still', () => {
    const [still, moving] = planComposition(
      [entry({ hasImage: true }), entry({ hasImage: true })],
      ['split-image', 'split-image'],
      ['static', 'pan-left']
    );
    expect(['slowZoom', 'slowPan', 'driftUp']).toContain(still.imageMotion);
    expect(moving.imageMotion).toBe('none');
  });

  it('gives a scene with no picture no image motion', () => {
    const [c] = planComposition([entry()], ['stack-list'], ['static']);
    expect(c).not.toHaveProperty('imageMotion');
  });

  it('rotates the picture\'s drift', () => {
    const out = planComposition(run(4, () => ({ hasImage: true })), same('split-image', 4), same('static', 4));
    out.forEach((c, i) => { if (i > 0) expect(c.imageMotion).not.toBe(out[i - 1].imageMotion); });
  });

  it('leaves podcast turns with their one fixed look', () => {
    expect(planComposition([entry({ isPodcast: true })], [''], ['static'])).toEqual([{}]);
  });
});
