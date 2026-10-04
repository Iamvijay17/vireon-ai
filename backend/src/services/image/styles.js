/**
 * Image Studio style presets. Each is a phrase appended to the user's prompt,
 * which is all a style is for a prompt-driven model - nothing about the
 * workflow changes. The record keeps the user's own prompt and the style key
 * separately, so the gallery shows what they typed.
 */
const IMAGE_STYLES = {
  none: { label: 'None', suffix: '' },
  photo: { label: 'Photo', suffix: 'realistic photograph, natural lighting, sharp focus, fine detail' },
  cinematic: { label: 'Cinematic', suffix: 'cinematic still, dramatic lighting, shallow depth of field, subtle film grain' },
  illustration: { label: 'Illustration', suffix: 'digital illustration, clean lines, vibrant colors, detailed' },
  render3d: { label: '3D render', suffix: '3D render, soft studio lighting, smooth materials, high detail' },
  flat: { label: 'Flat vector', suffix: 'flat vector illustration, simple shapes, bold colors, clean uncluttered background' },
  watercolor: { label: 'Watercolor', suffix: 'watercolor painting, soft washes, visible paper texture' },
  anime: { label: 'Anime', suffix: 'anime style illustration, expressive, crisp line art, vivid colors' },
};

const STYLE_KEYS = Object.keys(IMAGE_STYLES);

/** The prompt actually sent to the model: the user's text plus the style's phrase. */
function composePrompt(prompt, style = 'none') {
  const text = String(prompt).trim();
  const suffix = IMAGE_STYLES[style]?.suffix;
  if (!suffix) return text;
  return `${text.replace(/[\s,.;]+$/, '')}, ${suffix}`;
}

const NO_TEXT = 'Purely visual and completely unlabeled, with no words, letters, numbers or symbols that look like writing anywhere in the image.';
const MAX_TEXT_LINES = 3;

/** The lines of exact text to draw: trimmed, blanks dropped, at most MAX_TEXT_LINES. */
function textLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/"/g, "'"))
    .filter(Boolean)
    .slice(0, MAX_TEXT_LINES);
}

/**
 * Text handling, because image models make up text: asked for a poster they add
 * rows of icon labels in gibberish, and drawn "documents" fill with fake words.
 * Same-seed tests on Qwen-Image (see workflows/README.md) found two things that work:
 *  - exact words: describe them as THE text of the picture - large, centered, one
 *    short line each - which left no room for invented labels (clean on 3/3 runs);
 *  - no words: say it strongly. "No text, lettering, captions..." cleaned a classroom
 *    with screens and whiteboards but left garbled labels on a neural-network diagram;
 *    "purely visual and completely unlabeled, with no words, letters, numbers or symbols
 *    that look like writing" cleaned the diagram too. It cannot help when the prompt
 *    itself asks for signs or billboards - the model then draws signage.
 *    A trailing "no other text" sentence on a prompt that already asks for text did NOT
 *    stop the invented labels, so that case is left to the wording above.
 * A prompt that contains its own quoted text is the caller's wording and is left alone.
 */
function composeFinalPrompt(prompt, style = 'none', text = '') {
  const base = composePrompt(prompt, style);
  const lines = textLines(text);

  if (lines.length > 0) {
    const [headline, ...rest] = lines;
    const placements = ['and below it', 'and at the bottom'];
    const sizes = ['in smaller clean letters', 'in small clean letters'];
    const parts = [`"${headline}" in very large bold sans-serif capital letters across the center`];
    rest.forEach((line, i) => parts.push(`${placements[i]} "${line}" ${sizes[i]}`));
    return `${base.replace(/[\s,.;]+$/, '')}. The text reads exactly: ${parts.join(', ')}. Sharp, perfectly spelled, highly legible typography.`;
  }

  if (/["“”]/.test(base)) return base;
  return `${base.replace(/[\s,.;]+$/, '')}. ${NO_TEXT}`;
}

module.exports = { IMAGE_STYLES, STYLE_KEYS, NO_TEXT, composePrompt, composeFinalPrompt, textLines, MAX_TEXT_LINES };
