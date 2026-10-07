import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeContent } from '../analyzeContent';
import { solveLayout } from '../solveLayout';
import { choreograph } from '../choreograph';
import { generateStyle } from '../generateStyle';
import { computeMotionStyle, MOTION_IDS, MOTION_REGISTRY } from '../motion';
import { SCENE_IDS, SCENE_REGISTRY } from '../scenes';
import {
  TRANSITION_IDS,
  TRANSITION_REGISTRY,
  getTransitionStyle,
  isHardCut,
  resolveTransitionId,
} from '../../transitions';
import { CAPTION_STYLE_IDS, CAPTION_STYLES, getCaptionStyle } from '../../captions/captionStyles';
import { BACKGROUND_IDS, BACKGROUND_REGISTRY, renderBackground } from '../backgrounds';
import { DECORATION_IDS, DECORATION_REGISTRY, renderDecoration } from '../decorations';
import { VISUAL_STYLE_IDS, VISUAL_STYLES, resolveVisualStyle } from '../visualStyle';
import { chooseBackground, chooseDecoration } from '../chooseVisuals';
import { LAYOUT_IDS, isLayoutCompatible, resolveLayoutHint } from '../layoutHint';
import { computeCameraTransform, cameraTransformToCss, resolveCameraMotion } from '../../camera';
import { analyzeLayout, sortIssues } from '../../qc/analyzeLayout';
import { getActiveSegment, getSegmentIndexAt, getSegmentProgress, isSpeaking, segmentStartFrame } from '../../audioTimeline';

// ---------------------------------------------------------------------------
// Scene routing - representative ContentProfiles should route through
// chooseStrategy() (exercised via solveLayout, since chooseStrategy itself
// isn't exported) to the expected macro composition strategy.
// ---------------------------------------------------------------------------

test('scene routing: representative content shapes resolve to the expected strategy', () => {
  const cases = [
    { scene: { elements: { title: 'Just a title' } }, expected: ['title-only'] },
    { scene: { elements: { title: 'T', body: 'x'.repeat(80) } }, expected: ['quote-feature'] },
    // paragraph-stack and stack-list both build against itemCount generically,
    // so a seeded pick between them is intentional - see solveLayout.js.
    {
      scene: { elements: { title: 'T', items: [{ text: 'x'.repeat(150) }, { text: 'y'.repeat(150) }] } },
      expected: ['paragraph-stack', 'stack-list'],
    },
    { scene: { elements: { title: 'T', items: [{ text: '87% of teams renew' }] } }, expected: ['stat-highlight'] },
    // comparison-split, grid and stack-list all handle exactly 2 items fine
    // structurally, so a seeded pick among them is intentional.
    {
      scene: { elements: { title: 'T', items: [{ heading: 'A', text: 'one' }, { heading: 'B', text: 'two' }] } },
      expected: ['comparison-split', 'grid', 'stack-list'],
    },
    { scene: { elements: { title: 'T', image: 'https://example.com/a.png' } }, expected: ['split-image'] },
    { scene: { sceneType: 'image', elements: { image: 'https://example.com/a.png', caption: 'C' } }, expected: ['image-fullbleed'] },
  ];

  for (const { scene, expected } of cases) {
    const profile = analyzeContent(scene);
    const plan = solveLayout(profile, 'routing-test-seed');
    assert.ok(expected.includes(plan.strategy), `expected one of ${expected.join('/')} for ${JSON.stringify(scene.elements)}, got "${plan.strategy}"`);
    assert.ok(Array.isArray(plan.slots) && plan.slots.length > 0, 'strategy must produce at least one slot');
  }
});

test('scene routing: podcast sceneType always resolves to a podcast strategy', () => {
  const profile = analyzeContent({ sceneType: 'podcast', elements: { title: 'T', hostName: 'H' } });
  const plan = solveLayout(profile, 'podcast-seed');
  assert.ok(['podcast-split', 'podcast-centered'].includes(plan.strategy));
});

test('scene routing: every SCENE_ID has a callable build()', () => {
  for (const id of SCENE_IDS) {
    assert.equal(typeof SCENE_REGISTRY[id].build, 'function', `${id} must export build()`);
  }
});

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

test('motion: every MOTION_ID resolves and computes a style without throwing', () => {
  for (const id of MOTION_IDS) {
    assert.equal(typeof MOTION_REGISTRY[id].compute, 'function', `${id} must export compute()`);
    const style = computeMotionStyle(10, { type: id, delay: 0, duration: 22 });
    assert.equal(typeof style, 'object');
  }
});

test('motion: unknown motion type falls back safely instead of throwing', () => {
  assert.doesNotThrow(() => computeMotionStyle(5, { type: 'not-a-real-motion', delay: 0, duration: 10 }));
});

test('motion: choreograph only ever assigns ids that exist in MOTION_REGISTRY', () => {
  const profile = analyzeContent({
    elements: {
      title: 'T',
      items: [
        { heading: '1', text: 'one' },
        { heading: '2', text: 'two' },
        { heading: '3', text: 'three' },
        { heading: '4', text: 'four' },
      ],
    },
  });
  const plan = solveLayout(profile, 'choreo-seed');
  const motionPlan = choreograph(plan, 'choreo-seed');
  for (const slotId of Object.keys(motionPlan)) {
    assert.ok(MOTION_IDS.includes(motionPlan[slotId].type), `${motionPlan[slotId].type} must be a real MOTION_ID`);
  }
});

// ---------------------------------------------------------------------------
// Backgrounds
// ---------------------------------------------------------------------------

test('backgrounds: every BACKGROUND_ID renders without throwing', () => {
  for (const id of BACKGROUND_IDS) {
    assert.equal(typeof BACKGROUND_REGISTRY[id].render, 'function', `${id} must export render()`);
    assert.doesNotThrow(() => renderBackground(id, { frame: 10, palette: {}, intensity: 0.3, seed: 'bg-seed' }));
  }
});

test('backgrounds: unknown id falls back to solid instead of throwing', () => {
  assert.doesNotThrow(() => renderBackground('not-a-real-background', { frame: 0, seed: 's' }));
});

test('backgrounds: renders safely with no props at all', () => {
  for (const id of BACKGROUND_IDS) {
    assert.doesNotThrow(() => BACKGROUND_REGISTRY[id].render());
  }
});

// ---------------------------------------------------------------------------
// Decorations
// ---------------------------------------------------------------------------

test('decorations: every DECORATION_ID renders without throwing', () => {
  for (const id of DECORATION_IDS) {
    assert.equal(typeof DECORATION_REGISTRY[id].render, 'function', `${id} must export render()`);
    assert.doesNotThrow(() => renderDecoration(id, { frame: 10, palette: {}, intensity: 0.2, seed: 'dec-seed' }));
  }
});

test('decorations: unknown id falls back to dots instead of throwing', () => {
  assert.doesNotThrow(() => renderDecoration('not-a-real-decoration', { frame: 0, seed: 's' }));
});

test('decorations: renders safely with no props at all', () => {
  for (const id of DECORATION_IDS) {
    assert.doesNotThrow(() => DECORATION_REGISTRY[id].render());
  }
});

// ---------------------------------------------------------------------------
// Visual style + visual selection (background/decoration choice)
// ---------------------------------------------------------------------------

test('visualStyle: every VISUAL_STYLE_ID resolves to a preset with background/decoration config', () => {
  for (const id of VISUAL_STYLE_IDS) {
    const style = resolveVisualStyle(id);
    assert.equal(style, VISUAL_STYLES[id]);
    assert.ok(Array.isArray(style.background.preferred) && style.background.preferred.length > 0);
    assert.ok(Array.isArray(style.decoration.preferred) && style.decoration.preferred.length > 0);
  }
});

test('visualStyle: unknown/missing style id falls back to a deterministic seeded pick, never throws', () => {
  assert.doesNotThrow(() => resolveVisualStyle('not-a-real-style', 'job-1'));
  const a = resolveVisualStyle(undefined, 'job-1');
  const b = resolveVisualStyle(undefined, 'job-1');
  assert.equal(a, b, 'same seed must resolve to the same visual style');
  assert.ok(VISUAL_STYLE_IDS.includes(a.id));
});

test('visual selection: chooseBackground/chooseDecoration only ever pick real registry ids', () => {
  const profile = analyzeContent({
    elements: { title: 'T', items: [{ heading: '1', text: 'one' }, { heading: '2', text: 'two' }] },
  });
  const layoutPlan = solveLayout(profile, 'visual-seed');
  const style = resolveVisualStyle('technology');

  const background = chooseBackground({ layoutPlan, style, seed: 'visual-seed' });
  const decoration = chooseDecoration({ layoutPlan, style, seed: 'visual-seed' });

  assert.ok(BACKGROUND_IDS.includes(background.id));
  assert.ok(DECORATION_IDS.includes(decoration.id));
  assert.ok(background.intensity > 0 && background.intensity <= 1);
  assert.ok(decoration.intensity > 0 && decoration.intensity <= 1);
});

test('visual selection: same layoutPlan/style/seed always chooses the same background and decoration', () => {
  const profile = analyzeContent({ elements: { title: 'T', body: 'x'.repeat(80) } });
  const layoutPlan = solveLayout(profile, 'det-visual-seed');
  const style = resolveVisualStyle('futuristic');

  const run = () => ({
    background: chooseBackground({ layoutPlan, style, seed: 'det-visual-seed' }),
    decoration: chooseDecoration({ layoutPlan, style, seed: 'det-visual-seed' }),
  });

  assert.deepEqual(run(), run());
});

test('visual selection: more content coverage never increases decoration intensity (same strategy tag)', () => {
  const style = resolveVisualStyle('modern');

  // Both resolve to the default 'content' tag (see chooseVisuals.js's
  // STRATEGY_TAG map - neither 'stack-list' nor 'paragraph-stack' has an
  // entry there), isolating the coverage effect from the per-tag intensity
  // multiplier so this only exercises Phase 8's content-awareness.
  const sparseProfile = analyzeContent({
    elements: { title: 'T', items: [{ text: 'one' }, { text: 'two' }, { text: 'three' }] },
  });
  const sparsePlan = solveLayout(sparseProfile, 'coverage-seed');
  assert.equal(sparsePlan.strategy, 'stack-list');
  const sparseDecoration = chooseDecoration({ layoutPlan: sparsePlan, style, seed: 'coverage-seed' });

  // itemCount<=3 paragraph-density content is now seeded between
  // 'paragraph-stack' and 'stack-list' (see solveLayout.js) - pinned to a
  // seed that resolves to 'paragraph-stack' here since this test is about
  // the coverage-vs-intensity relationship, not strategy variety (covered
  // separately by the non-repetition tests below).
  const denseProfile = analyzeContent({
    elements: { title: 'T', items: [{ text: 'x'.repeat(150) }, { text: 'y'.repeat(150) }] },
  });
  const densePlan = solveLayout(denseProfile, 'coverage-seed-1');
  assert.equal(densePlan.strategy, 'paragraph-stack');
  const denseDecoration = chooseDecoration({ layoutPlan: densePlan, style, seed: 'coverage-seed-1' });

  assert.ok(
    denseDecoration.intensity <= sparseDecoration.intensity,
    'a content-dense scene must not get stronger decoration than a sparser one',
  );
});

test('visual selection: gracefully handles a missing/empty layoutPlan and style', () => {
  assert.doesNotThrow(() => chooseBackground({ seed: 'x' }));
  assert.doesNotThrow(() => chooseDecoration({ seed: 'x' }));
  const background = chooseBackground({ layoutPlan: { slots: [] }, seed: 'x' });
  const decoration = chooseDecoration({ layoutPlan: { slots: [] }, seed: 'x' });
  assert.ok(BACKGROUND_IDS.includes(background.id));
  assert.ok(DECORATION_IDS.includes(decoration.id));
});

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

test('transitions: every TRANSITION_ID resolves to a style without throwing', () => {
  for (const id of TRANSITION_IDS) {
    assert.doesNotThrow(() => getTransitionStyle(id, 0.5));
    assert.equal(typeof isHardCut(id), 'boolean');
  }
});

test('transitions: unknown/empty transition ids fall back to fade, never throw', () => {
  assert.doesNotThrow(() => getTransitionStyle('', 0.5));
  assert.doesNotThrow(() => getTransitionStyle('totally-unknown', 0.5));
  assert.deepEqual(getTransitionStyle('totally-unknown', 0.4), getTransitionStyle('fade', 0.4));
});

test('transitions: resolveTransitionId prefers an explicit valid id', () => {
  const id = resolveTransitionId({ sceneId: 's1', transition: 'wipe' }, 0);
  assert.equal(id, 'wipe');
});

test('transitions: resolveTransitionId falls back deterministically for missing/invalid ids', () => {
  const missing = resolveTransitionId({ sceneId: 's1' }, 0);
  const empty = resolveTransitionId({ sceneId: 's1', transition: '' }, 0);
  const unknown = resolveTransitionId({ sceneId: 's1', transition: 'not-a-transition' }, 0);
  assert.ok(TRANSITION_REGISTRY[missing]);
  assert.equal(missing, empty);
  assert.equal(missing, unknown);
});

test('transitions: resolveTransitionId varies across different scenes (not chaotic, not constant)', () => {
  const ids = ['s1', 's2', 's3', 's4', 's5'].map((sceneId, i) => resolveTransitionId({ sceneId }, i));
  const uniqueCount = new Set(ids).size;
  assert.ok(uniqueCount > 1, 'expected some variety across different scenes, got all identical');
});

// ---------------------------------------------------------------------------
// Captions
// ---------------------------------------------------------------------------

test('captions: every CAPTION_STYLE_ID resolves to a usable preset', () => {
  for (const id of CAPTION_STYLE_IDS) {
    const preset = getCaptionStyle(id);
    assert.equal(preset, CAPTION_STYLES[id]);
    assert.equal(typeof preset.animation, 'string');
    assert.equal(typeof preset.styleConfig, 'object');
  }
});

test('captions: unknown/missing caption style falls back to boldKaraoke', () => {
  assert.equal(getCaptionStyle('not-a-style'), CAPTION_STYLES.boldKaraoke);
  assert.equal(getCaptionStyle(undefined), CAPTION_STYLES.boldKaraoke);
  assert.equal(getCaptionStyle(''), CAPTION_STYLES.boldKaraoke);
});

// ---------------------------------------------------------------------------
// Backward compatibility - the pre-existing JSON shape (scene_meta, empty
// animation, missing caption/transition fields) must never crash the engine.
// ---------------------------------------------------------------------------

test('backward compat: legacy scene JSON shape renders a full pipeline without throwing', () => {
  const legacyScene = {
    sceneType: 'content',
    transition: 'fade',
    cameraMotion: 'static',
    animation: '',
    scene_meta: { content: [] },
    audio: { text: 'Hello world' },
    elements: { title: 'Legacy Scene' },
  };

  assert.doesNotThrow(() => {
    const profile = analyzeContent(legacyScene);
    const plan = solveLayout(profile, legacyScene.sceneId || 'legacy-seed');
    choreograph(plan, 'legacy-seed');
    resolveTransitionId(legacyScene, 0);
  });
});

test('backward compat: scene missing transition/caption/scene_meta/elements entirely still resolves safely', () => {
  const bareScene = {};
  assert.doesNotThrow(() => {
    const profile = analyzeContent(bareScene);
    const plan = solveLayout(profile, 'bare-seed');
    assert.ok(plan.slots.length >= 0);
  });
  assert.ok(TRANSITION_REGISTRY[resolveTransitionId(bareScene, 0)]);
  assert.equal(getCaptionStyle(bareScene?.theme?.captionStyle), CAPTION_STYLES.boldKaraoke);
});

test('backward compat: unknown transition/caption ids fall back safely instead of crashing', () => {
  assert.doesNotThrow(() => getTransitionStyle('unknown-transition-xyz', 0.5));
  assert.doesNotThrow(() => getCaptionStyle('unknown-caption-xyz'));
});

// ---------------------------------------------------------------------------
// Determinism - same ContentProfile + seed must always produce the same
// strategy/motion/transition result.
// ---------------------------------------------------------------------------

test('determinism: same profile + seed produces identical strategy, motion and transition', () => {
  const scene = {
    sceneId: 'det-scene-1',
    elements: {
      title: 'Determinism Check',
      items: [
        { heading: '1', text: 'one' },
        { heading: '2', text: 'two' },
        { heading: '3', text: 'three' },
        { heading: '4', text: 'four' },
      ],
    },
  };

  const run = () => {
    const profile = analyzeContent(scene);
    const plan = solveLayout(profile, scene.sceneId);
    const motionPlan = choreograph(plan, scene.sceneId);
    const transitionId = resolveTransitionId(scene, 0);
    return { strategy: plan.strategy, motionPlan, transitionId };
  };

  const a = run();
  const b = run();

  assert.equal(a.strategy, b.strategy);
  assert.equal(a.transitionId, b.transitionId);
  assert.deepEqual(a.motionPlan, b.motionPlan);
});

test('determinism: a different seed may (but need not) vary the result, and never throws', () => {
  const scene = { sceneId: 'det-scene-2', elements: { title: 'T', items: [{ text: 'a' }, { text: 'b' }] } };
  assert.doesNotThrow(() => {
    const profile = analyzeContent(scene);
    solveLayout(profile, 'seed-a');
    solveLayout(profile, 'seed-b');
  });
});

// ---------------------------------------------------------------------------
// Non-repetition - across a batch of different seeds (different jobs), the
// same content shape should not collapse onto one strategy/palette/motion
// rhythm every time. This is the actual product requirement ("videos look
// too similar") turned into a regression check, so a future change can't
// silently narrow the variety back down without a test failing.
// ---------------------------------------------------------------------------

const SEEDS = Array.from({ length: 20 }, (_, i) => `non-repetition-job-${i}`);

test('non-repetition: an ambiguous 2-item scene spreads across more than one layout strategy', () => {
  const scene = {
    elements: { title: 'T', items: [{ heading: 'A', text: 'one' }, { heading: 'B', text: 'two' }] },
  };
  const profile = analyzeContent(scene);
  const strategies = new Set(SEEDS.map((seed) => solveLayout(profile, seed).strategy));
  assert.ok(strategies.size > 1, `expected more than one strategy across ${SEEDS.length} seeds, got only: ${[...strategies]}`);
});

test('non-repetition: an ambiguous 4-item scene spreads across more than one layout strategy', () => {
  const scene = {
    elements: {
      title: 'T',
      items: [{ text: 'one' }, { text: 'two' }, { text: 'three' }, { text: 'four' }],
    },
  };
  const profile = analyzeContent(scene);
  const strategies = new Set(SEEDS.map((seed) => solveLayout(profile, seed).strategy));
  assert.ok(strategies.size > 1, `expected more than one strategy across ${SEEDS.length} seeds, got only: ${[...strategies]}`);
});

test('non-repetition: palette hue/background spreads across many distinct values, not a small fixed set', () => {
  const backgrounds = new Set(SEEDS.map((seed) => generateStyle(seed).palette.bg));
  assert.ok(backgrounds.size >= SEEDS.length * 0.9, `expected near-unique backgrounds across ${SEEDS.length} seeds, got only ${backgrounds.size} distinct`);
});

test('non-repetition: motion stagger timing (delay/duration) varies across seeds, not just animation type', () => {
  const scene = {
    elements: {
      title: 'T',
      items: [{ text: 'one' }, { text: 'two' }, { text: 'three' }],
    },
  };
  const profile = analyzeContent(scene);
  const firstItemDelays = new Set();
  const firstItemDurations = new Set();
  for (const seed of SEEDS) {
    const plan = solveLayout(profile, seed);
    const motionPlan = choreograph(plan, seed);
    const firstItemSlot = plan.slots.find((s) => s.role === 'listItem' || s.role === 'body');
    if (!firstItemSlot) continue;
    firstItemDelays.add(motionPlan[firstItemSlot.id].delay);
    firstItemDurations.add(motionPlan[firstItemSlot.id].duration);
  }
  assert.ok(firstItemDelays.size > 1, `expected varied delay across seeds, got only: ${[...firstItemDelays]}`);
  assert.ok(firstItemDurations.size > 1, `expected varied duration across seeds, got only: ${[...firstItemDurations]}`);
});

// ---------------------------------------------------------------------------
// Camera motion - scene.cameraMotion drives a slow whole-scene zoom/pan.
// ---------------------------------------------------------------------------

test('camera motion: static and unknown values render no transform', () => {
  for (const motion of ['static', '', undefined, null, 'whoosh']) {
    assert.equal(computeCameraTransform(motion, 0.5), null, `motion=${motion}`);
    assert.equal(cameraTransformToCss(computeCameraTransform(motion, 0.5)), undefined);
  }
});

test('camera motion: zoom-in grows and zoom-out shrinks, never below scale 1', () => {
  assert.equal(computeCameraTransform('zoom-in', 0).scale, 1);
  assert.ok(computeCameraTransform('zoom-in', 1).scale > 1);
  assert.ok(computeCameraTransform('zoom-out', 0).scale > computeCameraTransform('zoom-out', 1).scale);
  assert.equal(computeCameraTransform('zoom-out', 1).scale, 1);
});

test('camera motion: pans keep scale >= 1 and travel in opposite directions', () => {
  const leftStart = computeCameraTransform('pan-left', 0);
  const leftEnd = computeCameraTransform('pan-left', 1);
  const rightStart = computeCameraTransform('pan-right', 0);
  assert.ok(leftStart.scale >= 1);
  assert.ok(leftEnd.translateXPct < leftStart.translateXPct);
  assert.equal(rightStart.translateXPct, -leftStart.translateXPct);
});

test('camera motion: the LLM/Studio vocabulary ("slide", "tracking") maps onto a real move', () => {
  assert.equal(resolveCameraMotion('slide'), 'pan-left');
  assert.equal(resolveCameraMotion('tracking'), 'pan-right');
  assert.equal(resolveCameraMotion(' Zoom-In '), 'zoom-in');
});

test('camera motion: progress is clamped so out-of-range frames stay valid', () => {
  assert.deepEqual(computeCameraTransform('zoom-in', -3), computeCameraTransform('zoom-in', 0));
  assert.deepEqual(computeCameraTransform('zoom-in', 9), computeCameraTransform('zoom-in', 1));
});

// ---------------------------------------------------------------------------
// Layout hints - the Director's storyboard can pick a composition, but only
// when the scene's own content fits it.
// ---------------------------------------------------------------------------

test('layout hints: the id list matches the backend LAYOUT_IDS (keep in sync with backend/src/ir/templateRegistry.js)', () => {
  assert.deepEqual([...LAYOUT_IDS].sort(), [
    'comparison-split', 'grid', 'image-fullbleed', 'paragraph-stack', 'podcast-centered', 'podcast-split',
    'quote-feature', 'split-image', 'stack-list', 'stat-highlight', 'timeline', 'title-only',
  ]);
});

test('layout hints: a compatible hint is honoured over the heuristic', () => {
  const items = [{ text: 'one' }, { text: 'two' }, { text: 'three' }, { text: 'four' }, { text: 'five' }];
  for (const layout of ['grid', 'timeline', 'stack-list']) {
    const profile = analyzeContent({ elements: { title: 'T', items }, layout });
    assert.equal(solveLayout(profile, 'seed').strategy, layout);
  }
});

test('layout hints: the storyboard field is read too (the Studio preview passes the raw scene)', () => {
  const items = [{ text: 'one' }, { text: 'two' }, { text: 'three' }, { text: 'four' }];
  const profile = analyzeContent({ elements: { title: 'T', items }, storyboard: { layout: 'timeline' } });
  assert.equal(solveLayout(profile, 'seed').strategy, 'timeline');
});

test('layout hints: an incompatible or unknown hint falls back to the heuristic instead of dropping content', () => {
  const twoItems = { elements: { title: 'T', items: [{ text: 'a' }, { text: 'b' }] } };
  for (const layout of ['stat-highlight', 'split-image', 'podcast-split', 'title-only', 'nonsense', '']) {
    const hinted = solveLayout(analyzeContent({ ...twoItems, layout }), 'seed');
    const plain = solveLayout(analyzeContent(twoItems), 'seed');
    assert.equal(hinted.strategy, plain.strategy, `hint "${layout}" should be ignored`);
  }
});

test('layout hints: sceneTypes with a dedicated composition only accept their own family', () => {
  const podcast = analyzeContent({ sceneType: 'podcast', elements: { title: 'T', hostName: 'H', hostImage: 'x.png' } });
  assert.equal(isLayoutCompatible('podcast-centered', podcast), true);
  assert.equal(isLayoutCompatible('grid', podcast), false);
  const image = analyzeContent({ sceneType: 'image', elements: { image: 'x.png', caption: 'C' } });
  assert.equal(isLayoutCompatible('image-fullbleed', image), true);
  assert.equal(isLayoutCompatible('split-image', image), false);
  const content = analyzeContent({ elements: { title: 'T', items: [{ text: 'a' }] } });
  assert.equal(isLayoutCompatible('podcast-split', content), false);
});

test('layout hints: shape requirements - comparison needs exactly 2 items, stat exactly 1, image layouts need an image', () => {
  const two = analyzeContent({ elements: { title: 'T', items: [{ text: 'a' }, { text: 'b' }] } });
  const one = analyzeContent({ elements: { title: 'T', items: [{ text: '87% of teams' }] } });
  const withImage = analyzeContent({ elements: { title: 'T', body: 'text', image: 'x.png' } });
  assert.equal(isLayoutCompatible('comparison-split', two), true);
  assert.equal(isLayoutCompatible('comparison-split', one), false);
  assert.equal(isLayoutCompatible('stat-highlight', one), true);
  assert.equal(isLayoutCompatible('stat-highlight', two), false);
  assert.equal(isLayoutCompatible('split-image', withImage), true);
  assert.equal(isLayoutCompatible('grid', withImage), false);
  assert.equal(resolveLayoutHint({ ...withImage, layoutHint: 'split-image' }), 'split-image');
  assert.equal(resolveLayoutHint({ ...withImage, layoutHint: '' }), null);
});

test('layout hints: scenes without a hint resolve exactly as before', () => {
  const scene = { elements: { title: 'T', items: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }] } };
  const before = solveLayout({ ...analyzeContent(scene), layoutHint: undefined }, 'seed');
  const after = solveLayout(analyzeContent(scene), 'seed');
  assert.equal(before.strategy, after.strategy);
});

// ---------------------------------------------------------------------------
// Motion rest state - every entrance animation must END at identity. The layout
// engine sizes each slot for scale 1 / no offset, so an animation that settles
// anywhere else leaves text permanently larger, shifted or clipped. (bounceIn
// used to settle at scale 1.2: a full-width title ran 48px off the frame.)
// ---------------------------------------------------------------------------

const numbersIn = (text) => (String(text).match(/-?\d+(\.\d+)?/g) || []).map(Number);

test('motion rest state: every entrance animation settles at identity', () => {
  for (const type of MOTION_IDS) {
    for (const spec of [{ type, delay: 0, duration: 20 }, { type, delay: 40, duration: 28 }]) {
      const style = computeMotionStyle(400, spec);
      const label = `${type} (delay ${spec.delay})`;

      if ('opacity' in style) assert.ok(Math.abs(style.opacity - 1) < 0.001, `${label}: opacity ${style.opacity}`);

      if (style.transform) {
        for (const part of style.transform.match(/[a-zA-Z]+\([^)]*\)/g) || []) {
          const expected = part.startsWith('scale') ? 1 : 0;
          for (const n of numbersIn(part)) {
            assert.ok(Math.abs(n - expected) < 0.001, `${label}: ${part} should rest at ${expected}`);
          }
        }
      }
      if (style.filter) {
        for (const n of numbersIn(style.filter)) assert.ok(Math.abs(n) < 0.001, `${label}: ${style.filter} should rest at 0`);
      }
      if (style.clipPath) {
        // fully revealed: an inset with nothing cut, or a circle covering the box
        const revealed = style.clipPath.startsWith('circle')
          ? numbersIn(style.clipPath)[0] >= 100
          : numbersIn(style.clipPath).every((n) => Math.abs(n) < 0.001);
        assert.ok(revealed, `${label}: ${style.clipPath} should be fully revealed`);
      }
    }
  }
});

test('motion rest state: bounceIn still overshoots on the way in', () => {
  let peak = 0;
  for (let frame = 0; frame < 60; frame += 1) {
    const scale = numbersIn(computeMotionStyle(frame, { type: 'bounceIn', delay: 0 }).transform)[0];
    peak = Math.max(peak, scale);
  }
  assert.ok(peak > 1.02, `expected an overshoot above 1, peaked at ${peak}`);
});

// ---------------------------------------------------------------------------
// Layout QC analysis
// ---------------------------------------------------------------------------

const CANVAS_1080 = { width: 1920, height: 1080 };
const textBlock = (over = {}) => ({ role: 'title', text: 'A title', rect: { x: 120, y: 90, w: 800, h: 100 }, clippedLines: 0, totalLines: 1, fontPx: 64, ...over });
const typesOf = (issues) => issues.map((i) => i.type);

test('layout QC: a well-laid-out scene reports nothing', () => {
  const issues = analyzeLayout({
    canvas: CANVAS_1080,
    texts: [textBlock(), textBlock({ role: 'listItem', text: 'point', rect: { x: 120, y: 300, w: 800, h: 60 }, fontPx: 32 })],
  });
  assert.deepEqual(issues, []);
});

test('layout QC: clipped lines are an error and say how many', () => {
  const [issue] = analyzeLayout({ canvas: CANVAS_1080, texts: [textBlock({ clippedLines: 3, totalLines: 8 })] });
  assert.equal(issue.type, 'clipped');
  assert.equal(issue.severity, 'error');
  assert.match(issue.message, /3 of its 8 lines/);
});

test('layout QC: text past the frame edge is an error naming the side; a few px of slack is tolerated', () => {
  const past = analyzeLayout({ canvas: CANVAS_1080, texts: [textBlock({ rect: { x: -48, y: 90, w: 2016, h: 100 } })] });
  assert.equal(past[0].type, 'offscreen');
  assert.equal(past[0].detail.side, 'left');
  const slack = analyzeLayout({ canvas: CANVAS_1080, texts: [textBlock({ rect: { x: -3, y: 90, w: 800, h: 100 } })] });
  assert.deepEqual(typesOf(slack), []);
});

test('layout QC: overlap needs a real share of the smaller block; touching edges is fine', () => {
  const a = textBlock({ rect: { x: 100, y: 100, w: 400, h: 100 } });
  const touching = textBlock({ role: 'body', rect: { x: 100, y: 200, w: 400, h: 100 } });
  assert.deepEqual(typesOf(analyzeLayout({ canvas: CANVAS_1080, texts: [a, touching] })), []);

  const slight = textBlock({ role: 'body', rect: { x: 100, y: 180, w: 400, h: 100 } }); // 20%
  const [warn] = analyzeLayout({ canvas: CANVAS_1080, texts: [a, slight] });
  assert.equal(warn.type, 'overlap');
  assert.equal(warn.severity, 'warn');

  const heavy = textBlock({ role: 'body', rect: { x: 100, y: 120, w: 400, h: 100 } }); // 80%
  assert.equal(analyzeLayout({ canvas: CANVAS_1080, texts: [a, heavy] })[0].severity, 'error');
});

test('layout QC: any overlap with the captions is an error', () => {
  const content = textBlock({ rect: { x: 100, y: 900, w: 800, h: 100 } });
  const issues = analyzeLayout({ canvas: CANVAS_1080, texts: [content], captions: [{ text: 'caption', rect: { x: 100, y: 880, w: 800, h: 100 } }] });
  assert.equal(issues[0].type, 'overlap');
  assert.equal(issues[0].severity, 'error');
});

test('layout QC: a crowded list is summarised as one overlap issue, not one per pair', () => {
  const rows = Array.from({ length: 12 }, (_, i) =>
    textBlock({ role: 'listItem', text: `row ${i}`, rect: { x: 100, y: 100 + i * 20, w: 800, h: 60 }, fontPx: 32 }));
  const overlaps = analyzeLayout({ canvas: CANVAS_1080, texts: rows }).filter((i) => i.type === 'overlap');
  assert.equal(overlaps.length, 1);
  assert.match(overlaps[0].message, /overlapping pairs \(listItem \+ listItem\)/);
  assert.ok(overlaps[0].detail.pairs > 3);
});

test('layout QC: small text warns (labels excepted), and thresholds scale with the canvas', () => {
  assert.deepEqual(typesOf(analyzeLayout({ canvas: CANVAS_1080, texts: [textBlock({ fontPx: 16 })] })), ['small-text']);
  assert.deepEqual(typesOf(analyzeLayout({ canvas: CANVAS_1080, texts: [textBlock({ role: 'label', fontPx: 16 })] })), []);
  // 12px on a 540px-tall canvas is the same proportion as 24px at 1080
  assert.deepEqual(typesOf(analyzeLayout({ canvas: { width: 960, height: 540 }, texts: [textBlock({ fontPx: 12 })] })), []);
});

test('layout QC: many small blocks are one warning that names the smallest', () => {
  const rows = Array.from({ length: 10 }, (_, i) =>
    textBlock({ role: 'listItem', text: `row ${i}`, rect: { x: 100, y: 100 + i * 80, w: 800, h: 60 }, fontPx: i === 4 ? 14 : 20 }));
  const small = analyzeLayout({ canvas: CANVAS_1080, texts: rows }).filter((i) => i.type === 'small-text');
  assert.equal(small.length, 1);
  assert.match(small[0].message, /10 text blocks are small - the smallest is listItem "row 4" at 14px/);
  assert.equal(small[0].detail.count, 10);
});

test('layout QC: failed images and empty scenes', () => {
  assert.deepEqual(typesOf(analyzeLayout({ canvas: CANVAS_1080, texts: [textBlock()], images: [{ src: 'http://x/a.png', loaded: false }] })), ['image-failed']);
  assert.deepEqual(typesOf(analyzeLayout({ canvas: CANVAS_1080 })), ['empty']);
  assert.deepEqual(typesOf(analyzeLayout({ canvas: CANVAS_1080, images: [{ loaded: true }] })), []);
});

test('layout QC: sortIssues puts errors first', () => {
  const sorted = sortIssues([{ type: 'small-text', severity: 'warn' }, { type: 'clipped', severity: 'error' }]);
  assert.deepEqual(sorted.map((i) => i.type), ['clipped', 'small-text']);
});

// ---------------------------------------------------------------------------
// Voice timeline helpers - visuals follow the narration's segments.
// ---------------------------------------------------------------------------

const TIMELINE = [
  { segmentId: 's1', startMs: 0, endMs: 1000, durationMs: 1000 },
  { segmentId: 's2', startMs: 1500, endMs: 2500, durationMs: 1000 },
];

test('audioTimeline: finds the segment being spoken and goes quiet in pauses', () => {
  assert.equal(getActiveSegment(TIMELINE, 15, 30).segmentId, 's1'); // 500ms
  assert.equal(getActiveSegment(TIMELINE, 38, 30), null); // ~1267ms, pause
  assert.equal(getActiveSegment(TIMELINE, 60, 30).segmentId, 's2'); // 2000ms
  assert.equal(isSpeaking(TIMELINE, 38, 30), false);
  assert.equal(isSpeaking(TIMELINE, 15, 30), true);
});

test('audioTimeline: progress and index track the voice', () => {
  assert.equal(getSegmentProgress(TIMELINE, 15, 30), 0.5);
  assert.equal(getSegmentProgress(TIMELINE, 38, 30), 0);
  assert.equal(getSegmentIndexAt(TIMELINE, 0, 30), 0);
  assert.equal(getSegmentIndexAt(TIMELINE, 38, 30), 0);
  assert.equal(getSegmentIndexAt(TIMELINE, 60, 30), 1);
  assert.equal(segmentStartFrame(TIMELINE[1], 30), 45);
});

test('audioTimeline: neutral values when a scene has no timeline', () => {
  for (const t of [undefined, null, []]) {
    assert.equal(getActiveSegment(t, 10, 30), null);
    assert.equal(getSegmentIndexAt(t, 10, 30), -1);
    assert.equal(getSegmentProgress(t, 10, 30), 0);
    assert.equal(isSpeaking(t, 10, 30), false);
  }
});
