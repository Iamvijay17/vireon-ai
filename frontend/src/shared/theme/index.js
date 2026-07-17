/**
 * Vireon-AI Theme Configuration
 * Centralized theme tokens for Ant Design v6 compatibility with light/dark mode
 */

// ─── Base Colors ─────────────────────────────────────────────────────────────
export const lightColors = {
  // Primary
  primary: "#6366f1",
  primaryLight: "#818cf8",
  primaryDark: "#4f46e5",
  primaryBg: "#eef2ff",

  // Surface
  surface: "#ffffff",
  surfaceHover: "#f8fafc",
  surfaceActive: "#f1f5f9",

  // Background
  bg: "#f8fafc",

  // Sidebar
  sidebarBg: "#1e293b",
  sidebarText: "#94a3b8",
  sidebarActive: "#6366f1",
  sidebarActiveBg: "rgba(99, 102, 241, 0.1)",
  sidebarHoverBg: "rgba(255, 255, 255, 0.05)",

  // Text
  textPrimary: "#1e293b",
  textSecondary: "#64748b",
  textTertiary: "#94a3b8",
  textInverse: "#ffffff",

  // Border
  border: "#e2e8f0",
  borderLight: "#f1f5f9",

  // Status
  success: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#3b82f6",
};

export const darkColors = {
  // Primary
  primary: "#818cf8",
  primaryLight: "#a5b4fc",
  primaryDark: "#6366f1",
  primaryBg: "#312e81",

  // Surface
  surface: "#1e293b",
  surfaceHover: "#334155",
  surfaceActive: "#475569",

  // Background
  bg: "#0f172a",

  // Sidebar
  sidebarBg: "#020617",
  sidebarText: "#94a3b8",
  sidebarActive: "#818cf8",
  sidebarActiveBg: "rgba(129, 140, 248, 0.15)",
  sidebarHoverBg: "rgba(255, 255, 255, 0.08)",

  // Text
  textPrimary: "#f1f5f9",
  textSecondary: "#cbd5e1",
  textTertiary: "#94a3b8",
  textInverse: "#0f172a",

  // Border
  border: "#334155",
  borderLight: "#1e293b",

  // Status
  success: "#4ade80",
  warning: "#fbbf24",
  error: "#f87171",
  info: "#60a5fa",
};

// ─── Theme-aware color getter ────────────────────────────────────────────────
export const getColors = (theme) => (theme === "dark" ? darkColors : lightColors);

export const colors = lightColors; // default

// ─── Spacing Scale ───────────────────────────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 48,
  "3xl": 64,
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

// ─── Ant Design Theme Token Factory ──────────────────────────────────────────
export const createAntdTheme = (theme) => {
  const c = getColors(theme);
  return {
    token: {
      colorPrimary: c.primary,
      colorSuccess: c.success,
      colorWarning: c.warning,
      colorError: c.error,
      colorInfo: c.info,
      colorBgBase: c.bg,
      colorBgContainer: c.surface,
      colorTextBase: c.textPrimary,
      colorTextSecondary: c.textSecondary,
      colorTextTertiary: c.textTertiary,
      colorBorder: c.border,
      colorBorderSecondary: c.borderLight,
      borderRadius: 8,
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
      },
    },
  };
};

export default createAntdTheme;
