import React, { useContext } from "react";
import { Layout, Button, Avatar, Dropdown, Space, Badge, Input } from "antd";
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BellOutlined,
  UserOutlined,
  SearchOutlined,
  QuestionCircleOutlined,
  LogoutOutlined,
  SettingOutlined,
  ProfileOutlined,
  SunOutlined,
  MoonOutlined,
} from "@ant-design/icons";
import { colors, shadows, typography, getColors } from "../../shared/theme";
import { ThemeContext } from "../../shared/ThemeContext";

const { Header } = Layout;

// ─── User Dropdown Menu ─────────────────────────────────────────────────────
const userMenuItems = [
  {
    key: "profile",
    icon: <ProfileOutlined />,
    label: "Profile",
  },
  {
    key: "settings",
    icon: <SettingOutlined />,
    label: "Settings",
  },
  { type: "divider" },
  {
    key: "logout",
    icon: <LogoutOutlined />,
    label: "Logout",
    danger: true,
  },
];

// ─── Navbar Component ────────────────────────────────────────────────────────
const AppNavbar = ({ collapsed, onToggle }) => {
  const { theme, toggleTheme } = React.useContext(ThemeContext);
  const dynamicColors = getColors(theme);
  
  return (
    <Header
      style={{
        padding: "0 24px",
        background: colors.surface,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 64,
        borderBottom: `1px solid ${colors.border}`,
        boxShadow: shadows.sm,
        position: "sticky",
        top: 0,
        zIndex: 99,
        width: "100%",
      }}
    >
      {/* ── Left: Collapse toggle + Search ────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1 }}>
        <Button
          type="text"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={onToggle}
          style={{
            fontSize: 18,
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: colors.textSecondary,
            flexShrink: 0,
          }}
        />

        {/* Search bar */}
        <Input.Search
          placeholder="Search projects, renders..."
          allowClear
          prefix={<SearchOutlined style={{ color: colors.textTertiary }} />}
          style={{
            maxWidth: 380,
            width: "100%",
          }}
          styles={{
            input: {
              fontSize: typography.fontSize.sm,
              fontFamily: typography.fontFamily,
            },
          }}
        />
      </div>

      {/* ── Right: Actions & User ──────────────────────────────────────── */}
      <Space size={12} align="center">
      {/* Theme Toggle */}
        <Button
          type="text"
          icon={theme === "dark" ? <SunOutlined /> : <MoonOutlined />}
          onClick={toggleTheme}
          style={{ color: colors.textSecondary, fontSize: 18 }}
          size="large"
        />

        {/* Help */}
        <Button
          type="text"
          icon={<QuestionCircleOutlined />}
          style={{ color: dynamicColors.textSecondary, fontSize: 18 }}
          size="large"
        />

        {/* Notifications */}
        <Badge count={3} size="small" offset={[-2, 2]}>
          <Button
            type="text"
            icon={<BellOutlined />}
            style={{ color: dynamicColors.textSecondary, fontSize: 18 }}
            size="large"
          />
        </Badge>

        {/* User Avatar / Dropdown */}
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={["click"]}>
        <Space
            style={{ cursor: "pointer", padding: "4px 4px 4px 12px", borderRadius: 8 }}
            className="user-menu-trigger"
          >
            <span
              style={{
                color: dynamicColors.textPrimary,
                fontSize: typography.fontSize.sm,
                fontWeight: 500,
                lineHeight: 1,
              }}
            >
              Vijay
            </span>
            <Avatar
              size={36}
              icon={<UserOutlined />}
              style={{
                background: `linear-gradient(135deg, ${colors.primary}, ${colors.primaryLight})`,
                cursor: "pointer",
              }}
            />
          </Space>
        </Dropdown>
      </Space>
    </Header>
  );
};

export default AppNavbar;
