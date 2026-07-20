import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  BookOpen,
  FolderKanban,
  Rocket,
  Code2,
  LayoutGrid,
  FileText,
  BarChart3,
  Settings,
  ChevronDown,
} from "lucide-react";
import { cn } from "../../components/ui/cn";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, route: "/" },
  { key: "courses", label: "Courses", icon: BookOpen, route: "/courses" },
  { key: "projects", label: "Projects", icon: FolderKanban, route: "/projects" },
  { key: "render", label: "Render", icon: Rocket, route: "/render" },
  {
    key: "editor",
    label: "Editor",
    icon: Code2,
    children: [
      { key: "wizard", label: "Wizard", icon: LayoutGrid, route: "/wizard" },
      { key: "complete", label: "Complete", icon: FileText, route: "/editor/complete" },
    ],
  },
  { key: "analytics", label: "Analytics", icon: BarChart3, route: "/analytics" },
  { key: "settings", label: "Settings", icon: Settings, route: "/settings" },
];

const isActive = (item, pathname) => {
  if (item.route) {
    if (item.route === "/") return pathname === "/";
    return pathname.startsWith(item.route);
  }
  if (item.children) return item.children.some((c) => pathname.startsWith(c.route));
  return false;
};

const NavRow = ({ icon: Icon, label, active, collapsed, onClick, indent = false, trailing = null }) => (
  <button
    type="button"
    onClick={onClick}
    title={collapsed ? label : undefined}
    className={cn(
      "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
      collapsed && "justify-center px-0",
      indent && !collapsed && "pl-9",
      active
        ? "bg-sidebar-active-bg text-sidebar-text-active"
        : "text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active"
    )}
  >
    <Icon className="size-[18px] shrink-0" />
    {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{label}</span>}
    {!collapsed && trailing}
  </button>
);

const AppSidebar = ({ collapsed }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [openGroups, setOpenGroups] = useState({ editor: true });

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex flex-col bg-sidebar transition-[width] duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <button
        type="button"
        onClick={() => navigate("/")}
        className={cn(
          "flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.06] px-5",
          collapsed && "justify-center px-0"
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent-400 to-accent-600 text-sm font-bold text-white">
          V
        </span>
        {!collapsed && (
          <span className="truncate text-[15px] font-semibold tracking-tight text-white">Vireon AI</span>
        )}
      </button>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item, location.pathname);

          if (item.children) {
            const open = collapsed || openGroups[item.key];
            return (
              <div key={item.key}>
                <NavRow
                  icon={item.icon}
                  label={item.label}
                  active={active && !open}
                  collapsed={collapsed}
                  onClick={() =>
                    collapsed
                      ? navigate(item.children[0].route)
                      : setOpenGroups((prev) => ({ ...prev, [item.key]: !prev[item.key] }))
                  }
                  trailing={<ChevronDown className={cn("size-3.5 text-sidebar-text transition-transform", open && "rotate-180")} />}
                />
                {!collapsed && open && (
                  <div className="mt-0.5 space-y-0.5">
                    {item.children.map((child) => (
                      <NavRow
                        key={child.key}
                        icon={child.icon}
                        label={child.label}
                        active={location.pathname.startsWith(child.route)}
                        collapsed={false}
                        indent
                        onClick={() => navigate(child.route)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <NavRow
              key={item.key}
              icon={item.icon}
              label={item.label}
              active={active}
              collapsed={collapsed}
              onClick={() => navigate(item.route)}
            />
          );
        })}
      </nav>
    </aside>
  );
};

export default AppSidebar;
