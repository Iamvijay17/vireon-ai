/**
 * Curated title/body Google Font pairings, selectable per video via
 * VideoJob.fontPairing (see backend/src/constants FONT_PAIRINGS - the ids
 * here must match that enum). `applyFontPairing` in theme.js is what
 * actually wires a pairing's fontFamily strings into the shared
 * `typography` object templates read from.
 *
 * `load()` calls @remotion/google-fonts' `loadFont`, which registers the
 * font-face and handles Remotion's delayRender/continueRender internally so
 * a render doesn't capture a frame before the font is ready. It's only
 * invoked for the pairing actually applied to a given render - 'default'
 * has a no-op load() so a video that doesn't opt in never pays for a Google
 * Fonts fetch and keeps today's exact system-font look.
 */
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadPlayfairDisplay } from '@remotion/google-fonts/PlayfairDisplay';
import { loadFont as loadLora } from '@remotion/google-fonts/Lora';
import { loadFont as loadPoppins } from '@remotion/google-fonts/Poppins';
import { loadFont as loadRoboto } from '@remotion/google-fonts/Roboto';
import { loadFont as loadSpaceGrotesk } from '@remotion/google-fonts/SpaceGrotesk';
import { loadFont as loadIBMPlexSans } from '@remotion/google-fonts/IBMPlexSans';
import { loadFont as loadArchivoBlack } from '@remotion/google-fonts/ArchivoBlack';
import { loadFont as loadWorkSans } from '@remotion/google-fonts/WorkSans';
import { loadFont as loadMerriweather } from '@remotion/google-fonts/Merriweather';
import { loadFont as loadSourceSans3 } from '@remotion/google-fonts/SourceSans3';

const SYSTEM_STACK = "'Helvetica Neue', Helvetica, Arial, sans-serif";

export const FONT_PAIRINGS = {
  default: {
    title: SYSTEM_STACK,
    body: SYSTEM_STACK,
    load: () => {},
  },
  'modern-sans': {
    title: 'Montserrat, sans-serif',
    body: 'Inter, sans-serif',
    load: () => {
      loadMontserrat('normal', { weights: ['600', '700'] });
      loadInter('normal', { weights: ['400', '500'] });
    },
  },
  'elegant-serif': {
    title: '"Playfair Display", serif',
    body: 'Lora, serif',
    load: () => {
      loadPlayfairDisplay('normal', { weights: ['600', '700'] });
      loadLora('normal', { weights: ['400', '500'] });
    },
  },
  'friendly-rounded': {
    title: 'Poppins, sans-serif',
    body: 'Roboto, sans-serif',
    load: () => {
      loadPoppins('normal', { weights: ['600', '700'] });
      loadRoboto('normal', { weights: ['400', '500'] });
    },
  },
  'clean-mono': {
    title: '"Space Grotesk", sans-serif',
    body: '"IBM Plex Sans", sans-serif',
    load: () => {
      loadSpaceGrotesk('normal', { weights: ['600', '700'] });
      loadIBMPlexSans('normal', { weights: ['400', '500'] });
    },
  },
  'bold-impact': {
    title: '"Archivo Black", sans-serif',
    body: '"Work Sans", sans-serif',
    load: () => {
      loadArchivoBlack('normal', { weights: ['400'] });
      loadWorkSans('normal', { weights: ['400', '500'] });
    },
  },
  editorial: {
    title: 'Merriweather, serif',
    body: '"Source Sans 3", sans-serif',
    load: () => {
      loadMerriweather('normal', { weights: ['700', '900'] });
      loadSourceSans3('normal', { weights: ['400', '500'] });
    },
  },
};

export const getFontPairing = (id) => FONT_PAIRINGS[id] || FONT_PAIRINGS.default;
