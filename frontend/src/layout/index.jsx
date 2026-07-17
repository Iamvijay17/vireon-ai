import React, { useState, useEffect, useCallback, useContext } from "react";
import { Layout } from "antd";
import { Routes, Route } from "react-router-dom";
import AppSidebar from "./sidebar";
import AppNavbar from "./navbar";
import Dashboard from "../pages/dashboard";
import Wizard from "../pages/wizard";
import RenderPage from "../pages/render";
import StudioPage from "../pages/studio";
import PlaceholderPage from "../pages/placeholder";
import { getColors, typography } from "../shared/theme";
import { ThemeContext } from "../shared/ThemeContext";

const { Content, Footer } = Layout;

// ─── Breakpoint ─────────────────────────────────────────────────────────────
const LARGE_BREAKPOINT = 992; // matches antd "lg"

// ─── Main Layout Component ───────────────────────────────────────────────────
const AppLayout = () => {
  const { theme } = useContext(ThemeContext);
  const dynamicColors = getColors(theme);
  
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
    <Layout style={{ minHeight: "100vh", background: dynamicColors.bg }}>
      {/* ── Sidebar (fixed) ───────────────────────────────────────────── */}
      <AppSidebar collapsed={collapsed} onCollapse={setCollapsed} />

      {/* ── Main content area (offset by sidebar width) ──────────────── */}
      <Layout
        style={{
          marginLeft: collapsed ? 64 : 240,
          transition: "margin-left 0.2s ease",
          background: dynamicColors.bg,
          minHeight: "100vh",
        }}
      >
        {/* Navbar (sticky) */}
        <AppNavbar collapsed={collapsed} onToggle={toggleCollapsed} />

        {/* Page content with routing */}
        <Content
          style={{
            padding: 24,
            minHeight: "calc(100vh - 64px - 56px)",
            background: dynamicColors.bg,
          }}
        >
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/wizard" element={<Wizard />} />
            <Route path="/render" element={<RenderPage />} />
            <Route path="/studio" element={<StudioPage />} />
            <Route path="/projects" element={<PlaceholderPage title="Projects" description="Manage your AI projects, create new ones, and organize your work." />} />
            <Route path="/analytics" element={<PlaceholderPage title="Analytics" description="View usage analytics and performance metrics for your renders." />} />
            <Route path="/settings" element={<PlaceholderPage title="Settings" description="Configure your preferences and application settings." />} />
            <Route path="/editor/complete" element={<PlaceholderPage title="Complete" description="View your completed renders and download the final outputs." />} />
          </Routes>
        </Content>

        {/* Footer */}
        <Footer
          style={{
            textAlign: "center",
            color: dynamicColors.textTertiary,
            fontSize: typography.fontSize.sm,
            borderTop: `1px solid ${dynamicColors.borderLight}`,
            background: dynamicColors.surface,
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
