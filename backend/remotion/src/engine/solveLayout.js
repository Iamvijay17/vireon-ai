import { createSeededRng, pick } from './seedRandom';
import { fitTextToBox } from './textFit';

/**
 * Layout Solver - layer 2 of the generative scene engine.
 *
 * Computes a flat list of resolved slots `{ id, role, xPct, yPct, wPct,
 * hPct, fontSize, ... }` from a ContentProfile, instead of picking one of
 * N pre-authored template files. All geometry is solved against a fixed
 * 1920x1080 reference canvas (GeneratedScene.jsx scales the whole content
 * layer against the actual render width, same pattern every hand-coded
 * template already uses).
 *
 * `solveLayout(profile, seed)` is a pure function: same inputs always
 * produce the same LayoutPlan, so it's safe to recompute on every render
 * (preview or final) rather than needing to be precomputed and persisted.
 */
const CANVAS = { width: 1920, height: 1080 };
const PAD = { x: 120, top: 90, bottom: 90 };

const titleSlot = (title, boxWidth, yPct, maxFontSize = 68) => {
  if (!title) return null;
  const { fontSize } = fitTextToBox(title, { boxWidth, boxHeight: 200, maxFontSize, minFontSize: 38 });
  return {
    id: 'title', role: 'title', text: title,
    xPct: PAD.x / CANVAS.width, yPct,
    wPct: boxWidth / CANVAS.width, hPct: 0.2,
    fontSize, textAlign: 'left',
  };
};

const buildTitleOnly = (profile) => {
  const boxWidth = CANVAS.width - PAD.x * 2;
  const slot = titleSlot(profile.title, boxWidth, 0.42, 76);
  return slot ? [slot] : [];
};

const buildStackList = (profile) => {
  const boxWidth = CANVAS.width - PAD.x * 2;
  const rowWidth = boxWidth * 0.88;
  const slots = [];
  const title = titleSlot(profile.title, boxWidth, PAD.top / CANVAS.height);
  if (title) slots.push(title);

  const listTop = title ? PAD.top + 200 : PAD.top;
  const rowHeight = Math.min(110, (CANVAS.height - listTop - PAD.bottom) / Math.max(profile.itemCount, 1));
  profile.items.forEach((item, index) => {
    const { fontSize } = fitTextToBox(item.text || '', { boxWidth: rowWidth, boxHeight: rowHeight - 16, maxFontSize: 32, minFontSize: 20 });
    slots.push({
      id: `item-${index}`, role: 'listItem', text: item.text || '', heading: item.heading || '',
      xPct: PAD.x / CANVAS.width, yPct: (listTop + index * rowHeight) / CANVAS.height,
      wPct: rowWidth / CANVAS.width, hPct: (rowHeight - 16) / CANVAS.height,
      fontSize, textAlign: 'left', bullet: true,
    });
  });
  return slots;
};

const buildGrid = (profile) => {
  const boxWidth = CANVAS.width - PAD.x * 2;
  const slots = [];
  const title = titleSlot(profile.title, boxWidth, PAD.top / CANVAS.height, 56);
  if (title) slots.push(title);

  const cols = 2;
  const gap = 32;
  const gridTop = title ? PAD.top + 200 : PAD.top;
  const gridHeight = CANVAS.height - gridTop - PAD.bottom;
  const rows = Math.ceil(profile.itemCount / cols);
  const cardWidth = (boxWidth - gap * (cols - 1)) / cols;
  const cardHeight = Math.min(190, (gridHeight - gap * Math.max(rows - 1, 0)) / Math.max(rows, 1));

  profile.items.forEach((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const { fontSize } = fitTextToBox(item.text || '', { boxWidth: cardWidth - 56, boxHeight: cardHeight - 70, maxFontSize: 26, minFontSize: 17 });
    slots.push({
      id: `item-${index}`, role: 'listItem', text: item.text || '', heading: item.heading || '',
      xPct: (PAD.x + col * (cardWidth + gap)) / CANVAS.width,
      yPct: (gridTop + row * (cardHeight + gap)) / CANVAS.height,
      wPct: cardWidth / CANVAS.width, hPct: cardHeight / CANVAS.height,
      fontSize, textAlign: 'left', card: true,
    });
  });
  return slots;
};

const buildTimeline = (profile) => {
  const boxWidth = CANVAS.width - PAD.x * 2 - 70;
  const slots = [];
  const title = titleSlot(profile.title, CANVAS.width - PAD.x * 2, PAD.top / CANVAS.height);
  if (title) slots.push(title);

  const listTop = title ? PAD.top + 200 : PAD.top;
  const rowHeight = Math.min(140, (CANVAS.height - listTop - PAD.bottom) / Math.max(profile.itemCount, 1));
  profile.items.forEach((item, index) => {
    const { fontSize } = fitTextToBox(item.text || '', { boxWidth, boxHeight: rowHeight - 24, maxFontSize: 28, minFontSize: 18 });
    slots.push({
      id: `item-${index}`, role: 'listItem', text: item.text || '', heading: item.heading || '',
      xPct: (PAD.x + 70) / CANVAS.width, yPct: (listTop + index * rowHeight) / CANVAS.height,
      wPct: boxWidth / CANVAS.width, hPct: (rowHeight - 24) / CANVAS.height,
      fontSize, textAlign: 'left', numbered: true, index,
    });
  });
  return slots;
};

const buildParagraphStack = (profile) => {
  const boxWidth = CANVAS.width - PAD.x * 2;
  const slots = [];
  const title = titleSlot(profile.title, boxWidth, PAD.top / CANVAS.height);
  if (title) slots.push(title);

  const stackTop = title ? PAD.top + 220 : PAD.top;
  const available = CANVAS.height - stackTop - PAD.bottom;
  const rowHeight = available / Math.max(profile.itemCount, 1);
  profile.items.forEach((item, index) => {
    const { fontSize } = fitTextToBox(item.text || '', { boxWidth, boxHeight: rowHeight - 28, maxFontSize: 34, minFontSize: 22 });
    slots.push({
      id: `item-${index}`, role: 'body', text: item.text || '',
      xPct: PAD.x / CANVAS.width, yPct: (stackTop + index * rowHeight) / CANVAS.height,
      wPct: boxWidth / CANVAS.width, hPct: (rowHeight - 28) / CANVAS.height,
      fontSize, textAlign: 'left',
    });
  });
  return slots;
};

const buildSplitImage = (profile, rng) => {
  const imageLeft = pick(rng, [true, false]);
  const halfWidth = CANVAS.width / 2;
  const textPad = 90;
  const textBoxWidth = halfWidth - textPad * 2;
  const textX = imageLeft ? halfWidth + textPad : textPad;
  const slots = [];

  slots.push({
    id: 'image', role: 'image',
    xPct: (imageLeft ? 0 : halfWidth) / CANVAS.width, yPct: 0,
    wPct: halfWidth / CANVAS.width, hPct: 1,
  });

  const title = titleSlot(profile.title, textBoxWidth, 0.36, 54);
  if (title) slots.push({ ...title, xPct: textX / CANVAS.width, yPct: 0.36, wPct: textBoxWidth / CANVAS.width });

  const bodyText = profile.body || profile.items[0]?.text || '';
  if (bodyText) {
    const { fontSize } = fitTextToBox(bodyText, { boxWidth: textBoxWidth, boxHeight: 320, maxFontSize: 30, minFontSize: 20 });
    slots.push({
      id: 'body', role: 'body', text: bodyText,
      xPct: textX / CANVAS.width, yPct: 0.54,
      wPct: textBoxWidth / CANVAS.width, hPct: 0.32,
      fontSize, textAlign: 'left',
    });
  }
  return slots;
};

const STRATEGY_BUILDERS = {
  'title-only': buildTitleOnly,
  'stack-list': buildStackList,
  grid: buildGrid,
  timeline: buildTimeline,
  'paragraph-stack': buildParagraphStack,
  'split-image': buildSplitImage,
};

/**
 * Picks a macro composition strategy by rule, not by hand-authored recipe
 * lookup - the seed only breaks ties between multiple equally-valid
 * strategies for the same content shape (e.g. a 5-item short list reads
 * fine as either a grid or a numbered timeline), so the same content
 * doesn't always resolve to an identical structure across different videos.
 */
const chooseStrategy = (profile, rng) => {
  const { itemCount, density, hasImage, hasHeadings } = profile;
  if (hasImage) return 'split-image';
  if (itemCount === 0) return 'title-only';
  if (density === 'paragraph' && itemCount <= 3) return 'paragraph-stack';
  if (itemCount >= 4 && density !== 'paragraph') return pick(rng, ['grid', 'timeline']);
  return hasHeadings ? 'timeline' : 'stack-list';
};

export const solveLayout = (profile, seedInput) => {
  const rng = createSeededRng(`${seedInput}-layout`);
  const strategy = chooseStrategy(profile, rng);
  const builder = STRATEGY_BUILDERS[strategy] || STRATEGY_BUILDERS['stack-list'];
  const slots = builder(profile, rng).filter(Boolean);
  return { strategy, canvas: CANVAS, slots };
};
