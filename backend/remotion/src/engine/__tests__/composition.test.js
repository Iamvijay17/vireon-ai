import test from 'node:test';
import assert from 'node:assert/strict';

import { COMPOSITION_SLOTS, resolveComposition, applyTextMotion, imageMotionDamping } from '../composition';
import {
  IMAGE_MOTION_IDS, IMAGE_MOTION_REGISTRY, computeImageTransform, imageTransformToCss,
} from '../imageMotion';
import { LAYOUT_IDS, isLayoutCompatible } from '../layoutHint';
import { CAMERA_MOTION_IDS } from '../../camera';

// ---------------------------------------------------------------------------
// The contract with the backend's registry (backend/src/ir/compositionRegistry.js,
// pinned by backend/tests/ir/compositionRegistry.test.js). Same literals on both
// sides: the Director may only name something the renderer can draw.
// ---------------------------------------------------------------------------

const sorted = (list) => [...list].sort();

test('composition slots: the ids match the backend registry literals', () => {
  assert.deepEqual(sorted(COMPOSITION_SLOTS.layout), [
    'comparison-split', 'grid', 'image-fullbleed', 'paragraph-stack', 'podcast-centered', 'podcast-split',
    'quote-feature', 'split-image', 'stack-list', 'stat-highlight', 'timeline', 'title-only',
  ]);
  assert.deepEqual(sorted(COMPOSITION_SLOTS.background), ['aurora', 'blobs', 'glow', 'gradient', 'grid', 'meshGradient', 'particles', 'solid']);
  assert.deepEqual(sorted(COMPOSITION_SLOTS.decoration), ['arrows', 'connectingLines', 'dots', 'floatingShapes', 'geometric', 'orbit', 'waves']);
  assert.deepEqual(sorted(COMPOSITION_SLOTS.textMotion), [
    'blurIn', 'bounceIn', 'fadeIn', 'fadeSlideLeft', 'fadeSlideUp', 'maskWipe', 'popIn', 'rotateIn', 'scaleIn', 'typewriterReveal',
  ]);
  assert.deepEqual(sorted(COMPOSITION_SLOTS.imageMotion), ['driftUp', 'none', 'slowPan', 'slowZoom']);
  assert.deepEqual(COMPOSITION_SLOTS.camera, ['static', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right']);
  assert.deepEqual(sorted(COMPOSITION_SLOTS.transition), ['cut', 'dissolve', 'fade', 'irisWipe', 'none', 'slide', 'slideUp', 'wipe', 'zoom']);
});

test('composition slots: every canonical camera move is one the camera module knows', () => {
  for (const move of COMPOSITION_SLOTS.camera) assert.ok(CAMERA_MOTION_IDS.includes(move) || move === 'static', move);
});

// The Director plans layouts against a port of this function (backend/src/services/director/layoutCompat.js);
// backend/tests/director/layoutCompat.test.js holds the same table. A row that
// differs on either side means the Director would plan a layout the engine ignores.
test('layout compatibility: parity table shared with the backend Director', () => {
  const profile = (over = {}) => ({ sceneType: 'content', title: 'T', body: '', items: [], itemCount: 0, hasImage: false, ...over });
  const items = (n) => Array.from({ length: n }, (_, i) => ({ heading: '', text: `point ${i + 1}` }));
  const table = [
    [profile({ sceneType: 'title' }), ['title-only', 'quote-feature']],
    [profile({ itemCount: 1, items: items(1) }), ['stack-list', 'paragraph-stack', 'stat-highlight']],
    [profile({ itemCount: 2, items: items(2) }), ['stack-list', 'paragraph-stack', 'grid', 'timeline', 'comparison-split']],
    [profile({ itemCount: 4, items: items(4) }), ['stack-list', 'paragraph-stack', 'grid', 'timeline']],
    [profile({ sceneType: 'contentwithimage', hasImage: true, body: 'prose' }), ['split-image', 'image-fullbleed']],
    [profile({ sceneType: 'image', hasImage: true }), ['image-fullbleed']],
    [profile({ sceneType: 'podcast' }), ['podcast-split', 'podcast-centered']],
    [profile({ body: 'a long paragraph of prose' }), ['quote-feature']],
  ];
  for (const [p, fits] of table) {
    const actual = LAYOUT_IDS.filter((layout) => isLayoutCompatible(layout, p));
    assert.deepEqual(sorted(actual), sorted(fits), JSON.stringify(p));
  }
});

// ---------------------------------------------------------------------------
// resolveComposition / applyTextMotion
// ---------------------------------------------------------------------------

test('resolveComposition keeps valid overrides and drops everything else', () => {
  assert.deepEqual(
    resolveComposition({ composition: { background: 'aurora', decoration: 'dots', textMotion: 'fadeSlideUp', imageMotion: 'slowZoom' } }),
    { background: 'aurora', decoration: 'dots', textMotion: 'fadeSlideUp', imageMotion: 'slowZoom' },
  );
  assert.deepEqual(resolveComposition({ composition: { background: 'plasma', decoration: 4, textMotion: null, extra: 'x' } }), {});
  for (const bad of [undefined, null, {}, { composition: null }, { composition: 'aurora' }]) {
    assert.deepEqual(resolveComposition(bad), {});
  }
});

test('resolveComposition does not let layout/camera/transition through - they have their own fields', () => {
  assert.deepEqual(resolveComposition({ composition: { layout: 'grid', camera: 'zoom-in', transition: 'wipe' } }), {});
});

test('applyTextMotion changes the entrance of text slots only, keeping their timing', () => {
  const slots = [{ id: 't', role: 'title' }, { id: 'i', role: 'image' }, { id: 'l1', role: 'listItem' }, { id: 'b', role: 'body' }];
  const plan = {
    t: { type: 'bounceIn', delay: 6, duration: 20 },
    i: { type: 'scaleIn', delay: 12, duration: 24 },
    l1: { type: 'blurIn', delay: 18, duration: 22 },
    b: { type: 'fadeIn', delay: 24, duration: 19 },
  };
  const out = applyTextMotion(plan, slots, 'fadeSlideUp');
  assert.deepEqual(out.t, { type: 'fadeSlideUp', delay: 6, duration: 20 });
  assert.deepEqual(out.l1, { type: 'fadeSlideUp', delay: 18, duration: 22 });
  assert.deepEqual(out.b, { type: 'fadeSlideUp', delay: 24, duration: 19 });
  assert.deepEqual(out.i, plan.i, 'the picture keeps its own entrance');
  assert.equal(plan.t.type, 'bounceIn', 'the original plan is not mutated');
});

test('applyTextMotion with nothing (or something unknown) returns the plan untouched', () => {
  const plan = { t: { type: 'bounceIn', delay: 6, duration: 20 } };
  const slots = [{ id: 't', role: 'title' }];
  assert.equal(applyTextMotion(plan, slots, undefined), plan);
  assert.equal(applyTextMotion(plan, slots, 'barrelRoll'), plan);
});

// ---------------------------------------------------------------------------
// Image motion
// ---------------------------------------------------------------------------

test('image motion: every move keeps the frame filled (scale >= 1) across the whole scene', () => {
  for (const id of IMAGE_MOTION_IDS) {
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const t = computeImageTransform(id, p);
      if (id === 'none') assert.equal(t, null);
      else assert.ok(t.scale >= 1, `${id} @ ${p}: scale ${t.scale}`);
    }
  }
});

test('image motion: a move is a pure function of progress, and progress is clamped', () => {
  assert.deepEqual(computeImageTransform('slowZoom', 0.4), computeImageTransform('slowZoom', 0.4));
  assert.deepEqual(computeImageTransform('slowZoom', -3), computeImageTransform('slowZoom', 0));
  assert.deepEqual(computeImageTransform('slowZoom', 9), computeImageTransform('slowZoom', 1));
});

test('image motion: slowZoom starts at rest and ends zoomed; slowPan crosses the frame', () => {
  assert.equal(computeImageTransform('slowZoom', 0).scale, 1);
  assert.ok(computeImageTransform('slowZoom', 1).scale > 1.05);
  assert.ok(computeImageTransform('slowPan', 0).translateXPct > 0);
  assert.ok(computeImageTransform('slowPan', 1).translateXPct < 0);
});

test('image motion: damping softens the move, and unknown ids do nothing', () => {
  const full = computeImageTransform('slowZoom', 1, 1);
  const half = computeImageTransform('slowZoom', 1, 0.5);
  assert.ok(Math.abs((half.scale - 1) - (full.scale - 1) / 2) < 1e-9);
  assert.equal(computeImageTransform('wobble', 0.5), null);
  assert.equal(computeImageTransform(undefined, 0.5), null);
});

test('image motion: camera and picture do not compound at full strength', () => {
  assert.equal(imageMotionDamping('static'), 1);
  assert.equal(imageMotionDamping(undefined), 1);
  assert.equal(imageMotionDamping('zoom-in'), 0.5);
  assert.equal(imageMotionDamping('pan-left'), 0.5);
});

test('image motion: css output is a transform string, or undefined for no move', () => {
  assert.match(imageTransformToCss(computeImageTransform('driftUp', 0.5)), /^translate\(.+\) scale\(.+\)$/);
  assert.equal(imageTransformToCss(null), undefined);
  assert.ok(IMAGE_MOTION_REGISTRY.none);
});
