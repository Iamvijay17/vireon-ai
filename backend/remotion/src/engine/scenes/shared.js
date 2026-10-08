import { fitTextToBox } from '../textFit';

/**
 * Geometry shared by every Scene Component.
 *
 * Scene builders solve against a reference canvas that matches the render's
 * aspect ratio (`resolveCanvas`): 1920x1080 for landscape, 1080 wide for
 * portrait and square. GeneratedScene scales that canvas to the real render
 * size, so a builder never deals in real pixels or hard-codes one orientation.
 */
export const CANVAS = { width: 1920, height: 1080 };
export const PAD = { x: 120, top: 90, bottom: 90 };

const LANDSCAPE_MIN_RATIO = 1.15;
const PORTRAIT_MAX_RATIO = 0.87;

/** Reference canvas for a render size (falls back to 1920x1080 when unknown). */
export const resolveCanvas = (width, height) => {
  if (!width || !height) return CANVAS;
  const ratio = width / height;
  const refWidth = ratio > LANDSCAPE_MIN_RATIO ? CANVAS.width : 1080;
  return { width: refWidth, height: Math.round(refWidth / ratio) };
};

export const orientationOf = (canvas) => {
  const ratio = canvas.width / canvas.height;
  if (ratio > LANDSCAPE_MIN_RATIO) return 'landscape';
  return ratio < PORTRAIT_MAX_RATIO ? 'portrait' : 'square';
};

// Safe margins per orientation. Portrait keeps a taller bottom margin for the
// spoken-caption band and platform UI that sit over the lower part of a vertical video.
const PADS = {
  landscape: PAD,
  square: { x: 80, top: 90, bottom: 110 },
  portrait: { x: 72, top: 140, bottom: 220 },
};
export const padFor = (canvas) => PADS[orientationOf(canvas)];

// Title text box budget (px of canvas) before fitTextToBox starts shrinking the font.
const TITLE_BOX_HEIGHT_BUDGET = { landscape: 200, square: 240, portrait: 320 };
const MAX_TITLE_RESERVED_HEIGHT = { landscape: 400, square: 460, portrait: 560 };
const TITLE_LINE_HEIGHT = 1.15;

/**
 * Title slot with its measured height. `yPct` is where it starts; scene
 * builders that stack content pass 0 and set the real `yPct` from the stack.
 */
export const titleSlot = (title, boxWidth, yPct, maxFontSize = 68, canvas = CANVAS) => {
  if (!title) return null;
  const orientation = orientationOf(canvas);
  const { fontSize, lines } = fitTextToBox(title, {
    boxWidth, boxHeight: TITLE_BOX_HEIGHT_BUDGET[orientation], maxFontSize, minFontSize: 38, lineHeight: TITLE_LINE_HEIGHT,
  });
  const height = Math.min(lines * fontSize * TITLE_LINE_HEIGHT, MAX_TITLE_RESERVED_HEIGHT[orientation]);
  return {
    id: 'title', role: 'title', text: title,
    xPct: padFor(canvas).x / canvas.width, yPct,
    wPct: boxWidth / canvas.width, hPct: height / canvas.height,
    fontSize, textAlign: 'left',
  };
};

/** Re-anchors a slot at canvas-pixel `y`. */
export const placeAt = (slot, y, canvas) => ({ ...slot, yPct: y / canvas.height });

/** The safe area a vertical stack may occupy. */
export const safeRegion = (canvas, top = padFor(canvas).top, bottom = padFor(canvas).bottom) => ({
  top, bottom: canvas.height - bottom,
});
