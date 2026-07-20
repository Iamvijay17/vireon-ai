import { useState, useEffect, useCallback, useContext, useMemo, useRef } from "react";
import { Modal, Input, List, Tag } from "antd";
import {
  DashboardOutlined,
  PlusCircleOutlined,
  BookOutlined,
  EditOutlined,
  PlayCircleOutlined,
  BulbOutlined,
  ProjectOutlined,
  BarChartOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { ThemeContext } from "../shared/themeContextValue";

const CommandPalette = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme, colors } = useContext(ThemeContext);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  const commands = useMemo(
    () => [
      { key: "dashboard", label: "Go to Dashboard", icon: <DashboardOutlined />, action: () => navigate("/") },
      { key: "wizard", label: "Create New Video", icon: <PlusCircleOutlined />, action: () => navigate("/wizard") },
      { key: "courses", label: "View Courses", icon: <BookOutlined />, action: () => navigate("/courses") },
      { key: "studio", label: "Open Studio", icon: <EditOutlined />, action: () => navigate("/studio") },
      { key: "render", label: "Render Progress", icon: <PlayCircleOutlined />, action: () => navigate("/render") },
      { key: "projects", label: "Go to Projects", icon: <ProjectOutlined />, action: () => navigate("/projects") },
      { key: "analytics", label: "Go to Analytics", icon: <BarChartOutlined />, action: () => navigate("/analytics") },
      { key: "settings", label: "Go to Settings", icon: <SettingOutlined />, action: () => navigate("/settings") },
      {
        key: "theme",
        label: theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode",
        icon: <BulbOutlined />,
        action: toggleTheme,
      },
    ],
    [navigate, theme, toggleTheme]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  const runCommand = useCallback((command) => {
    if (!command) return;
    command.action();
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  // Global ⌘K / Ctrl+K shortcut, plus a custom event so other UI (e.g. the
  // navbar search box) can open the palette without prop-drilling state.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    const handleOpenEvent = () => setOpen(true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("vireon:open-command-palette", handleOpenEvent);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("vireon:open-command-palette", handleOpenEvent);
    };
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const handleInputKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      runCommand(filtered[activeIndex]);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={() => setOpen(false)}
      footer={null}
      closable={false}
      width={520}
      style={{ top: 120 }}
      afterOpenChange={(visible) => visible && inputRef.current?.focus()}
    >
      <Input
        ref={inputRef}
        size="large"
        placeholder="Type a command or search..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleInputKeyDown}
        variant="borderless"
        autoFocus
      />
      <div style={{ borderTop: `1px solid ${colors.borderLight}`, marginTop: 8, paddingTop: 8, maxHeight: 320, overflowY: "auto" }}>
        <List
          dataSource={filtered}
          locale={{ emptyText: "No matching commands" }}
          renderItem={(command, index) => (
            <List.Item
              onClick={() => runCommand(command)}
              style={{
                cursor: "pointer",
                padding: "10px 12px",
                borderRadius: 8,
                background: index === activeIndex ? colors.surfaceActive : "transparent",
                border: "none",
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 10, color: colors.textPrimary, width: "100%" }}>
                <span style={{ color: colors.primary, fontSize: 16 }}>{command.icon}</span>
                {command.label}
              </span>
            </List.Item>
          )}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
        <Tag style={{ color: colors.textTertiary }}>&uarr; &darr; navigate</Tag>
        <Tag style={{ color: colors.textTertiary }}>&crarr; select</Tag>
        <Tag style={{ color: colors.textTertiary }}>esc close</Tag>
      </div>
    </Modal>
  );
};

export default CommandPalette;
