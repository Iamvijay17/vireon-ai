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
  Terminal,
  AudioLines,
  ImagePlus,
  ListChecks,
  Workflow,
  Boxes,
  X,
} from "lucide-react";
import { cn } from "../../components/ui/cn";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, route: "/" },
  { key: "courses", label: "Courses", icon: BookOpen, route: "/courses" },
  { key: "projects", label: "Projects", icon: FolderKanban, route: "/projects" },
  { key: "jobs", label: "Job Management", icon: ListChecks, route: "/jobs" },
  { key: "workflow", label: "Workflow", icon: Workflow, route: "/workflow" },
  { key: "assets", label: "Assets", icon: Boxes, route: "/assets" },
  { key: "render", label: "Render", icon: Rocket, route: "/render" },
  { key: "audio", label: "Audio Studio", icon: AudioLines, route: "/audio" },
  { key: "images", label: "Image Studio", icon: ImagePlus, route: "/images" },
  {
    key: "editor",
    label: "Editor",
    icon: Code2,
    children: [
      { key: "wizard", label: "New Video", icon: LayoutGrid, route: "/wizard" },
      { key: "complete", label: "Complete", icon: FileText, route: "/editor/complete" },
    ],
  },
  { key: "analytics", label: "Analytics", icon: BarChart3, route: "/analytics" },
  { key: "logs", label: "Live Logs", icon: Terminal, route: "/logs" },
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
      "relative flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-[13px] lg:py-2 font-medium transition-colors cursor-pointer",
      collapsed && "justify-center px-0",
      indent && !collapsed && "pl-9",
      active
        ? "bg-sidebar-active-bg text-sidebar-text-active"
        : "text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active"
    )}
  >
    {/* Ties the active row to the brand accent, matching the underline
        Tabs already uses for its active state - previously the sidebar's
        active state was pure white/neutral with no accent at all. */}
    {active && (
      <span
        className={cn(
          "absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-accent",
          collapsed && "left-0"
        )}
      />
    )}
    <Icon className={cn("size-[18px] shrink-0", active && "text-accent-400")} />
    {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{label}</span>}
    {!collapsed && trailing}
  </button>
);

const AppSidebar = ({ collapsed, isDrawer = false, open = false, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [openGroups, setOpenGroups] = useState({ editor: true });

  const hidden = isDrawer && !open;

  return (
    <>
      {isDrawer && (
        <div
          aria-hidden="true"
          onClick={onClose}
          className={cn(
            "fixed inset-0 z-[45] bg-black/50 backdrop-blur-[2px] transition-opacity duration-200",
            open ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        />
      )}
    <aside
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
      className={cn(
        "fixed inset-y-0 left-0 flex flex-col bg-sidebar transition-[width,transform] duration-200",
        isDrawer ? "z-50 w-64 max-w-[85vw]" : collapsed ? "z-40 w-16" : "z-40 w-60",
        hidden ? "-translate-x-full" : "translate-x-0",
        isDrawer && open && "shadow-2xl shadow-black/40"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center border-b border-white/[0.06]">
      <button
        type="button"
        onClick={() => navigate("/")}
        className={cn(
          "flex h-full min-w-0 flex-1 items-center gap-3 px-5 cursor-pointer",
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
      {isDrawer && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="mr-3 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-sidebar-text transition-colors hover:bg-sidebar-hover hover:text-sidebar-text-active"
        >
          <X className="size-[18px]" />
        </button>
      )}
      </div>

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
    </>
  );
};

export default AppSidebar;
