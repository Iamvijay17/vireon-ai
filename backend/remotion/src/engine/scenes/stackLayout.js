import { CANVAS, orientationOf, padFor, placeAt, safeRegion, titleSlot } from './shared';
import { designScale, fitVerticalStack, measureTextBlock } from '../verticalLayout';

/**
 * The two shapes most Scene Components share, built on verticalLayout.js:
 *
 *   buildTitledStack - optional title + a column of text items (stack-list,
 *                      paragraph-stack, timeline)
 *   buildCardRows    - optional title + rows of cards (grid, comparison-split)
 *
 * Both measure every block, let fitVerticalStack pick a bounded gap and align
 * the finished group, and return `{ slots, diagnostics }`. Neither assigns a
 * row a share of the leftover height.
 */

// Rendered text lines sit a few px taller than the estimate; this keeps clamped
// boxes (title/body roles) from clipping their last line and keeps the gap honest.
const heightSlack = (fontSize) => Math.ceil(fontSize * 0.15);

// Mirrors cardStyle()'s `padding: 28` in ui/Card.jsx.
const CARD_PADDING = 28;

const itemString = (item) => `${item.heading ? `${item.heading} ` : ''}${item.text || ''}`.trim();

export const buildTitledStack = (profile, ctx, spec) => {
  const canvas = ctx?.canvas || CANVAS;
  const pad = padFor(canvas);
  const boxWidth = canvas.width - pad.x * 2;
  const itemWidth = boxWidth * (spec.widthRatio ?? 1) - (spec.indent ?? 0);
  const textWidth = itemWidth - (spec.inset ?? 0);
  const itemX = pad.x + (spec.indent ?? 0);

  const fit = fitVerticalStack({
    canvas, region: safeRegion(canvas), strategy: spec.strategy,
    build: (scale) => {
      const blocks = [];
      const title = titleSlot(profile.title, boxWidth, 0, Math.round((spec.titleMaxFont ?? 68) * scale), canvas);
      if (title) {
        blocks.push({ id: 'title', kind: 'title', slot: title, height: title.hPct * canvas.height, fontSize: title.fontSize, gapScale: 1.25 });
      }
      const fontSize = Math.max(spec.minFont, Math.round(spec.maxFont * scale));
      profile.items.forEach((item, index) => {
        const { height } = measureTextBlock(itemString(item), { fontSize, width: textWidth, lineHeight: spec.lineHeight });
        const total = height + heightSlack(fontSize);
        blocks.push({
          id: `item-${index}`, kind: 'point', fontSize, height: total,
          slot: {
            id: `item-${index}`, role: spec.role, text: item.text || '', ...(spec.keepHeading ? { heading: item.heading || '' } : {}),
            xPct: itemX / canvas.width, yPct: 0,
            wPct: itemWidth / canvas.width, hPct: total / canvas.height,
            fontSize, textAlign: 'left', ...(spec.extra ? spec.extra(item, index) : {}),
          },
        });
      });
      return { blocks };
    },
  });

  return { slots: fit.items.map((block) => placeAt(block.slot, block.y, canvas)), diagnostics: fit.diagnostics };
};

export const buildCardRows = (profile, ctx, spec) => {
  const canvas = ctx?.canvas || CANVAS;
  const pad = padFor(canvas);
  const scale = designScale(canvas);
  const boxWidth = canvas.width - pad.x * 2;
  const cols = spec.cols(orientationOf(canvas));
  const colGap = Math.round(spec.colGap * scale);
  const cardWidth = (boxWidth - colGap * (cols - 1)) / cols;
  const innerWidth = cardWidth - CARD_PADDING * 2;
  const minCardHeight = Math.round(spec.minCardHeight * scale);

  const rows = [];
  for (let i = 0; i < profile.items.length; i += cols) rows.push(profile.items.slice(i, i + cols));

  const fit = fitVerticalStack({
    canvas, region: safeRegion(canvas), strategy: spec.strategy,
    build: (typeScale) => {
      const blocks = [];
      const title = titleSlot(profile.title, boxWidth, 0, Math.round(spec.titleMaxFont * typeScale), canvas);
      if (title) {
        blocks.push({ id: 'title', kind: 'title', slot: title, height: title.hPct * canvas.height, fontSize: title.fontSize, gapScale: 1.25 });
      }
      const fontSize = Math.max(spec.minFont, Math.round(spec.maxFont * typeScale));
      rows.forEach((rowItems, rowIndex) => {
        const textHeight = Math.max(...rowItems.map((item, col) => measureTextBlock(
          itemString(spec.decorate ? spec.decorate(item, rowIndex * cols + col) : item),
          { fontSize, width: innerWidth, lineHeight: 1.4 },
        ).height));
        const height = Math.max(minCardHeight, textHeight + heightSlack(fontSize) + CARD_PADDING * 2);
        blocks.push({
          id: `row-${rowIndex}`, kind: 'point', fontSize, height,
          slots: rowItems.map((item, col) => {
            const index = rowIndex * cols + col;
            const decorated = spec.decorate ? spec.decorate(item, index) : item;
            return {
              id: `item-${index}`, role: 'listItem', text: item.text || '', heading: decorated.heading || '',
              xPct: (pad.x + col * (cardWidth + colGap)) / canvas.width, yPct: 0,
              wPct: cardWidth / canvas.width, hPct: height / canvas.height,
              fontSize, textAlign: 'left', card: true,
            };
          }),
        });
      });
      return { blocks };
    },
  });

  const slots = [];
  fit.items.forEach((block) => {
    if (block.slot) slots.push(placeAt(block.slot, block.y, canvas));
    else block.slots.forEach((slot) => slots.push(placeAt(slot, block.y, canvas)));
  });
  return { slots, diagnostics: fit.diagnostics };
};

/**
 * Stacks arbitrary pre-measured blocks (the single-composition scenes: title-only,
 * quote, stat, split-image, podcast, fullbleed). `build(scale)` returns
 * `{ blocks }` where a block carries either `slot` (a slot template at yPct 0) or
 * is a placeholder (e.g. the waveform) whose resolved `y` the caller reads from
 * `placed[id]`. `region` defaults to the orientation's safe area.
 */
export const buildBlockStack = (ctx, strategy, build, { region, profile } = {}) => {
  const canvas = ctx?.canvas || CANVAS;
  const fit = fitVerticalStack({ canvas, region: region || safeRegion(canvas), strategy, profile, build });
  const slots = [];
  const placed = {};
  fit.items.forEach((block) => {
    placed[block.id] = block.y;
    if (block.slot) slots.push(placeAt(block.slot, block.y, canvas));
  });
  return { slots, placed, diagnostics: fit.diagnostics };
};
