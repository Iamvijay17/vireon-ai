/**
 * Vireon AI design tokens.
 * Mirrors the CSS custom properties defined in src/index.css (@theme block).
 * Use Tailwind utility classes wherever possible; reach for these raw values
 * only when a color must be computed in JS (e.g. alpha-blended accents,
 * canvas/inline styles that can't be expressed as static class names).
 */

export const lightColors = {
  primary: "#6D56F9",
  primaryHover: "#5B3FEF",
  primaryActive: "#4C30D6",
  primaryBg: "#F2F1FF",

  surface: "#FFFFFF",
  surfaceHover: "#F4F4F5",
  surfaceActive: "#ECECEF",

  bg: "#FAFAFA",

  sidebarBg: "#0A0A0B",
  sidebarText: "#A1A1AA",
  sidebarActive: "#FFFFFF",
  sidebarActiveBg: "rgba(255, 255, 255, 0.1)",
  sidebarHoverBg: "rgba(255, 255, 255, 0.06)",

  textPrimary: "#18181B",
  textSecondary: "#52525B",
  textTertiary: "#A1A1AA",
  textInverse: "#FFFFFF",

  border: "#E4E4E7",
  borderLight: "#ECECEF",

  success: "#1FA971",
  successBg: "#E4F7EE",
  warning: "#D9832A",
  warningBg: "#FCF1DD",
  error: "#E5484D",
  errorBg: "#FBE4E4",
  info: "#3B82F6",
  infoBg: "#E8F0FE",
};

export const darkColors = {
  primary: "#9478FF",
  primaryHover: "#B3A6FF",
  primaryActive: "#6D56F9",
  primaryBg: "rgba(148, 120, 255, 0.12)",

  surface: "#18181B",
  surfaceHover: "#1C1C1F",
  surfaceActive: "#27272A",

  bg: "#0A0A0B",

  sidebarBg: "#000000",
  sidebarText: "#71717A",
  sidebarActive: "#FFFFFF",
  sidebarActiveBg: "rgba(255, 255, 255, 0.08)",
  sidebarHoverBg: "rgba(255, 255, 255, 0.05)",

  textPrimary: "#FAFAFA",
  textSecondary: "#A1A1AA",
  textTertiary: "#71717A",
  textInverse: "#0A0A0B",

  border: "#27272A",
  borderLight: "#1C1C1F",

  success: "#3DD68C",
  successBg: "#16302A",
  warning: "#F5B95C",
  warningBg: "#332711",
  error: "#F17075",
  errorBg: "#3A1E20",
  info: "#60A5FA",
  infoBg: "#182A44",
};

export const getColors = (theme) => (theme === "dark" ? darkColors : lightColors);

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 48,
  "3xl": 64,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 999,
};

export const typography = {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontMono: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: {
    xs: 12,
    sm: 13,
    base: 14,
    lg: 16,
    xl: 18,
    "2xl": 24,
    "3xl": 30,
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
};

export const shadows = {
  sm: "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
  md: "0 4px 10px -2px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.06)",
  lg: "0 12px 24px -6px rgb(0 0 0 / 0.1), 0 4px 8px -4px rgb(0 0 0 / 0.06)",
  xl: "0 24px 48px -12px rgb(0 0 0 / 0.16)",
};

// Durations (ms) and standard easing. Consumers must still gate on
// prefers-reduced-motion (see `prefersReducedMotion()` below) before applying
// non-essential animation.
export const motion = {
  duration: {
    fast: 120,
    base: 200,
    slow: 320,
  },
  easing: {
    standard: "cubic-bezier(0.4, 0, 0.2, 1)",
    decelerate: "cubic-bezier(0, 0, 0.2, 1)",
    accelerate: "cubic-bezier(0.4, 0, 1, 1)",
  },
};

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export const breakpoints = {
  xs: 0,
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1200,
  xxl: 1600,
};

export default getColors;
