import { fitTextToBox } from '../textFit';

/**
 * Geometry shared by every Scene Component - moved out of solveLayout.js
 * unchanged (see its previous doc comments for the reasoning behind each
 * constant/budget).
 */
export const CANVAS = { width: 1920, height: 1080 };
export const PAD = { x: 120, top: 90, bottom: 90 };

const TITLE_LINE_HEIGHT = 1.15;
const TITLE_BOX_HEIGHT_BUDGET = 200;
const MAX_TITLE_RESERVED_HEIGHT = 400;

export const titleSlot = (title, boxWidth, yPct, maxFontSize = 68) => {
  if (!title) return null;
  const { fontSize, lines } = fitTextToBox(title, {
    boxWidth, boxHeight: TITLE_BOX_HEIGHT_BUDGET, maxFontSize, minFontSize: 38, lineHeight: TITLE_LINE_HEIGHT,
  });
  const height = Math.min(lines * fontSize * TITLE_LINE_HEIGHT, MAX_TITLE_RESERVED_HEIGHT);
  return {
    id: 'title', role: 'title', text: title,
    xPct: PAD.x / CANVAS.width, yPct,
    wPct: boxWidth / CANVAS.width, hPct: height / CANVAS.height,
    fontSize, textAlign: 'left',
  };
};

const TITLE_GAP = 40;
export const contentTopAfterTitle = (title, fallbackTop) =>
  (title ? PAD.top + title.hPct * CANVAS.height + TITLE_GAP : fallbackTop);
