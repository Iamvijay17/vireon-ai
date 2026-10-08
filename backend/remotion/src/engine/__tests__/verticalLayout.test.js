import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeContent } from '../analyzeContent';
import { solveLayout } from '../solveLayout';
import { SCENE_IDS } from '../scenes';
import { CANVAS, resolveCanvas, orientationOf } from '../scenes/shared';
import { computeMotionStyle } from '../motion';
import {
  DENSITY_TIERS, calculateContentSpacing, densityForCount, designScale, stackBlocks, fitVerticalStack,
} from '../verticalLayout';

// ---------------------------------------------------------------------------
// Vertical layout regression tests - the layout engine owns Y positions: blocks
// are measured, separated by a bounded gap and aligned as one group. Unused
// canvas stays whitespace around the group instead of being spread between
// the blocks.
// ---------------------------------------------------------------------------

const LANDSCAPE = CANVAS; // 1920x1080 (16:9)
const PORTRAIT = resolveCanvas(1080, 1920); // 9:16
const SQUARE = resolveCanvas(1080, 1080); // 1:1

const SHORT_POINTS = ['Faster renders', 'Cleaner layouts', 'Smarter pacing', 'Fewer retries', 'Better captions', 'Stable output', 'Clear audio', 'Crisp images', 'Tidy motion', 'Simple setup'];
const sentence = (n) => `Point ${n}: ` + Array(28).fill('measured').join(' ') + ' and carefully explained so the paragraph wraps onto several lines.';

const plan = ({ title = 'Scene title', items = [], layout, canvas = LANDSCAPE, extra = {} }) => {
  const profile = analyzeContent({ layout, elements: { title, items: items.map((text) => ({ text })), ...extra } });
  return solveLayout(profile, 'vertical-seed', { canvas });
};

const textSlots = (p) => p.slots.filter((s) => s.role !== 'image');
const px = (p, slot) => ({
  top: slot.yPct * p.canvas.height, bottom: (slot.yPct + slot.hPct) * p.canvas.height,
  left: slot.xPct * p.canvas.width, right: (slot.xPct + slot.wPct) * p.canvas.width,
});

/** Distances between vertically consecutive blocks of a single-column scene. */
const gapsOf = (p) => {
  const rects = textSlots(p).map((s) => px(p, s)).sort((a, b) => a.top - b.top);
  return rects.slice(1).map((r, i) => r.top - rects[i].bottom);
};
const groupOf = (p) => {
  const rects = textSlots(p).map((s) => px(p, s));
  return { top: Math.min(...rects.map((r) => r.top)), bottom: Math.max(...rects.map((r) => r.bottom)) };
};
const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
const assertNoCollisions = (p) => {
  const rects = textSlots(p).map((s) => px(p, s));
  rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => assert.ok(!overlaps(a, b), `blocks collide in ${p.strategy}`)));
};
const assertInsideCanvas = (p) => {
  textSlots(p).forEach((s) => {
    const r = px(p, s);
    assert.ok(r.top >= -1 && r.bottom <= p.canvas.height + 1, `${p.strategy}/${s.id} leaves the canvas vertically (${Math.round(r.top)}..${Math.round(r.bottom)} of ${p.canvas.height})`);
    assert.ok(r.left >= -1 && r.right <= p.canvas.width + 1, `${p.strategy}/${s.id} leaves the canvas horizontally`);
  });
};

// --- Test 1 ------------------------------------------------------------------

test('vertical layout: 3 short points get compact, balanced spacing', () => {
  const p = plan({ items: SHORT_POINTS.slice(0, 3), layout: 'stack-list' });
  const [, ...pointGaps] = gapsOf(p); // first gap is title -> first point
  const tier = DENSITY_TIERS.comfortable;

  assert.equal(p.diagnostics.density, 'comfortable');
  assert.ok(pointGaps.every((g) => g >= tier.minGap && g <= tier.maxGap), `gaps ${pointGaps} outside ${tier.minGap}-${tier.maxGap}`);
  assert.equal(new Set(pointGaps).size, 1, 'point gaps are equal');
  assert.ok(gapsOf(p)[0] <= tier.maxGap * 1.25, 'title gap stays bounded');
  assertNoCollisions(p);
});

// --- Test 2 ------------------------------------------------------------------

test('vertical layout: 3 long paragraphs make larger blocks with the same bounded spacing, no collision', () => {
  const short = plan({ items: SHORT_POINTS.slice(0, 3), layout: 'paragraph-stack' });
  const long = plan({ items: [sentence(1), sentence(2), sentence(3)], layout: 'paragraph-stack' });
  const tier = DENSITY_TIERS.comfortable;

  const heightOf = (p) => px(p, textSlots(p).find((s) => s.id === 'item-0'));
  assert.ok(heightOf(long).bottom - heightOf(long).top > 2 * (heightOf(short).bottom - heightOf(short).top), 'long paragraphs measure taller');

  const [, ...gaps] = gapsOf(long);
  assert.ok(gaps.every((g) => g >= tier.minGap && g <= tier.maxGap), `paragraph gaps ${gaps} outside the bounded range`);
  assertNoCollisions(long);
  assertInsideCanvas(long);
  assert.equal(long.diagnostics.overflow, false);
});

// --- Test 3 ------------------------------------------------------------------

test('vertical layout: 6 points automatically use reduced spacing', () => {
  const three = plan({ items: SHORT_POINTS.slice(0, 3), layout: 'stack-list' });
  const six = plan({ items: SHORT_POINTS.slice(0, 6), layout: 'stack-list' });
  const tier = DENSITY_TIERS.balanced;

  assert.equal(six.diagnostics.density, 'balanced');
  assert.ok(six.diagnostics.gap < three.diagnostics.gap, `6-point gap ${six.diagnostics.gap} should be below 3-point gap ${three.diagnostics.gap}`);
  assert.ok(six.diagnostics.gap >= tier.minGap && six.diagnostics.gap <= tier.maxGap);
  assertNoCollisions(six);
});

// --- Test 4 ------------------------------------------------------------------

test('vertical layout: 10 points use a compact layout with no excessive gaps', () => {
  const p = plan({ items: SHORT_POINTS, layout: 'stack-list' });
  const tier = DENSITY_TIERS.compact;

  assert.equal(p.diagnostics.density, 'compact');
  const [, ...pointGaps] = gapsOf(p);
  assert.ok(pointGaps.every((g) => g >= tier.minGap - 0.01 && g <= tier.maxGap + 0.01), `gaps ${pointGaps} outside ${tier.minGap}-${tier.maxGap}`);
  assert.equal(p.diagnostics.overflow, false);
  assertInsideCanvas(p);
  assertNoCollisions(p);
});

// --- Test 5 ------------------------------------------------------------------

test('vertical layout: a very short scene stays grouped; unused space is whitespace, not gaps', () => {
  // The reported bug: title + two descriptions, with the last one pushed to the bottom.
  const p = plan({ title: 'Why it matters', items: ['A short description.', 'Another short description.'], layout: 'paragraph-stack' });
  const group = groupOf(p);
  const gaps = gapsOf(p);

  assert.ok(Math.max(...gaps) <= 72, `gaps ${gaps} should stay bounded, not stretch across the canvas`);
  assert.ok(group.bottom - group.top < LANDSCAPE.height * 0.5, 'the group occupies a fraction of the canvas');
  const above = group.top;
  const below = LANDSCAPE.height - group.bottom;
  assert.ok(Math.abs(above - below) <= 2, `group is centred (above ${above}, below ${below})`);
  assert.ok(above > 150 && below > 150, 'the leftover space is intentional whitespace around the group');
});

// --- Test 6 ------------------------------------------------------------------

test('vertical layout: 9:16 never overflows or leaves excessive gaps, for every strategy', () => {
  assert.equal(orientationOf(PORTRAIT), 'portrait');
  const cases = [
    plan({ items: SHORT_POINTS.slice(0, 3), layout: 'stack-list', canvas: PORTRAIT }),
    plan({ items: SHORT_POINTS, layout: 'stack-list', canvas: PORTRAIT }),
    plan({ items: [sentence(1), sentence(2), sentence(3)], layout: 'paragraph-stack', canvas: PORTRAIT }),
    plan({ items: SHORT_POINTS.slice(0, 5), layout: 'timeline', canvas: PORTRAIT }),
    plan({ items: SHORT_POINTS.slice(0, 4), layout: 'grid', canvas: PORTRAIT }),
    plan({ items: [sentence(1), sentence(2)], layout: 'comparison-split', canvas: PORTRAIT }),
    plan({ items: ['87% of teams renew'], layout: 'stat-highlight', canvas: PORTRAIT }),
    plan({ title: 'Just a title', canvas: PORTRAIT }),
  ];

  cases.forEach((p) => {
    assert.equal(p.diagnostics.overflow, false, `${p.strategy} overflows in 9:16`);
    assertInsideCanvas(p);
    assertNoCollisions(p);
    // Even the title->content gap is bounded (max tier gap x title factor, scaled to canvas).
    gapsOf(p).forEach((g) => assert.ok(g <= 80, `${p.strategy}: ${Math.round(g)}px gap in 9:16`));
  });
});

test('vertical layout: 1:1 works for every strategy that stacks content', () => {
  assert.equal(orientationOf(SQUARE), 'square');
  [
    plan({ items: SHORT_POINTS.slice(0, 4), layout: 'stack-list', canvas: SQUARE }),
    plan({ items: SHORT_POINTS.slice(0, 4), layout: 'grid', canvas: SQUARE }),
    plan({ items: [sentence(1), sentence(2), sentence(3)], layout: 'paragraph-stack', canvas: SQUARE }),
  ].forEach((p) => {
    assert.equal(p.diagnostics.overflow, false);
    assertInsideCanvas(p);
    assertNoCollisions(p);
  });
});

// --- Test 7 ------------------------------------------------------------------

test('vertical layout: 16:9 keeps a balanced, vertically centred composition', () => {
  [3, 5, 7].forEach((count) => {
    const p = plan({ items: SHORT_POINTS.slice(0, count), layout: 'stack-list' });
    const { top, bottom } = groupOf(p);
    assert.ok(Math.abs(top - (LANDSCAPE.height - bottom)) <= 2, `${count} points: group not centred (${top} above, ${LANDSCAPE.height - bottom} below)`);
    assert.equal(p.diagnostics.verticalAlign, 'center');
  });
});

// --- Cross-cutting -----------------------------------------------------------

test('vertical layout: every strategy builds on every aspect ratio without leaving the canvas or colliding', () => {
  const shapes = {
    'title-only': { title: 'A single headline' },
    'stack-list': { items: SHORT_POINTS.slice(0, 4) },
    'paragraph-stack': { items: [sentence(1), sentence(2)] },
    timeline: { items: SHORT_POINTS.slice(0, 4) },
    grid: { items: SHORT_POINTS.slice(0, 4) },
    'comparison-split': { items: ['Before: manual and slow', 'After: automatic and fast'] },
    'stat-highlight': { items: ['87% of teams renew'] },
    'quote-feature': { title: 'Someone', extra: { body: 'The best time to plant a tree was twenty years ago. The second best time is now.' } },
    'split-image': { items: ['Body copy for the split layout.'], extra: { image: 'x.png' } },
    'image-fullbleed': { extra: { image: 'x.png', caption: 'Headline over image', label: 'Kicker' } },
  };
  for (const [layout, shape] of Object.entries(shapes)) {
    for (const canvas of [LANDSCAPE, PORTRAIT, SQUARE]) {
      const sceneType = layout === 'image-fullbleed' ? 'image' : 'content';
      const profile = analyzeContent({
        sceneType, layout,
        elements: { title: shape.title || 'Scene title', items: (shape.items || []).map((text) => ({ text })), ...(shape.extra || {}) },
      });
      const p = solveLayout(profile, 'cross-seed', { canvas });
      assert.equal(p.strategy, layout, `${layout} was not honoured`);
      assertInsideCanvas(p);
      assertNoCollisions(p);
      assert.ok(p.diagnostics, `${layout} reports no diagnostics`);
      assert.deepEqual(p.canvas, { width: canvas.width, height: canvas.height });
    }
  }
  assert.ok(SCENE_IDS.length >= Object.keys(shapes).length);
});

test('vertical layout: a podcast scene stacks its waveform under the text instead of at a fixed Y', () => {
  [LANDSCAPE, PORTRAIT].forEach((canvas) => {
    ['podcast-split', 'podcast-centered'].forEach((layout) => {
      const profile = analyzeContent({
        sceneType: 'podcast', layout,
        elements: { title: 'Episode title', subtitle: 'A subtitle for the episode', hostName: 'Host', hostImage: 'h.png' },
      });
      const p = solveLayout(profile, 'pod-seed', { canvas });
      const lastText = Math.max(...textSlots(p).map((s) => px(p, s).bottom));
      const waveTop = p.waveform.yPct * canvas.height;
      assert.ok(waveTop >= lastText, 'waveform sits below the text');
      assert.ok(waveTop - lastText <= 80, `waveform is ${Math.round(waveTop - lastText)}px under the text`);
      assert.ok(waveTop + 40 <= canvas.height);
    });
  });
});

test('vertical layout: layout is fully determined by the engine - same content, same positions', () => {
  const a = plan({ items: SHORT_POINTS.slice(0, 5), layout: 'timeline' });
  const b = plan({ items: SHORT_POINTS.slice(0, 5), layout: 'timeline' });
  assert.deepEqual(a, b);
});

test('vertical layout: entrance animations are offsets from the solved position, not absolute Y', () => {
  const spec = { type: 'fadeSlideUp', delay: 0, duration: 20 };
  const start = computeMotionStyle(0, spec);
  const end = computeMotionStyle(40, spec);
  assert.ok(!('top' in start) && !('top' in end), 'motion never writes top');
  assert.match(start.transform, /translateY\(\s*[1-9]/, 'enters from below its final position');
  assert.match(end.transform, /translateY\(\s*-?0(px)?\s*\)/, 'settles on the solved position');
});

// --- Utility units -----------------------------------------------------------

test('calculateContentSpacing: density tiers and clamping', () => {
  assert.equal(densityForCount(2), 'comfortable');
  assert.equal(densityForCount(3), 'comfortable');
  assert.equal(densityForCount(4), 'balanced');
  assert.equal(densityForCount(6), 'balanced');
  assert.equal(densityForCount(7), 'compact');

  const base = { canvas: LANDSCAPE, fontSize: 30 };
  const comfortable = calculateContentSpacing({ ...base, blockCount: 3 }).gap;
  const balanced = calculateContentSpacing({ ...base, blockCount: 5 }).gap;
  const compact = calculateContentSpacing({ ...base, blockCount: 9 }).gap;
  assert.ok(comfortable > balanced && balanced > compact);

  // Huge type can't blow the gap past the tier maximum; tiny type can't collapse below the minimum.
  assert.equal(calculateContentSpacing({ ...base, blockCount: 3, fontSize: 400 }).gap, DENSITY_TIERS.comfortable.maxGap);
  assert.equal(calculateContentSpacing({ ...base, blockCount: 3, fontSize: 4 }).gap, DENSITY_TIERS.comfortable.minGap);
  assert.equal(calculateContentSpacing({ ...base, blockCount: 1 }).gap, 0);
});

test('calculateContentSpacing: leftover height never increases the gap, a tight fit reduces it', () => {
  const args = { canvas: LANDSCAPE, fontSize: 30, blockCount: 3, contentHeight: 300 };
  const roomy = calculateContentSpacing({ ...args, availableHeight: 900 }).gap;
  const huge = calculateContentSpacing({ ...args, availableHeight: 5000 }).gap;
  const tight = calculateContentSpacing({ ...args, availableHeight: 340 }).gap;
  assert.equal(roomy, huge);
  assert.ok(tight < roomy);
  assert.ok(tight >= DENSITY_TIERS.comfortable.minGap);
});

test('calculateContentSpacing: scales with the canvas design size', () => {
  assert.equal(designScale(LANDSCAPE), 1);
  assert.equal(designScale(PORTRAIT), 1);
  const small = calculateContentSpacing({ canvas: { width: 960, height: 540 }, fontSize: 200, blockCount: 3 });
  assert.equal(small.maxGap, Math.round(DENSITY_TIERS.comfortable.maxGap * 0.5));
});

test('stackBlocks: positions are sequential (y += height + gap) and aligned as a group', () => {
  const blocks = [{ id: 'a', height: 100 }, { id: 'b', height: 50 }, { id: 'c', height: 80 }];
  const region = { top: 100, bottom: 900 };

  const top = stackBlocks({ blocks, region, gap: 20, align: 'top' });
  assert.deepEqual(top.items.map((b) => b.y), [100, 220, 290]);

  const center = stackBlocks({ blocks, region, gap: 20, align: 'center' });
  assert.equal(center.items[0].y, 100 + (800 - 270) / 2);

  const bottom = stackBlocks({ blocks, region, gap: 20, align: 'bottom' });
  assert.equal(bottom.items[2].y + 80, 900);

  const gapScaled = stackBlocks({ blocks: [{ id: 'a', height: 100, gapScale: 2 }, { id: 'b', height: 50 }], region, gap: 20, align: 'top' });
  assert.equal(gapScaled.items[1].y, 100 + 100 + 40);
});

test('stackBlocks / fitVerticalStack: a group that cannot fit is pinned to the top and reported as overflow', () => {
  const stacked = stackBlocks({ blocks: [{ id: 'a', height: 700 }, { id: 'b', height: 700 }], region: { top: 90, bottom: 990 }, gap: 12, align: 'center' });
  assert.equal(stacked.overflow, true);
  assert.equal(stacked.items[0].y, 90);

  const fit = fitVerticalStack({
    canvas: LANDSCAPE, region: { top: 90, bottom: 990 }, strategy: 'stack-list',
    build: (scale) => ({ blocks: [{ id: 'a', kind: 'point', height: 600 * scale, fontSize: 30 }, { id: 'b', kind: 'point', height: 600 * scale, fontSize: 30 }] }),
  });
  assert.equal(fit.diagnostics.overflow, false, 'type scale shrinks until the group fits');
  assert.ok(fit.scale < 1);
});

test('resolveCanvas: reference canvas follows the render aspect ratio', () => {
  assert.deepEqual(resolveCanvas(1920, 1080), { width: 1920, height: 1080 });
  assert.deepEqual(resolveCanvas(1280, 720), { width: 1920, height: 1080 });
  assert.deepEqual(resolveCanvas(1080, 1920), { width: 1080, height: 1920 });
  assert.deepEqual(resolveCanvas(1080, 1080), { width: 1080, height: 1080 });
  assert.deepEqual(resolveCanvas(1080, 1350), { width: 1080, height: 1350 });
  assert.deepEqual(resolveCanvas(0, 0), CANVAS);
});
