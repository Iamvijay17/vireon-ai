import { useContext } from "react";
import { Layout, Button, Avatar, Dropdown, Space, Badge } from "antd";
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
import { shadows, typography } from "../../shared/theme";
import { ThemeContext } from "../../shared/themeContextValue";

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
  const { theme, toggleTheme, colors } = useContext(ThemeContext);

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

        {/* Command palette trigger, styled as a search bar */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("vireon:open-command-palette"))}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            maxWidth: 380,
            width: "100%",
            height: 36,
            padding: "0 12px",
            borderRadius: 8,
            border: `1px solid ${colors.border}`,
            background: colors.bg,
            color: colors.textTertiary,
            fontSize: typography.fontSize.sm,
            fontFamily: typography.fontFamily,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <SearchOutlined />
          <span style={{ flex: 1 }}>Search or jump to...</span>
          <span
            style={{
              fontSize: 11,
              padding: "1px 6px",
              borderRadius: 4,
              border: `1px solid ${colors.border}`,
              color: colors.textTertiary,
            }}
          >
            ⌘K
          </span>
        </button>
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
          style={{ color: colors.textSecondary, fontSize: 18 }}
          size="large"
        />

        {/* Notifications */}
        <Badge count={3} size="small" offset={[-2, 2]}>
          <Button
            type="text"
            icon={<BellOutlined />}
            style={{ color: colors.textSecondary, fontSize: 18 }}
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
                color: colors.textPrimary,
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
