/**
 * Curated title/body Google Font pairings, ported from
 * backend/remotion/src/fonts.js. `VideoJob.fontPairing` (constants
 * FONT_PAIRINGS) still selects one of these ids per video.
 *
 * The Remotion original called @remotion/google-fonts' `loadFont`, which
 * registers the font-face and blocks Remotion's frame capture via
 * delayRender/continueRender until the font is ready. HyperFrames has no
 * such render-blocking hook: instead each pairing exposes a `googleFontsHref`
 * (a Google Fonts CSS2 URL) that the composition assembler embeds as a
 * <link> tag, and the composition's own bootstrap script waits on
 * `document.fonts.ready` before registering the GSAP timeline - HyperFrames
 * only seeks after that registration, so this is an equivalent, CLI-agnostic
 * "don't render before fonts are ready" gate.
 */
const SYSTEM_STACK = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const googleFontsHref = (families) =>
  `https://fonts.googleapis.com/css2?${families
    .map(([family, weights]) => `family=${encodeURIComponent(family)}:wght@${weights.join(';')}`)
    .join('&')}&display=swap`;

const FONT_PAIRINGS = {
  default: {
    title: SYSTEM_STACK,
    body: SYSTEM_STACK,
    googleFontsHref: null,
  },
  'modern-sans': {
    title: 'Montserrat, sans-serif',
    body: 'Inter, sans-serif',
    googleFontsHref: googleFontsHref([
      ['Montserrat', [600, 700]],
      ['Inter', [400, 500]],
    ]),
  },
  'elegant-serif': {
    title: '"Playfair Display", serif',
    body: 'Lora, serif',
    googleFontsHref: googleFontsHref([
      ['Playfair Display', [600, 700]],
      ['Lora', [400, 500]],
    ]),
  },
  'friendly-rounded': {
    title: 'Poppins, sans-serif',
    body: 'Roboto, sans-serif',
    googleFontsHref: googleFontsHref([
      ['Poppins', [600, 700]],
      ['Roboto', [400, 500]],
    ]),
  },
  'clean-mono': {
    title: '"Space Grotesk", sans-serif',
    body: '"IBM Plex Sans", sans-serif',
    googleFontsHref: googleFontsHref([
      ['Space Grotesk', [600, 700]],
      ['IBM Plex Sans', [400, 500]],
    ]),
  },
  'bold-impact': {
    title: '"Archivo Black", sans-serif',
    body: '"Work Sans", sans-serif',
    googleFontsHref: googleFontsHref([
      ['Archivo Black', [400]],
      ['Work Sans', [400, 500]],
    ]),
  },
  editorial: {
    title: 'Merriweather, serif',
    body: '"Source Sans 3", sans-serif',
    googleFontsHref: googleFontsHref([
      ['Merriweather', [700, 900]],
      ['Source Sans 3', [400, 500]],
    ]),
  },
};

const getFontPairing = (id) => FONT_PAIRINGS[id] || FONT_PAIRINGS.default;

module.exports = { FONT_PAIRINGS, getFontPairing };
