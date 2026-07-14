/**
 * Vireon-AI Theme Configuration
 * Centralized theme tokens for Ant Design v6 compatibility
 */

// ─── Color Palette ───────────────────────────────────────────────────────────
export const colors = {
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
  bgDark: "#0f172a",

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

// ─── Ant Design Theme Token Overrides ────────────────────────────────────────
export const antdTheme = {
  token: {
    colorPrimary: colors.primary,
    colorSuccess: colors.success,
    colorWarning: colors.warning,
    colorError: colors.error,
    colorInfo: colors.info,
    colorBgBase: colors.bg,
    colorBgContainer: colors.surface,
    colorTextBase: colors.textPrimary,
    colorTextSecondary: colors.textSecondary,
    colorTextTertiary: colors.textTertiary,
    colorBorder: colors.border,
    colorBorderSecondary: colors.borderLight,
    borderRadius: 8,
    fontFamily: typography.fontFamily,
    fontSize: typography.fontSize.base,
  },
  components: {
    Layout: {
      headerBg: colors.surface,
      headerHeight: 64,
      bodyBg: colors.bg,
      siderBg: colors.sidebarBg,
      triggerBg: colors.sidebarBg,
      triggerHeight: 48,
    },
    Menu: {
      itemBg: "transparent",
      itemColor: colors.sidebarText,
      itemHoverBg: colors.sidebarHoverBg,
      itemHoverColor: colors.textInverse,
      itemSelectedBg: colors.sidebarActiveBg,
      itemSelectedColor: colors.sidebarActive,
      subMenuItemBg: "transparent",
      groupTitleColor: colors.textTertiary,
      collapsedWidth: 64,
    },
    Button: {
      primaryShadow: shadows.sm,
    },
  },
};

export default antdTheme;
