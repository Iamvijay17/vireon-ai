import { estimateWrappedLines } from './textFit';

/**
 * Vertical layout utility - content-aware spacing for the Scene Components.
 *
 * The old builders gave every point a slice of the remaining canvas height
 * (`rowHeight = available / itemCount`) or placed blocks at fixed `yPct`
 * values, so a title plus two short paragraphs got pushed apart to fill the
 * frame. This module does the opposite: it measures each block, picks a
 * bounded gap from content density, stacks the blocks into one group, and
 * only then decides where the *group* sits (top / center / bottom). Unused
 * canvas stays whitespace around the group instead of being spread between
 * the blocks.
 *
 *   measureTextBlock      -> how tall a wrapped text block is
 *   calculateContentSpacing -> bounded gap for N blocks (the "spacing curve")
 *   stackBlocks           -> sequential Y positions + group alignment
 *   fitVerticalStack      -> shrinks type until the group fits, reports diagnostics
 *
 * Everything is pure and deterministic. The layout engine - never the LLM -
 * decides pixel positions; the AI only supplies content and, optionally, a
 * layout hint.
 */

const REFERENCE_SIZE = 1080;
const clamp = (value, lo, hi) => Math.min(Math.max(value, lo), hi);
const sum = (values) => values.reduce((total, v) => total + v, 0);

/**
 * Gap ranges at the 1080px design scale, by how many content points share the
 * scene. `fontFactor` ties the preferred gap to the type size so larger text
 * breathes more; the result is always clamped to [minGap, maxGap].
 */
export const DENSITY_TIERS = Object.freeze({
  comfortable: { minGap: 24, maxGap: 48, fontFactor: 1.4 },
  balanced: { minGap: 18, maxGap: 32, fontFactor: 1.0 },
  compact: { minGap: 12, maxGap: 24, fontFactor: 0.7 },
});

/** 2-3 points -> comfortable, 4-6 -> balanced, 7+ -> compact. */
export const densityForCount = (pointCount) =>
  (pointCount <= 3 ? 'comfortable' : pointCount <= 6 ? 'balanced' : 'compact');

/** Scales design-token pixel values to the canvas (1 at 1080px on the short side). */
export const designScale = (canvas) => clamp(Math.min(canvas.width, canvas.height) / REFERENCE_SIZE, 0.5, 1.5);

/**
 * Per-scene vertical behaviour. Anything left out falls back to the density
 * tier above, so a scene only lists what is genuinely different about it.
 *   layoutMode     - 'content-aware' (stack + align) is the only mode today; the
 *                    field is surfaced in diagnostics so a future mode is explicit.
 *   verticalAlign  - where the finished group sits in the safe area.
 *   density        - force a tier instead of deriving it from the point count.
 *   minGap/maxGap  - override the tier's bounds (1080px design scale).
 */
export const VERTICAL_PROFILES = Object.freeze({
  'title-only': { layoutMode: 'content-aware', verticalAlign: 'center' },
  'stack-list': { layoutMode: 'content-aware', verticalAlign: 'center' },
  'paragraph-stack': { layoutMode: 'content-aware', verticalAlign: 'center' },
  timeline: { layoutMode: 'content-aware', verticalAlign: 'center' },
  grid: { layoutMode: 'content-aware', verticalAlign: 'center' },
  'comparison-split': { layoutMode: 'content-aware', verticalAlign: 'center' },
  'quote-feature': { layoutMode: 'content-aware', verticalAlign: 'center', density: 'comfortable' },
  'stat-highlight': { layoutMode: 'content-aware', verticalAlign: 'center', density: 'comfortable' },
  'split-image': { layoutMode: 'content-aware', verticalAlign: 'center', density: 'comfortable' },
  'podcast-split': { layoutMode: 'content-aware', verticalAlign: 'center', density: 'comfortable' },
  'podcast-centered': { layoutMode: 'content-aware', verticalAlign: 'center', density: 'comfortable' },
  'image-fullbleed': { layoutMode: 'content-aware', verticalAlign: 'bottom', density: 'compact' },
});

export const verticalProfileFor = (strategy) =>
  VERTICAL_PROFILES[strategy] || VERTICAL_PROFILES['stack-list'];

/** Wrapped height of `text` at `fontSize` in a `width`px column. */
export const measureTextBlock = (text, { fontSize, width, lineHeight = 1.4 }) => {
  const lines = text ? Math.max(estimateWrappedLines(text, fontSize, width), 1) : 0;
  return { lines, height: Math.ceil(lines * fontSize * lineHeight) };
};

/**
 * The gap between neighbouring blocks.
 *
 *   preferred = fontSize * tier.fontFactor, clamped to [minGap, maxGap] (scaled to the canvas)
 *   fit       = leftover height / gap units - only ever used to *reduce* the gap
 *
 * Spare height never increases the gap past `preferred`, which is what stops a
 * short scene from stretching across the frame. `gapUnits` counts gaps in
 * "normal gap" units (a block with `gapScale` 1.25 after it is 1.25 units).
 */
export const calculateContentSpacing = ({
  blockCount, canvas, fontSize, density, minGap, maxGap,
  contentHeight = 0, availableHeight = Infinity, gapUnits = Math.max(blockCount - 1, 0),
}) => {
  const tierName = density || densityForCount(blockCount);
  const tier = DENSITY_TIERS[tierName] || DENSITY_TIERS.balanced;
  const scale = designScale(canvas);
  const lo = (minGap ?? tier.minGap) * scale;
  const hi = Math.max((maxGap ?? tier.maxGap) * scale, lo);

  if (gapUnits <= 0) return { gap: 0, minGap: lo, maxGap: hi, density: tierName };

  const preferred = clamp(fontSize * tier.fontFactor, lo, hi);
  const fit = (availableHeight - contentHeight) / gapUnits;
  const gap = clamp(Math.min(preferred, fit), lo, hi);
  return { gap: Math.round(gap), minGap: Math.round(lo), maxGap: Math.round(hi), density: tierName };
};

/**
 * Places blocks one after another: `currentY += height + gap`. The finished
 * group is then aligned inside `region` ({ top, bottom }, canvas px). A group
 * taller than the region is pinned to the top and reported as overflow.
 *
 * A block's `gapScale` multiplies the gap that follows it (e.g. extra room
 * after a title); `gapAfter` sets it explicitly.
 */
export const stackBlocks = ({ blocks, region, gap, align = 'center' }) => {
  const gaps = blocks.slice(0, -1).map((b) => b.gapAfter ?? Math.round(gap * (b.gapScale ?? 1)));
  const contentHeight = sum(blocks.map((b) => b.height)) + sum(gaps);
  const availableHeight = region.bottom - region.top;
  const free = availableHeight - contentHeight;
  const overflow = free < 0;
  const offset = overflow || align === 'top' ? 0 : align === 'bottom' ? free : free / 2;

  let currentY = region.top + offset;
  const items = blocks.map((block, index) => {
    const placed = { ...block, y: Math.round(currentY) };
    currentY += block.height + (gaps[index] ?? 0);
    return placed;
  });
  return { items, contentHeight, availableHeight, groupTop: region.top + offset, overflow, gaps };
};

/**
 * Lays blocks out at the largest type scale that fits the safe area.
 *
 * `build(scale)` returns `{ blocks }` for a type scale in (minScale..1]; each
 * block is `{ id, height, kind?: 'title'|'point', fontSize?, gapScale? }`. The
 * scale only shrinks when the *minimum* gap still overflows - short content
 * always renders at full size.
 *
 * Returns the placed blocks, the winning scale and layout diagnostics.
 */
export const fitVerticalStack = ({
  canvas, region, build, strategy, profile, minScale = 0.55, step = 0.05,
}) => {
  const cfg = profile || verticalProfileFor(strategy);
  const availableHeight = region.bottom - region.top;
  let scale = 1;
  let outcome;

  for (;;) {
    const { blocks } = build(scale);
    const points = blocks.filter((b) => b.kind !== 'title');
    const sizes = blocks.map((b) => b.fontSize).filter(Boolean);
    const fontSize = sizes.length ? sum(sizes) / sizes.length : 28;
    const gapUnits = sum(blocks.slice(0, -1).map((b) => b.gapScale ?? 1));
    const spacing = calculateContentSpacing({
      blockCount: points.length || blocks.length, canvas, fontSize,
      density: cfg.density, minGap: cfg.minGap, maxGap: cfg.maxGap,
      contentHeight: sum(blocks.map((b) => b.height)), availableHeight, gapUnits,
    });
    const stacked = stackBlocks({ blocks, region, gap: spacing.gap, align: cfg.verticalAlign });
    outcome = { blocks, spacing, stacked };
    if (!stacked.overflow || scale <= minScale) break;
    scale = Math.max(minScale, Math.round((scale - step) * 100) / 100);
  }

  const { spacing, stacked } = outcome;
  const groupBottom = stacked.groupTop + stacked.contentHeight;
  return {
    items: stacked.items,
    scale,
    diagnostics: {
      strategy: strategy || null,
      layoutMode: cfg.layoutMode || 'content-aware',
      verticalAlign: cfg.verticalAlign || 'center',
      density: spacing.density,
      blockCount: outcome.blocks.length,
      contentHeight: Math.round(stacked.contentHeight),
      availableHeight: Math.round(availableHeight),
      topPadding: Math.round(stacked.groupTop),
      bottomPadding: Math.round(canvas.height - groupBottom),
      gap: spacing.gap,
      minGap: spacing.minGap,
      maxGap: spacing.maxGap,
      typeScale: scale,
      overflow: stacked.overflow,
      canvas: { width: canvas.width, height: canvas.height },
    },
  };
};
