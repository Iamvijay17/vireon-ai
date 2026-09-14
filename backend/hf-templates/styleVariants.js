/**
 * Per-video "look" bundles: font pairing + background palette + accent
 * color, keyed by the existing `FONT_PAIRINGS` ids (see
 * backend/src/constants/index.js) so `VideoJob.fontPairing` doubles as the
 * variant id - no schema change needed. Colors are pulled from the moods
 * already defined in theme.js's `backgroundColors`/`palette` (ported from
 * the old Remotion pipeline but never wired into a real render until now).
 *
 * Consumed by HyperFramesService to break the single hardcoded look
 * (mk-background dark + titlecard-calm white/gray) every video used to render.
 */
const { getFontPairing } = require('./fonts.js');

const STYLE_VARIANTS = {
  default: {
    stageColor: '#0d1117',
    baseColor: '#1a1a2e',
    blob1Color: '#60a5fa',
    blob2Color: '#a78bfa',
    accentColor: '#94a3b8',
  },
  'modern-sans': {
    stageColor: '#000000',
    baseColor: '#0a0a0c',
    blob1Color: '#7d5cff',
    blob2Color: '#2d1b69',
    accentColor: '#b8c0cc',
  },
  'elegant-serif': {
    stageColor: '#16213e',
    baseColor: '#0f3460',
    blob1Color: '#d4af7a',
    blob2Color: '#8a6d3b',
    accentColor: '#d4af7a',
  },
  'friendly-rounded': {
    stageColor: '#2d1b2e',
    baseColor: '#3d2438',
    blob1Color: '#ff7ac8',
    blob2Color: '#ffb347',
    accentColor: '#ffb0dd',
  },
  'clean-mono': {
    stageColor: '#0d1117',
    baseColor: '#111827',
    blob1Color: '#45d6c8',
    blob2Color: '#2dd4bf',
    accentColor: '#45d6c8',
  },
  'bold-impact': {
    stageColor: '#0f3460',
    baseColor: '#1a936f',
    blob1Color: '#ffd166',
    blob2Color: '#ef476f',
    accentColor: '#ffd166',
  },
  editorial: {
    stageColor: '#0f3460',
    baseColor: '#16213e',
    blob1Color: '#94a3b8',
    blob2Color: '#60a5fa',
    accentColor: '#cbd5e1',
  },
};

const ALL_VARIANT_IDS = Object.keys(STYLE_VARIANTS);

function getStyleVariant(id) {
  const colors = STYLE_VARIANTS[id] || STYLE_VARIANTS.default;
  const fontPairing = getFontPairing(id);
  return {
    id: STYLE_VARIANTS[id] ? id : 'default',
    ...colors,
    fontFamily: fontPairing.title,
    fontMono: fontPairing.body,
    googleFontsHref: fontPairing.googleFontsHref,
  };
}

module.exports = { STYLE_VARIANTS, ALL_VARIANT_IDS, getStyleVariant };
