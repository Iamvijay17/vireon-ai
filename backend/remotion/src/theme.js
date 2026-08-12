/**
 * Shared design tokens for the "PPT-slide" template style: a small fixed
 * typography/spacing scale plus a `mergeStyle` helper so templates and
 * scene-level style overrides (edited from the frontend Studio Editor) speak
 * the same vocabulary. Generalized from template-041 ("Modern Minimal"),
 * the cleanest existing template - thin-weight title, single accent line,
 * no icon badges or glassmorphism cards.
 *
 * Templates opt into this by importing `theme` and merging `elements.styleConfig`
 * overrides on top of `theme.typography.*` via `mergeStyle` - see
 * `captions/CaptionRenderer.jsx`'s `{...defaultCaptionConfig, ...styleConfig}`
 * for the pattern this generalizes.
 */
import { backgroundColors } from './styles';

const FONT_FAMILY = "'Helvetica Neue', Helvetica, Arial, sans-serif";

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
  xxl: 60,
  xxxl: 80,
};

export const typography = {
  title: {
    color: '#ffffff',
    fontSize: 72,
    fontWeight: 300,
    fontFamily: FONT_FAMILY,
    textAlign: 'center',
    lineHeight: 1.15,
    letterSpacing: '-0.02em',
    margin: 0,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 32,
    fontWeight: 400,
    fontFamily: FONT_FAMILY,
    textAlign: 'center',
    lineHeight: 1.5,
    margin: 0,
  },
  body: {
    color: '#e2e8f0',
    fontSize: 28,
    fontWeight: 400,
    fontFamily: FONT_FAMILY,
    lineHeight: 1.5,
    margin: 0,
  },
  label: {
    color: '#94a3b8',
    fontSize: 20,
    fontWeight: 500,
    fontFamily: FONT_FAMILY,
    letterSpacing: '0.02em',
    margin: 0,
  },
};

export const palette = {
  ...backgroundColors,
  accentGradient: 'linear-gradient(90deg, #60a5fa, #a78bfa)',
  accentSolid: '#60a5fa',
  textOnDark: '#ffffff',
  textMuted: '#94a3b8',
};

/**
 * Shared outer content wrapper, matching template-041's centered content
 * column (full-bleed AbsoluteFill background is still each template's own
 * responsibility - this is just the padded, centered content box).
 */
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
 * Canonical style-override merge: scene-level `elements.styleConfig.<role>`
 * (edited from the frontend) is spread over a theme default. Keeping this as
 * one helper (rather than each template re-deriving the spread) means every
 * template applies overrides identically.
 */
export const mergeStyle = (themeDefault, override) => ({
  ...themeDefault,
  ...(override || {}),
});

const theme = { spacing, typography, palette, slideLayout, mergeStyle };

export default theme;
