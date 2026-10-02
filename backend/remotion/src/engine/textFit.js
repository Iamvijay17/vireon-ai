/**
 * Character-width heuristic text-fit utility - the Layout Solver's
 * deterministic first pass at sizing text without a DOM measurement
 * (no `measureText`/`fitText`/`autoFit` utility exists anywhere else in
 * the codebase). Tuned loosely against Helvetica Neue, the only font
 * family the existing templates use (see theme.js's FONT_FAMILY).
 *
 * This is an approximation, not exact glyph metrics. If it proves
 * inaccurate for a given font/language, the documented fast-follow is a
 * real DOM-measurement pass (Remotion renders through headless Chromium
 * anyway) - not needed yet for the deterministic engine to function.
 */
const NARROW = new Set('iltfjI.,\'|!:;'.split(''));
const WIDE = new Set('MWmw@%&'.split(''));

const charRatio = (ch) => {
  if (NARROW.has(ch)) return 0.28;
  if (WIDE.has(ch)) return 0.82;
  return 0.55;
};

export const estimateTextWidth = (text, fontSize) => {
  let width = 0;
  for (const ch of text) width += charRatio(ch) * fontSize;
  return width;
};

/**
 * Estimates how many wrapped lines `text` takes at `fontSize` inside a box
 * `maxWidth` px wide, by greedily packing words per estimated width -
 * mirrors how a real CSS `flex-wrap` / text-wrap layout would break lines,
 * without needing to actually lay it out.
 */
export const estimateWrappedLines = (text, fontSize, maxWidth) => {
  if (!text) return 0;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  let lines = 1;
  let lineWidth = 0;
  const spaceWidth = charRatio(' ') * fontSize;

  for (const word of words) {
    const wordWidth = estimateTextWidth(word, fontSize);
    if (lineWidth > 0 && lineWidth + spaceWidth + wordWidth > maxWidth) {
      lines += 1;
      lineWidth = wordWidth;
    } else {
      lineWidth += (lineWidth > 0 ? spaceWidth : 0) + wordWidth;
    }
  }
  return lines;
};

/**
 * Shrinks fontSize (from maxFontSize down to minFontSize, in `step`
 * increments) until `text` wrapped at `boxWidth` fits within `boxHeight`
 * at the given lineHeight multiplier. Deterministic given the same inputs.
 */
export const fitTextToBox = (text, { boxWidth, boxHeight, maxFontSize, minFontSize = 18, lineHeight = 1.3, step = 2 }) => {
  let fontSize = maxFontSize;
  while (fontSize > minFontSize) {
    const lines = estimateWrappedLines(text, fontSize, boxWidth);
    if (lines * fontSize * lineHeight <= boxHeight) {
      return { fontSize, lines };
    }
    fontSize -= step;
  }
  return { fontSize: minFontSize, lines: estimateWrappedLines(text, minFontSize, boxWidth) };
};
