/**
 * Vireon-AI Theme Configuration
 * Centralized theme tokens for Ant Design v6 compatibility with light/dark mode
 */

// ─── Base Colors ─────────────────────────────────────────────────────────────
export const lightColors = {
  // Primary
  primary: "#5546E3",
  primaryHover: "#6B5AEE",
  primaryActive: "#4536C4",
  primaryLight: "#6B5AEE",
  primaryDark: "#4536C4",
  primaryBg: "#EEECFC",

  // Surface
  surface: "#FFFFFF",
  surfaceHover: "#F5F4FA",
  surfaceActive: "#ECEAF6",

  // Background
  bg: "#F7F7FB",

  // Sidebar
  sidebarBg: "#17152B",
  sidebarText: "#A29DC2",
  sidebarActive: "#8B7CF6",
  sidebarActiveBg: "rgba(139, 124, 246, 0.14)",
  sidebarHoverBg: "rgba(255, 255, 255, 0.05)",

  // Text
  textPrimary: "#1B1830",
  textSecondary: "#5D5878",
  textTertiary: "#948FB0",
  textInverse: "#FFFFFF",

  // Border
  border: "#E5E2F0",
  borderLight: "#F0EEF8",

  // Status
  success: "#22B573",
  successBg: "#E4F7EE",
  warning: "#F0A93B",
  warningBg: "#FCF1DD",
  error: "#E5484D",
  errorBg: "#FBE4E4",
  info: "#3B82F6",
  infoBg: "#E8F0FE",
};

export const darkColors = {
  // Primary
  primary: "#8B7CF6",
  primaryHover: "#A093F8",
  primaryActive: "#7565E0",
  primaryLight: "#A093F8",
  primaryDark: "#7565E0",
  primaryBg: "#2A2450",

  // Surface
  surface: "#1B1830",
  surfaceHover: "#262143",
  surfaceActive: "#322B55",

  // Background
  bg: "#121022",

  // Sidebar
  sidebarBg: "#0A0916",
  sidebarText: "#948FB0",
  sidebarActive: "#A093F8",
  sidebarActiveBg: "rgba(160, 147, 248, 0.18)",
  sidebarHoverBg: "rgba(255, 255, 255, 0.06)",

  // Text
  textPrimary: "#F2F0FA",
  textSecondary: "#C7C2DE",
  textTertiary: "#948FB0",
  textInverse: "#17152B",

  // Border
  border: "#322B55",
  borderLight: "#211D3D",

  // Status
  success: "#3DD68C",
  successBg: "#16302A",
  warning: "#F5B95C",
  warningBg: "#332711",
  error: "#F17075",
  errorBg: "#3A1E20",
  info: "#60A5FA",
  infoBg: "#182A44",
};

// ─── Theme-aware color getter ────────────────────────────────────────────────
export const getColors = (theme) => (theme === "dark" ? darkColors : lightColors);

// ─── Spacing Scale (8pt grid) ─────────────────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 48,
  "3xl": 64,
};

// ─── Radius Scale ─────────────────────────────────────────────────────────────
export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 999,
};

// ─── Typography ──────────────────────────────────────────────────────────────
export const typography = {
  fontFamily:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
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

// ─── Shadows ─────────────────────────────────────────────────────────────────
export const shadows = {
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
};

// ─── Motion ──────────────────────────────────────────────────────────────────
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

// ─── Responsive Breakpoints (px) ─────────────────────────────────────────────
export const breakpoints = {
  xs: 0,
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1200,
  xxl: 1600,
};

// ─── Ant Design Theme Token Factory ──────────────────────────────────────────
export const createAntdTheme = (theme) => {
  const c = getColors(theme);
  return {
    token: {
      colorPrimary: c.primary,
      colorPrimaryHover: c.primaryHover,
      colorPrimaryActive: c.primaryActive,
      colorSuccess: c.success,
      colorWarning: c.warning,
      colorError: c.error,
      colorInfo: c.info,
      colorBgBase: c.bg,
      colorBgContainer: c.surface,
      colorBgElevated: c.surface,
      colorTextBase: c.textPrimary,
      colorTextSecondary: c.textSecondary,
      colorTextTertiary: c.textTertiary,
      colorBorder: c.border,
      colorBorderSecondary: c.borderLight,
      borderRadius: radius.sm,
      borderRadiusLG: radius.md,
      fontFamily: typography.fontFamily,
      fontSize: typography.fontSize.base,
    },
    components: {
      Layout: {
        headerBg: c.surface,
        headerHeight: 64,
        bodyBg: c.bg,
        siderBg: c.sidebarBg,
        triggerBg: c.sidebarBg,
        triggerHeight: 48,
      },
      Menu: {
        itemBg: "transparent",
        itemColor: c.sidebarText,
        itemHoverBg: c.sidebarHoverBg,
        itemHoverColor: c.textInverse,
        itemSelectedBg: c.sidebarActiveBg,
        itemSelectedColor: c.sidebarActive,
        subMenuItemBg: "transparent",
        groupTitleColor: c.textTertiary,
        collapsedWidth: 64,
      },
      Button: {
        primaryShadow: shadows.sm,
        borderRadius: radius.sm,
      },
      Card: {
        borderRadiusLG: radius.lg,
      },
    },
  };
};

export default createAntdTheme;
