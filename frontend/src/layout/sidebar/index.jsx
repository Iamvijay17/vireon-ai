import React from "react";
import { Layout, Menu } from "antd";
import {
  DashboardOutlined,
  ProjectOutlined,
  AppstoreOutlined,
  SettingOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
  CodeOutlined,
  BarChartOutlined,
} from "@ant-design/icons";
import { colors } from "../../shared/theme";

const { Sider } = Layout;

// ─── Menu Items Configuration ───────────────────────────────────────────────
const menuItems = [
  { key: "1", icon: <DashboardOutlined />, label: "Dashboard" },
  { key: "2", icon: <ProjectOutlined />, label: "Projects" },
  { key: "3", icon: <ThunderboltOutlined />, label: "Render" },
  {
    key: "sub1",
    icon: <CodeOutlined />,
    label: "Editor",
    children: [
      { key: "4", icon: <AppstoreOutlined />, label: "Wizard" },
      { key: "5", icon: <FileTextOutlined />, label: "Complete" },
    ],
  },
  { key: "6", icon: <BarChartOutlined />, label: "Analytics" },
  { key: "7", icon: <SettingOutlined />, label: "Settings" },
];

// ─── Sidebar Component ───────────────────────────────────────────────────────
const AppSidebar = ({ collapsed, onCollapse }) => {
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
        style={{
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          padding: collapsed ? 0 : "0 20px",
          borderBottom: `1px solid rgba(255,255,255,0.08)`,
          transition: "padding 0.2s",
          overflow: "hidden",
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
        defaultSelectedKeys={["1"]}
        defaultOpenKeys={["sub1"]}
        items={menuItems}
        style={{
          borderRight: 0,
          paddingTop: 8,
        }}
      />
    </Sider>
  );
};

export default AppSidebar;
