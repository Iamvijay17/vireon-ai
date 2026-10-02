/**
 * The 4 Caption Styles of the Vireon Motion Design System - named presets
 * that bundle one of the 10 per-word animations already in
 * captionAnimations.js's `captionAnimationRegistry` with a full styleConfig,
 * so a scene picks one id instead of hand-assembling font/box/color fields
 * every time (see GeneratedScene.jsx's previous inline `styleConfig` object).
 */
export const CAPTION_STYLES = {
  minimalClean: {
    animation: 'fadeInUp',
    animationConfig: { slideDistance: 12 },
    styleConfig: {
      fontWeight: 500,
      fontSize: 34,
      backgroundColor: 'transparent',
      backgroundPadding: '0px',
      strokeWidth: 3,
      shadowBlur: 6,
    },
  },
  // The pre-existing default look (matches CaptionRenderer's own
  // defaultCaptionConfig) - kept as a named style so it's selectable
  // alongside the new ones instead of only being "what you get if you don't
  // pick anything".
  boldKaraoke: {
    animation: 'highlightCurrent',
    animationConfig: {},
    styleConfig: {
      fontWeight: 700,
      fontSize: 48,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      backgroundPadding: '12px 24px',
      borderRadius: 12,
    },
  },
  popPunch: {
    animation: 'popScale',
    animationConfig: {},
    styleConfig: {
      fontWeight: 800,
      fontSize: 52,
      textColor: '#111827',
      backgroundColor: '#fbbf24',
      backgroundPadding: '10px 28px',
      borderRadius: 999,
      strokeWidth: 0,
      shadowColor: 'rgba(0, 0, 0, 0.25)',
      shadowBlur: 8,
    },
  },
  neonGlow: {
    animation: 'glowActive',
    animationConfig: { glowColor: '#60a5fa' },
    styleConfig: {
      fontWeight: 700,
      fontSize: 46,
      backgroundColor: 'rgba(10, 10, 20, 0.55)',
      backgroundPadding: '12px 26px',
      borderRadius: 16,
    },
  },
};

export const CAPTION_STYLE_IDS = Object.keys(CAPTION_STYLES);

/**
 * Resolves a named caption style id into `{ animation, animationConfig,
 * styleConfig }` to spread into CaptionRenderer's props. Unknown/missing id
 * falls back to `boldKaraoke`, preserving the pre-existing default look for
 * any scene that doesn't set `captionStyle` at all.
 */
export const getCaptionStyle = (styleId) => CAPTION_STYLES[styleId] || CAPTION_STYLES.boldKaraoke;
