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

module.exports = { IMAGE_STYLES, STYLE_KEYS, composePrompt };
