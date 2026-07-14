import React, { useState, useEffect, useCallback } from "react";
import { Layout } from "antd";
import AppSidebar from "./sidebar";
import AppNavbar from "./navbar";
import { colors, typography } from "../shared/theme";

const { Content, Footer } = Layout;

// ─── Breakpoint ─────────────────────────────────────────────────────────────
const LARGE_BREAKPOINT = 992; // matches antd "lg"

// ─── Main Layout Component ───────────────────────────────────────────────────
const AppLayout = () => {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth < LARGE_BREAKPOINT;
    }
    return false;
  });

  // ── Responsive Collapse ──────────────────────────────────────────────
  const handleResize = useCallback(() => {
    const width = window.innerWidth;
    if (width < LARGE_BREAKPOINT) {
      setCollapsed(true);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, [handleResize]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  return (
    <Layout style={{ minHeight: "100vh", background: colors.bg }}>
      {/* ── Sidebar (fixed) ───────────────────────────────────────────── */}
      <AppSidebar collapsed={collapsed} onCollapse={setCollapsed} />

      {/* ── Main content area (offset by sidebar width) ──────────────── */}
      <Layout
        style={{
          marginLeft: collapsed ? 64 : 240,
          transition: "margin-left 0.2s ease",
          background: colors.bg,
          minHeight: "100vh",
        }}
      >
        {/* Navbar (sticky) */}
        <AppNavbar collapsed={collapsed} onToggle={toggleCollapsed} />

        {/* Page content */}
        <Content
          style={{
            padding: 24,
            minHeight: "calc(100vh - 64px - 56px)",
            background: colors.bg,
          }}
        >
          {/* Content will go here */}
        </Content>

        {/* Footer */}
        <Footer
          style={{
            textAlign: "center",
            color: colors.textTertiary,
            fontSize: typography.fontSize.sm,
            borderTop: `1px solid ${colors.borderLight}`,
            background: colors.surface,
            padding: "16px 24px",
          }}
        >
          Vireon AI &copy; {new Date().getFullYear()} &mdash; Built with precision
        </Footer>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
