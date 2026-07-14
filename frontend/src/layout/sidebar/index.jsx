import React from "react";
import { Layout, Menu } from "antd";
import { useNavigate, useLocation } from "react-router-dom";
import {
  DashboardOutlined,
  ProjectOutlined,
  AppstoreOutlined,
  SettingOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
  CodeOutlined,
  BarChartOutlined,
  RocketOutlined,
} from "@ant-design/icons";
import { colors } from "../../shared/theme";

const { Sider } = Layout;

// Route mapping for menu keys
const ROUTE_MAP = {
  "/": "dashboard",
  "/projects": "projects",
  "/wizard": "wizard",
  "/render": "render",
  "/editor/complete": "complete",
  "/analytics": "analytics",
  "/settings": "settings",
};

const menuItems = [
  { key: "dashboard", icon: <DashboardOutlined />, label: "Dashboard", route: "/" },
  { key: "projects", icon: <ProjectOutlined />, label: "Projects", route: "/projects" },
  { key: "render", icon: <RocketOutlined />, label: "Render", route: "/render" },
  {
    key: "sub1",
    icon: <CodeOutlined />,
    label: "Editor",
    children: [
      { key: "wizard", icon: <AppstoreOutlined />, label: "Wizard", route: "/wizard" },
      { key: "complete", icon: <FileTextOutlined />, label: "Complete", route: "/editor/complete" },
    ],
  },
  { key: "analytics", icon: <BarChartOutlined />, label: "Analytics", route: "/analytics" },
  { key: "settings", icon: <SettingOutlined />, label: "Settings", route: "/settings" },
];

// Convert flat list + nested to a map for key->route resolution
const findRoute = (items, key) => {
  for (const item of items) {
    if (item.key === key) return item.route;
    if (item.children) {
      const found = findRoute(item.children, key);
      if (found) return found;
    }
  }
  return null;
};

// ─── Sidebar Component ───────────────────────────────────────────────────────
const AppSidebar = ({ collapsed, onCollapse }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentKey = ROUTE_MAP[location.pathname] || "dashboard";

  const handleMenuClick = ({ key }) => {
    const route = findRoute(menuItems, key);
    if (route) navigate(route);
  };

  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={onCollapse}
      width={240}
      collapsedWidth={64}
      breakpoint="lg"
      style={{
        overflow: "auto",
        height: "100vh",
        position: "fixed",
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 100,
        borderRight: `1px solid ${colors.border}`,
      }}
    >
      {/* ── Logo Area ─────────────────────────────────────────────────── */}
      <div
        onClick={() => navigate("/")}
        style={{
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          padding: collapsed ? 0 : "0 20px",
          borderBottom: `1px solid rgba(255,255,255,0.08)`,
          transition: "padding 0.2s",
          overflow: "hidden",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 700,
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          V
        </div>
        {!collapsed && (
          <span
            style={{
              marginLeft: 12,
              color: "#f1f5f9",
              fontSize: 18,
              fontWeight: 700,
              whiteSpace: "nowrap",
              letterSpacing: "-0.3px",
            }}
          >
            Vireon AI
          </span>
        )}
      </div>

      {/* ── Navigation Menu ────────────────────────────────────────────── */}
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[currentKey]}
        defaultOpenKeys={["sub1"]}
        items={menuItems}
        onClick={handleMenuClick}
        style={{
          borderRight: 0,
          paddingTop: 8,
        }}
      />
    </Sider>
  );
};

export default AppSidebar;
