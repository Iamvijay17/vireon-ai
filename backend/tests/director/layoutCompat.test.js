const { profileOf, isLayoutCompatible, semanticCues, estimateSeconds } = require('../../src/services/director/layoutCompat');
const { LAYOUTS } = require('../../src/services/director/vocabulary');

const profile = (over = {}) => ({
  sceneType: 'content', title: 'T', body: '', items: [], itemCount: 0, hasImage: false, density: 'short', ...over,
});
const items = (n) => Array.from({ length: n }, (_, i) => ({ heading: '', text: `point ${i + 1}` }));

/**
 * The same table sits in the engine's own test suite
 * (remotion/src/engine/__tests__/composition.test.js). The Director may only plan
 * a layout the engine will honour, so both ports of `isLayoutCompatible` must
 * agree on every row.
 */
const COMPAT_TABLE = [
  // [description, profile, layouts that fit]
  ['a title card', profile({ sceneType: 'title' }), ['title-only', 'quote-feature']],
  ['one stat', profile({ itemCount: 1, items: items(1) }), ['stack-list', 'paragraph-stack', 'stat-highlight']],
  ['two points', profile({ itemCount: 2, items: items(2) }), ['stack-list', 'paragraph-stack', 'grid', 'timeline', 'comparison-split']],
  ['four points', profile({ itemCount: 4, items: items(4) }), ['stack-list', 'paragraph-stack', 'grid', 'timeline']],
  ['a picture with prose', profile({ sceneType: 'contentwithimage', hasImage: true, body: 'prose' }), ['split-image', 'image-fullbleed']],
  ['a full-bleed image scene', profile({ sceneType: 'image', hasImage: true }), ['image-fullbleed']],
  ['a podcast turn', profile({ sceneType: 'podcast' }), ['podcast-split', 'podcast-centered']],
  ['a lone paragraph', profile({ body: 'a long paragraph of prose' }), ['quote-feature']],
];

describe('isLayoutCompatible - parity with the engine', () => {
  it.each(COMPAT_TABLE)('%s', (_name, p, fits) => {
    const actual = LAYOUTS.filter((layout) => isLayoutCompatible(layout, p));
    expect([...actual].sort()).toEqual([...fits].sort());
  });

  it('rejects an id that is not a layout', () => {
    expect(isLayoutCompatible('carousel', profile({ itemCount: 3, items: items(3) }))).toBe(false);
  });
});

describe('profileOf', () => {
  const scene = (over = {}) => ({
    sceneType: 'content', title: 'Tides', subtitle: 'Why', audio: { text: 'x' },
    scene_meta: { content: ['One.', 'Two.', 'Three.'] }, ...over,
  });

  it('reads a content scene\'s list from scene_meta.content (elements do not exist yet at Director time)', () => {
    expect(profileOf(scene())).toMatchObject({ sceneType: 'content', itemCount: 3, hasImage: false });
  });

  it('prefers built elements when they exist', () => {
    const p = profileOf(scene({ elements: { items: [{ text: 'a' }, { text: 'b' }] } }));
    expect(p.itemCount).toBe(2);
  });

  it('turns a planned picture into an image profile with a body and no list', () => {
    const p = profileOf(scene(), { hasImage: true });
    expect(p).toMatchObject({ sceneType: 'contentwithimage', itemCount: 0, hasImage: true });
    expect(p.body).toContain('One.');
  });

  it('classifies density from item length like the engine', () => {
    expect(profileOf(scene({ scene_meta: { content: ['a'.repeat(30), 'b'.repeat(30)] } })).density).toBe('short');
    expect(profileOf(scene({ scene_meta: { content: ['a'.repeat(100), 'b'.repeat(100)] } })).density).toBe('medium');
    expect(profileOf(scene({ scene_meta: { content: ['a'.repeat(200), 'b'.repeat(200)] } })).density).toBe('paragraph');
  });

  it('survives a scene with nothing in it', () => {
    expect(profileOf({})).toMatchObject({ sceneType: 'content', itemCount: 0 });
  });
});

describe('semanticCues', () => {
  const cues = (narration, content = ['a', 'b', 'c'], title = '') => {
    const scene = { audio: { text: narration }, title, scene_meta: { content } };
    return semanticCues(scene, profileOf(scene));
  };

  it('detects an ordered process', () => {
    expect(cues('First we mix, then we bake, finally we cool.').sequential).toBe(true);
    expect(cues('The moon pulls on the oceans.').sequential).toBe(false);
  });

  it('detects a numbered list as sequence', () => {
    expect(cues('Three things.', ['1. Gather', '2. Mix']).sequential).toBe(true);
  });

  it('detects a contrast', () => {
    expect(cues('Cats versus dogs: what is the difference?', ['a', 'b']).comparison).toBe(true);
    expect(cues('Dogs are loyal.', ['a', 'b']).comparison).toBe(false);
  });

  it('detects a single striking figure', () => {
    expect(cues('Almost all of it.', ['87% of users']).stat).toBe(true);
    expect(cues('Almost all of it.', ['Most users']).stat).toBe(false);
    expect(cues('x', ['87% of users', 'and more']).stat).toBe(false);
  });
});

describe('estimateSeconds', () => {
  it('uses the script budget\'s pacing (130 words a minute)', () => {
    expect(estimateSeconds('word '.repeat(130))).toBeCloseTo(60, 0);
    expect(estimateSeconds('')).toBe(0);
  });
});
