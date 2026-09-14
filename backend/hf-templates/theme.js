/**
 * Shared design tokens for the "PPT-slide" template style, ported from
 * backend/remotion/src/theme.js. Pure JS/CSS, no Remotion dependency in the
 * original either - the only change here is `createTheme(fontPairingId)`
 * replacing the old `applyFontPairing()` module-level mutation: HyperFrames
 * compositions are plain HTML generated fresh per job in this same Node
 * process, so instead of mutating a shared singleton `typography` object
 * (safe under Remotion's one-render-process-per-video assumption, but not
 * worth relying on here) each render builds its own theme object and passes
 * it explicitly into every template generator.
 */
import { getFontPairing } from './fonts.js';

const SYSTEM_STACK = "'Helvetica Neue', Helvetica, Arial, sans-serif";

export const backgroundColors = {
  dark: '#1a1a2e',
  navy: '#16213e',
  slate: '#0f3460',
  teal: '#1a936f',
  warm: '#2d1b2e',
  clean: '#0d1117',
  gradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
  xxl: 60,
  xxxl: 80,
};

export const palette = {
  ...backgroundColors,
  accentGradient: 'linear-gradient(90deg, #60a5fa, #a78bfa)',
  accentSolid: '#60a5fa',
  textOnDark: '#ffffff',
  textMuted: '#94a3b8',
};

export const slideLayout = {
  position: 'relative',
  zIndex: 1,
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  padding: `${spacing.xxl}px ${spacing.xxxl}px`,
  boxSizing: 'border-box',
};

/**
 * `override.position` (a `{xPct, yPct}` coordinate pair from the Studio
 * editor's drag pad) shares its key name with the CSS `position` property, so
 * it's pulled out of `override` and converted via `positionStyle` before the
 * rest of the override is applied - same reasoning as the Remotion original.
 */
export const mergeStyle = (themeDefault, override) => {
  const { position, ...rest } = override || {};
  return {
    ...themeDefault,
    ...positionStyle(position),
    ...rest,
  };
};

export const getContentScale = (width) => width / 1920;

export const getOrientation = (width, height) => {
  if (width === height) return 'square';
  return width > height ? 'landscape' : 'portrait';
};

export const positionStyle = (pos) =>
  pos && typeof pos.xPct === 'number' && typeof pos.yPct === 'number'
    ? {
        position: 'absolute',
        left: `${pos.xPct * 100}%`,
        top: `${pos.yPct * 100}%`,
        transform: 'translate(-50%, -50%)',
      }
    : {};

/**
 * Builds a self-contained theme object (typography bound to one font
 * pairing) for a single render. Call once per video job and thread the
 * result into every template generator instead of importing a shared
 * mutable `typography` singleton.
 */
export const createTheme = (fontPairingId) => {
  const pairing = getFontPairing(fontPairingId);
  const typography = {
    title: {
      color: '#ffffff',
      fontSize: 72,
      fontWeight: 300,
      fontFamily: pairing.title,
      textAlign: 'center',
      lineHeight: 1.15,
      letterSpacing: '-0.02em',
      margin: 0,
    },
    subtitle: {
      color: '#94a3b8',
      fontSize: 32,
      fontWeight: 400,
      fontFamily: pairing.body,
      textAlign: 'center',
      lineHeight: 1.5,
      margin: 0,
    },
    body: {
      color: '#e2e8f0',
      fontSize: 28,
      fontWeight: 400,
      fontFamily: pairing.body,
      lineHeight: 1.5,
      margin: 0,
    },
    label: {
      color: '#94a3b8',
      fontSize: 20,
      fontWeight: 500,
      fontFamily: pairing.body,
      letterSpacing: '0.02em',
      margin: 0,
    },
  };
  return { spacing, typography, palette, slideLayout, mergeStyle, positionStyle, getOrientation, getContentScale, fontPairing: pairing };
};

const theme = { spacing, palette, slideLayout, mergeStyle, positionStyle, getOrientation, getContentScale, createTheme, backgroundColors };
export default theme;
