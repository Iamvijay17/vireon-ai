import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeContent } from '../analyzeContent';
import { solveLayout } from '../solveLayout';
import { choreograph } from '../choreograph';
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

// ---------------------------------------------------------------------------
// Scene routing - representative ContentProfiles should route through
// chooseStrategy() (exercised via solveLayout, since chooseStrategy itself
// isn't exported) to the expected macro composition strategy.
// ---------------------------------------------------------------------------

test('scene routing: representative content shapes resolve to the expected strategy', () => {
  const cases = [
    { scene: { elements: { title: 'Just a title' } }, expected: 'title-only' },
    { scene: { elements: { title: 'T', body: 'x'.repeat(80) } }, expected: 'quote-feature' },
    {
      scene: { elements: { title: 'T', items: [{ text: 'x'.repeat(150) }, { text: 'y'.repeat(150) }] } },
      expected: 'paragraph-stack',
    },
    { scene: { elements: { title: 'T', items: [{ text: '87% of teams renew' }] } }, expected: 'stat-highlight' },
    {
      scene: { elements: { title: 'T', items: [{ heading: 'A', text: 'one' }, { heading: 'B', text: 'two' }] } },
      expected: 'comparison-split',
    },
    { scene: { elements: { title: 'T', image: 'https://example.com/a.png' } }, expected: 'split-image' },
    { scene: { sceneType: 'image', elements: { image: 'https://example.com/a.png', caption: 'C' } }, expected: 'image-fullbleed' },
  ];

  for (const { scene, expected } of cases) {
    const profile = analyzeContent(scene);
    const plan = solveLayout(profile, 'routing-test-seed');
    assert.equal(plan.strategy, expected, `expected "${expected}" for ${JSON.stringify(scene.elements)}`);
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
