const {
  planLayouts, planCameraMotions, planTransitions, mergeItems, densityOf, diversityReport, eligibleLayouts, LAYOUT_ITEM_CAP,
} = require('../../src/services/director/DiversityPlanner');
const { profileOf, semanticCues } = require('../../src/services/director/layoutCompat');

/** A planning entry the way DirectorPlanner builds one. */
const entry = (over = {}) => {
  const scene = {
    sceneNumber: over.sceneNumber || 1,
    sceneType: 'content',
    title: 'T',
    audio: { text: 'Plain narration about a subject.' },
    scene_meta: { content: ['One thing.', 'Another thing.', 'A third thing.', 'A fourth thing.'] },
    ...over.scene,
  };
  const hasImage = Boolean(over.hasImage);
  const profile = profileOf(scene, { hasImage });
  return {
    sceneNumber: scene.sceneNumber,
    scene,
    isPodcast: false,
    hasImage,
    profile,
    cues: semanticCues(scene, profile),
    beat: 1,
    purpose: 'explanation',
    strategy: 'list',
    directorLayout: '',
    directorCamera: null,
    directorTransition: null,
    density: densityOf(profile),
    motionPool: [],
    ...over.entry,
  };
};

const run = (n, make) => Array.from({ length: n }, (_, i) => entry({ ...make?.(i), sceneNumber: i + 1 }));

const maxRun = (list) => {
  let best = 0;
  let current = 0;
  list.forEach((v, i) => { current = i > 0 && list[i - 1] === v ? current + 1 : 1; best = Math.max(best, current); });
  return best;
};

describe('planLayouts - variety across neighbours', () => {
  it('never repeats a layout back to back when the content allows an alternative', () => {
    const layouts = planLayouts(run(10));
    layouts.forEach((layout, i) => { if (i > 0) expect(layout).not.toBe(layouts[i - 1]); });
    expect(maxRun(layouts)).toBe(1);
  });

  it('uses several different layouts across a long run of similar scenes', () => {
    // Three points fit every list-like layout; four would overflow a paragraph stack.
    const three = () => ({ scene: { scene_meta: { content: ['One.', 'Two.', 'Three.'] } } });
    expect(new Set(planLayouts(run(9, three))).size).toBe(3);
  });

  it('does not squeeze four points into a layout that holds three', () => {
    expect(planLayouts(run(9))).not.toContain('paragraph-stack');
  });

  it('turns four picture scenes in a row into alternating layouts, not splitImage x4', () => {
    const layouts = planLayouts(run(4, () => ({ hasImage: true, entry: { directorLayout: 'split-image', strategy: 'split-visual' } })));
    expect(layouts).toEqual(['split-image', 'image-fullbleed', 'split-image', 'image-fullbleed']);
  });

  it('overrides the Director\'s own repeated pick when a fitting alternative exists', () => {
    const layouts = planLayouts(run(3, () => ({ entry: { directorLayout: 'stack-list' } })));
    expect(layouts[0]).toBe('stack-list');
    expect(layouts[1]).not.toBe('stack-list');
    expect(maxRun(layouts)).toBe(1);
  });

  it('keeps the Director\'s pick when it does not repeat a neighbour', () => {
    const layouts = planLayouts([
      entry({ entry: { directorLayout: 'stack-list' } }),
      entry({ sceneNumber: 2, entry: { directorLayout: 'grid' } }),
      entry({ sceneNumber: 3, entry: { directorLayout: 'paragraph-stack' } }),
    ]);
    expect(layouts).toEqual(['stack-list', 'grid', 'paragraph-stack']);
  });

  it('reproduces the documented target: title -> image -> list -> stat -> comparison', () => {
    const layouts = planLayouts([
      entry({ scene: { sceneType: 'title', scene_meta: { content: [] } } }),
      entry({ sceneNumber: 2, hasImage: true, entry: { strategy: 'split-visual' } }),
      entry({ sceneNumber: 3, entry: { strategy: 'list', directorLayout: 'stack-list' } }),
      entry({ sceneNumber: 4, scene: { scene_meta: { content: ['87% of users'] }, audio: { text: 'A striking figure.' } }, entry: { strategy: 'statistics' } }),
      entry({ sceneNumber: 5, scene: { scene_meta: { content: ['Cats', 'Dogs'] }, audio: { text: 'Cats versus dogs, what differs?' } }, entry: { strategy: 'comparison' } }),
    ]);
    expect(layouts).toEqual(['title-only', 'split-image', 'stack-list', 'stat-highlight', 'comparison-split']);
  });

  it('is deterministic', () => {
    expect(planLayouts(run(12))).toEqual(planLayouts(run(12)));
  });
});

describe('planLayouts - fit and meaning', () => {
  it('never plans a layout the content cannot fill', () => {
    // Four points can never be a stat or a comparison; no picture means no image layouts.
    for (const layout of planLayouts(run(8))) {
      expect(['stat-highlight', 'comparison-split', 'split-image', 'image-fullbleed', 'title-only']).not.toContain(layout);
    }
  });

  it('plans a timeline only for ordered content (or when the Director asked for it)', () => {
    const plain = eligibleLayouts(entry());
    expect(plain).not.toContain('timeline');
    const ordered = eligibleLayouts(entry({ scene: { audio: { text: 'First we plan, then we build, finally we ship.' } } }));
    expect(ordered).toContain('timeline');
    const asked = eligibleLayouts(entry({ entry: { directorLayout: 'timeline' } }));
    expect(asked).toContain('timeline');
  });

  it('plans a comparison only for a contrast between exactly two things', () => {
    const two = (text) => entry({ scene: { scene_meta: { content: ['Cats', 'Dogs'] }, audio: { text } } });
    expect(eligibleLayouts(two('Cats versus dogs.'))).toContain('comparison-split');
    expect(eligibleLayouts(two('Some animals.'))).not.toContain('comparison-split');
  });

  it('a title card stays a title card and an image scene stays full-bleed', () => {
    expect(planLayouts([entry({ scene: { sceneType: 'title', scene_meta: { content: [] } } })])).toEqual(['title-only']);
    expect(planLayouts([entry({ scene: { sceneType: 'image', scene_meta: { content: [] } } })])).toEqual(['image-fullbleed']);
  });

  it('leaves podcasts to the engine', () => {
    expect(planLayouts([entry({ entry: { isPodcast: true } })])).toEqual(['']);
  });

  it('leaves the choice to the engine when nothing fits', () => {
    const none = entry({ scene: { scene_meta: { content: [] } } });
    // no list, no body, but a title -> quote-feature is the only fit
    expect(planLayouts([none])).toEqual(['quote-feature']);
  });

  it('avoids a layout too small for the number of points', () => {
    const six = entry({ scene: { scene_meta: { content: Array.from({ length: 6 }, (_, i) => `Point ${i}.`) } } });
    expect(planLayouts([six])[0]).toBe('grid'); // stack-list caps at 5, paragraph-stack at 3
  });

  it('gives the viewer a breather after a stretch of dense text when a focal layout fits', () => {
    const dense = (n) => entry({ sceneNumber: n });
    const stat = entry({ sceneNumber: 4, scene: { scene_meta: { content: ['87% of users'] }, audio: { text: 'x' } } });
    const layouts = planLayouts([dense(1), dense(2), dense(3), stat]);
    expect(layouts[3]).toBe('stat-highlight');
  });
});

describe('density guard', () => {
  it('merges extra points into the layout\'s capacity without losing a word', () => {
    const points = Array.from({ length: 8 }, (_, i) => `Point number ${i}.`);
    const merged = mergeItems(points, 5);
    expect(merged).toHaveLength(5);
    expect(merged.join(' ').replace(/[;\s]+/g, ' ')).toBe(points.join(' ').replace(/[;\s]+/g, ' '));
  });

  it('merges the shortest neighbours first and keeps order', () => {
    const merged = mergeItems(['A long first point here.', 'B.', 'C.', 'A long last point here.'], 3);
    expect(merged).toEqual(['A long first point here.', 'B. C.', 'A long last point here.']);
  });

  it('joins fragments with a semicolon when the first does not end a sentence', () => {
    expect(mergeItems(['one', 'two', 'three'], 2)[0]).toBe('one; two');
  });

  it('leaves a list that already fits untouched', () => {
    expect(mergeItems(['a', 'b'], 5)).toEqual(['a', 'b']);
  });

  it('exposes a capacity for each list-like layout', () => {
    expect(LAYOUT_ITEM_CAP).toMatchObject({ 'stack-list': 5, grid: 6, timeline: 5, 'paragraph-stack': 3 });
  });

  it('labels how much there is to read', () => {
    expect(densityOf({ hasImage: false, body: '', itemCount: 6, density: 'short' })).toBe('dense');
    expect(densityOf({ hasImage: false, body: '', itemCount: 3, density: 'paragraph' })).toBe('dense');
    expect(densityOf({ hasImage: false, body: '', itemCount: 3, density: 'short' })).toBe('balanced');
    expect(densityOf({ hasImage: false, body: '', itemCount: 1, density: 'short' })).toBe('light');
    expect(densityOf({ hasImage: true, body: 'x'.repeat(300), itemCount: 0, density: 'short' })).toBe('dense');
  });
});

describe('planCameraMotions - avoiding excessive motion', () => {
  const entries = (n, over) => run(n, () => over);

  it('never repeats a moving camera move back to back', () => {
    const e = entries(8, { hasImage: true });
    const layouts = e.map(() => 'split-image');
    const moves = planCameraMotions(e, layouts);
    moves.forEach((m, i) => { if (i > 0 && m !== 'static') expect(m).not.toBe(moves[i - 1]); });
  });

  it('never moves in more than two scenes in a row', () => {
    const e = entries(10, { hasImage: true });
    const moves = planCameraMotions(e, e.map(() => 'split-image'));
    let run3 = 0;
    moves.forEach((m) => { run3 = m !== 'static' ? run3 + 1 : 0; expect(run3).toBeLessThanOrEqual(2); });
  });

  it('keeps dense text still', () => {
    const e = run(3, () => ({ scene: { scene_meta: { content: Array.from({ length: 6 }, (_, i) => `Point ${i}.`) } } }));
    expect(planCameraMotions(e, e.map(() => 'grid'))).toEqual(['static', 'static', 'static']);
  });

  it('turns a pan the other way from the last one', () => {
    const e = [entry({ hasImage: true }), entry({ sceneNumber: 2 }), entry({ sceneNumber: 3, hasImage: true })];
    const moves = planCameraMotions(e, ['split-image', 'stack-list', 'split-image']);
    expect(moves[0]).toBe('pan-left');
  });

  it('honours an explicit pick that suits the scene', () => {
    const e = [entry({ entry: { directorCamera: 'zoom-out' } })];
    expect(planCameraMotions(e, ['stack-list'])).toEqual(['zoom-out']);
  });

  it('prefers the story\'s own motion vocabulary', () => {
    const e = [entry({ hasImage: true, entry: { motionPool: ['zoom-in'] } })];
    expect(planCameraMotions(e, ['split-image'])).toEqual(['zoom-in']);
  });

  it('only ever returns a move the renderer has', () => {
    const e = run(12, () => ({ hasImage: true, entry: { motionPool: ['slide', 'barrel-roll'] } }));
    for (const m of planCameraMotions(e, e.map(() => 'split-image'))) {
      expect(['static', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right']).toContain(m);
    }
  });
});

describe('planTransitions', () => {
  const beats = (list) => list.map((beat, i) => entry({ sceneNumber: i + 1, entry: { beat } }));

  it('uses a soft fade inside a beat', () => {
    expect(planTransitions(beats([1, 1, 1, 1]))).toEqual(['fade', 'fade', 'fade', 'fade']);
  });

  it('marks a change of beat with a firmer transition', () => {
    const t = planTransitions(beats([1, 1, 2, 2, 3]));
    expect(t[1]).toBe('fade');
    expect(['slide', 'slideUp', 'wipe']).toContain(t[2]);
    expect(t[3]).toBe('fade');
    expect(['slide', 'slideUp', 'wipe']).toContain(t[4]);
  });

  it('never uses the same firm transition twice in a row', () => {
    const t = planTransitions(beats([1, 2, 3, 4, 5, 6]));
    t.forEach((v, i) => { if (i > 0 && v !== 'fade') expect(v).not.toBe(t[i - 1]); });
  });

  it('keeps an explicit pick, unless it repeats a firm transition', () => {
    const e = beats([1, 1, 1]);
    e[1].directorTransition = 'wipe';
    e[2].directorTransition = 'wipe';
    const t = planTransitions(e);
    expect(t[1]).toBe('wipe');
    expect(t[2]).toBe('fade');
  });

  it('rations the strongest transitions', () => {
    const e = beats([1, 1, 1, 1, 1, 1, 1]);
    e.forEach((x, i) => { if (i > 0) x.directorTransition = 'irisWipe'; });
    const t = planTransitions(e);
    expect(t.filter((v) => v === 'irisWipe').length).toBeLessThanOrEqual(2);
  });

  it('closes the video on a zoom at the final boundary', () => {
    const e = beats([1, 1, 2]);
    e[2].purpose = 'conclusion';
    expect(planTransitions(e)[2]).toBe('zoom');
  });

  it('only returns transitions the renderer has', () => {
    const e = beats([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const t of planTransitions(e)) {
      expect(['fade', 'dissolve', 'cut', 'none', 'slide', 'slideUp', 'wipe', 'irisWipe', 'zoom']).toContain(t);
    }
  });
});

describe('diversityReport', () => {
  it('scores a varied sequence above a repetitive one', () => {
    const varied = diversityReport(['title-only', 'split-image', 'stack-list', 'stat-highlight', 'comparison-split']);
    const repetitive = diversityReport(['split-image', 'split-image', 'split-image', 'split-image']);
    expect(varied.score).toBeGreaterThan(repetitive.score);
    expect(varied.maxLayoutRun).toBe(1);
    expect(repetitive.maxLayoutRun).toBe(4);
    expect(repetitive.layoutCounts).toEqual({ 'split-image': 4 });
  });

  it('copes with an empty or all-engine-decided plan', () => {
    expect(diversityReport([])).toMatchObject({ maxLayoutRun: 0 });
    expect(diversityReport(['', ''])).toMatchObject({ layoutCounts: {} });
  });
});
