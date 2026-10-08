const {
  NODES, DEPENDS_ON, CHANGE_TYPES, getRegenerationPlan, restorePlan, downstreamOf, changeTypeFor,
} = require('../../src/services/scene/dependencyGraph');

describe('graph shape', () => {
  it('only references nodes it defines, and has no cycles', () => {
    for (const [node, deps] of Object.entries(DEPENDS_ON)) {
      expect(NODES).toContain(node);
      deps.forEach((d) => expect(NODES).toContain(d));
    }
    // A node reachable from itself would mean a change that never settles.
    for (const node of NODES) expect(downstreamOf([node]).has(node)).toBe(false);
  });

  it('makes the render depend on the composition, and nothing depend on the render', () => {
    expect(DEPENDS_ON.render).toEqual(['scene-composition']);
    expect(downstreamOf(['render']).size).toBe(0);
  });
});

describe('getRegenerationPlan - the documented cases', () => {
  it('image changed: only the composition and the render are rebuilt', () => {
    const plan = getRegenerationPlan('sce-1', 'image');
    expect(plan.changed).toEqual(['image']);
    expect(plan.regenerate).toEqual(['scene-composition', 'render']);
    expect(plan.reusable).toEqual(expect.arrayContaining(['script', 'audio', 'captions']));
    expect(plan.reusable).not.toContain('image');
    expect(plan.stages).toEqual(['images', 'assets', 'render', 'upload']);
  });

  it('voice changed: audio, then caption timing, composition and render', () => {
    const plan = getRegenerationPlan('sce-1', 'voice');
    expect(plan.changed).toEqual(['audio']);
    expect(plan.regenerate).toEqual(['captions', 'scene-composition', 'render']);
    expect(plan.produce).toEqual(['audio', 'captions']);
    expect(plan.reusable).toEqual(expect.arrayContaining(['script', 'image', 'layout']));
    expect(plan.stages).toEqual(['audio', 'assets', 'render', 'upload']);
  });

  it('script changed: audio, captions, composition and render - but not the image', () => {
    const plan = getRegenerationPlan('sce-1', 'script');
    expect(plan.changed).toEqual(['script']);
    expect(plan.regenerate).toEqual(['audio', 'captions', 'scene-composition', 'render']);
    expect(plan.produce).toEqual(['audio', 'captions']);
    expect(plan.reusable).toContain('image');
    expect(plan.stages).not.toContain('images');
  });

  it('layout changed: composition and render only - no model runs at all', () => {
    const plan = getRegenerationPlan('sce-1', 'layout');
    expect(plan.changed).toEqual(['layout']);
    expect(plan.regenerate).toEqual(['scene-composition', 'render']);
    expect(plan.produce).toEqual([]);
    expect(plan.reusable).toEqual(expect.arrayContaining(['script', 'audio', 'captions', 'image']));
    expect(plan.stages).toEqual(['assets', 'render', 'upload']);
  });

  it.each(['motion', 'transition'])('%s changed behaves like a layout change', (type) => {
    const plan = getRegenerationPlan('sce-1', type);
    expect(plan.regenerate).toEqual(['scene-composition', 'render']);
    expect(plan.produce).toEqual([]);
  });

  it('a style change ("more cinematic") touches layout, motion and transition together', () => {
    const plan = getRegenerationPlan('sce-1', 'style');
    expect(plan.changed).toEqual(['layout', 'motion', 'transition']);
    expect(plan.produce).toEqual([]);
    expect(plan.reusable).toEqual(expect.arrayContaining(['script', 'audio', 'captions', 'image']));
  });

  it('regenerating the scene takes a fresh voice and picture, keeping script and layout', () => {
    const plan = getRegenerationPlan('sce-1', 'scene');
    expect(plan.changed).toEqual(['audio', 'image']);
    expect(plan.produce).toEqual(['audio', 'captions', 'image']);
    expect(plan.reusable).toEqual(expect.arrayContaining(['script', 'layout', 'motion', 'transition']));
  });
});

describe('getRegenerationPlan - invariants', () => {
  it.each(Object.keys(CHANGE_TYPES))('%s: changed, regenerate and reusable partition the graph', (type) => {
    const plan = getRegenerationPlan('sce-1', type);
    const all = [...plan.changed, ...plan.regenerate, ...plan.reusable];
    expect([...all].sort()).toEqual([...NODES].sort());
    expect(new Set(all).size).toBe(NODES.length);
  });

  it.each(Object.keys(CHANGE_TYPES))('%s: every change rebuilds the composition and the render', (type) => {
    const plan = getRegenerationPlan('sce-1', type);
    expect([...plan.changed, ...plan.regenerate]).toEqual(expect.arrayContaining(['scene-composition', 'render']));
  });

  it('lists stages in pipeline order', () => {
    const plan = getRegenerationPlan('sce-1', 'scene');
    expect(plan.stages).toEqual(['audio', 'images', 'assets', 'render', 'upload']);
  });

  it('does not produce a part the caller already has', () => {
    const plan = getRegenerationPlan('sce-1', 'image', { supplied: ['image'] });
    expect(plan.produce).toEqual([]);
    expect(plan.regenerate).toEqual(['scene-composition', 'render']);
  });

  it('accepts an explicit changed set (what the version recorder finds by fingerprint)', () => {
    const plan = getRegenerationPlan('sce-1', 'custom', { changed: ['image', 'layout'] });
    expect(plan.changed).toEqual(['image', 'layout']);
    expect(plan.regenerate).toEqual(['scene-composition', 'render']);
  });

  it('rejects unknown change types and parts', () => {
    expect(() => getRegenerationPlan('sce-1', 'nope')).toThrow(/Unknown change type/);
    expect(() => getRegenerationPlan('sce-1', 'x', { changed: ['bogus'] })).toThrow(/Unknown scene part/);
  });

  it('carries the scene id through', () => {
    expect(getRegenerationPlan('sce-abc', 'layout').sceneId).toBe('sce-abc');
  });
});

describe('restorePlan', () => {
  it('rebuilds only the composition and render - the restored state is already consistent', () => {
    const plan = restorePlan('sce-1', ['audio', 'image']);
    expect(plan.regenerate).toEqual(['scene-composition', 'render']);
    expect(plan.produce).toEqual([]);
    expect(plan.stages).toEqual(['assets', 'render', 'upload']);
  });

  it('has nothing to do when nothing differs', () => {
    expect(restorePlan('sce-1', [])).toMatchObject({ regenerate: [], stages: [], produce: [] });
  });
});

describe('changeTypeFor', () => {
  it('names the change type for an exact set of parts, in any order', () => {
    expect(changeTypeFor(['audio'])).toBe('voice');
    expect(changeTypeFor(['transition', 'layout', 'motion'])).toBe('style');
    expect(changeTypeFor(['image', 'audio'])).toBe('scene');
  });
  it('is null for a combination with no name', () => {
    expect(changeTypeFor(['script', 'image'])).toBeNull();
  });
});
