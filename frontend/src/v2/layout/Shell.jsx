import { useCallback, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutGrid, Clapperboard, Wand2, ListChecks, AudioLines, BookOpen,
  Boxes, BarChart3, ScrollText, Settings, PanelLeftClose, PanelLeft,
  Search, Plus, Circle, Menu, X,
} from "lucide-react";
import { Button } from "../ui/primitives";
import { cx } from "../ui/cx";
import { useSocketRoom } from "../../shared/useSocketRoom";
import { useMediaQuery } from "../../lib/useMediaQuery";
import VersionLabel from "../../components/VersionLabel";
import { useEscapeKey, useLockBodyScroll } from "../../components/ui/hooks";

/**
 * The v2 shell.
 *
 * Two departures from v1's sidebar, both deliberate:
 *
 * 1. Navigation is *grouped by intent* (Create / Library / System) rather
 *    than being one flat list of 14 links. v1's list had no hierarchy, so
 *    finding anything meant reading all of it.
 * 2. Collapsed is a real mode, not a narrow version of the same thing:
 *    icons stay on a fixed rail with tooltips, so muscle memory survives
 *    the toggle.
 */

const NAV = [
  {
    group: "Create",
    items: [
      { to: "/v2", end: true, label: "Overview", icon: LayoutGrid },
      { to: "/v2/new", label: "New video", icon: Wand2 },
      { to: "/v2/studio", label: "Studio", icon: Clapperboard },
    ],
  },
  {
    group: "Library",
    items: [
      { to: "/v2/jobs", label: "Jobs", icon: ListChecks },
      { to: "/v2/courses", label: "Courses", icon: BookOpen },
      { to: "/v2/audio", label: "Audio", icon: AudioLines },
      { to: "/v2/assets", label: "Assets", icon: Boxes },
    ],
  },
  {
    group: "System",
    items: [
      { to: "/v2/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/v2/logs", label: "Logs", icon: ScrollText },
      { to: "/v2/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function Shell({ children }) {
  const { pathname } = useLocation();
  // `lg` and up: persistent rail. Below: an off-canvas drawer opened from
  // the top bar, so content gets the full width on phones and tablets.
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [collapsed, setCollapsed] = useState(false);
  // Remembered as "opened at <pathname>" so any navigation closes it
  // without an effect.
  const [drawerPath, setDrawerPath] = useState(null);
  const drawerOpen = !isDesktop && drawerPath === pathname;

  const openDrawer = useCallback(() => setDrawerPath(pathname), [pathname]);
  const closeDrawer = useCallback(() => setDrawerPath(null), []);

  useEscapeKey(closeDrawer, drawerOpen);
  useLockBodyScroll(drawerOpen);

  return (
    <div data-v2 className="flex min-h-screen w-full">
      <Sidebar
        collapsed={isDesktop && collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        isDrawer={!isDesktop}
        open={drawerOpen}
        onClose={closeDrawer}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar showMenu={!isDesktop} onMenu={openDrawer} />
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-7 sm:py-6">{children}</main>
      </div>
    </div>
  );
}

function Sidebar({ collapsed, onToggle, isDrawer, open, onClose }) {
  const hidden = isDrawer && !open;

  return (
    <>
      {isDrawer && (
        <div
          aria-hidden="true"
          onClick={onClose}
          className={cx(
            "fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200",
            open ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        />
      )}
      <aside
        aria-hidden={hidden || undefined}
        inert={hidden || undefined}
        className={cx(
          "flex flex-col border-r border-line bg-surface-1",
          "transition-[width,transform] duration-200 ease-[var(--ease-v2-out)]",
          isDrawer
            ? cx(
                "fixed inset-y-0 left-0 z-50 w-[260px] max-w-[85vw]",
                hidden ? "-translate-x-full" : "translate-x-0 shadow-[var(--shadow-v2-pop)]"
              )
            : cx("sticky top-0 h-screen shrink-0", collapsed ? "w-[68px]" : "w-[228px]")
        )}
      >
        {/* Brand */}
        <div className={cx("flex h-14 items-center gap-2.5", collapsed ? "justify-center px-0" : "px-5")}>
          <div
            className="flex size-7 shrink-0 items-center justify-center rounded-[9px] text-[13px] font-bold text-white"
            style={{
              background: "linear-gradient(135deg, var(--color-signal-400), var(--color-signal-700))",
            }}
          >
            V
          </div>
          {!collapsed && <span className="display text-[14.5px] text-hi">Vireon</span>}
          {isDrawer && (
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              className="ml-auto -mr-2"
              onClick={onClose}
              icon={<X className="size-4" />}
              aria-label="Close navigation"
            />
          )}
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-4">
          {NAV.map((section) => (
            <div key={section.group} className="mb-5 last:mb-0">
              {/* The group label is the hierarchy; when collapsed it becomes a
                  hairline so the grouping survives without text. */}
              {collapsed ? (
                <div className="mx-auto mb-2 h-px w-6 bg-[var(--v2-line)]" />
              ) : (
                <p className="label-xs mb-1.5 px-2.5">{section.group}</p>
              )}
              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <NavItem key={item.to} {...item} collapsed={collapsed} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <VersionLabel className="label-xs shrink-0 truncate px-2 pb-2 text-center normal-case" />

        {/* The collapse toggle only means something for the desktop rail. */}
        {!isDrawer && (
          <div className="border-t border-line-soft p-3">
            <Button
              variant="ghost"
              size="sm"
              iconOnly={collapsed}
              onClick={onToggle}
              className={cx("w-full", !collapsed && "justify-start")}
              icon={collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {!collapsed && "Collapse"}
            </Button>
          </div>
        )}
      </aside>
    </>
  );
}

function NavItem({ to, end, label, icon: Icon, collapsed }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cx(
          "relative flex h-9 items-center rounded-[var(--radius-v2-sm)] text-[13.5px] font-medium",
          "transition-colors duration-140 ease-[var(--ease-v2-out)]",
          collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
          isActive
            ? "bg-accent-soft text-accent"
            : "text-mid hover:bg-[var(--v2-hover)] hover:text-hi"
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Active marker rides the left edge rather than filling the row,
              so the active state is visible even in collapsed mode. */}
          {isActive && (
            <span className="absolute top-1/2 -left-3 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--v2-accent)]" />
          )}
          <Icon className="size-4 shrink-0" strokeWidth={2} />
          {!collapsed && <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  );
}

function TopBar({ showMenu, onMenu }) {
  const { pathname } = useLocation();
  // Room-less: this only wants the connection status the store already
  // tracks, not a subscription to any particular job.
  const socketStatus = useSocketRoom(null);

  const title =
    NAV.flatMap((s) => s.items).find((i) => (i.end ? pathname === i.to : pathname.startsWith(i.to)))?.label ||
    "Vireon";

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-[color-mix(in_srgb,var(--v2-bg)_85%,transparent)] px-4 backdrop-blur-xl sm:px-7">
      {showMenu && (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          className="-ml-2 shrink-0"
          onClick={onMenu}
          icon={<Menu className="size-4" />}
          aria-label="Open navigation"
        />
      )}
      <h1 className="display min-w-0 truncate text-[15px] text-hi">{title}</h1>

      <div className="flex-1" />

      <button
        type="button"
        aria-label="Search"
        className="interactive flex h-8 shrink-0 items-center gap-2 rounded-[var(--radius-v2-sm)] border border-line px-2 text-[12.5px] text-lo md:pr-2 md:pl-2.5"
      >
        <Search className="size-3.5" />
        <span className="hidden md:inline">Search</span>
        <kbd className="hidden rounded border border-line-soft bg-[var(--v2-hover)] px-1.5 py-0.5 text-[10px] text-lo md:inline">
          ⌘K
        </kbd>
      </button>

      <ConnectionChip status={socketStatus} />

      <Button variant="solid" size="sm" className="shrink-0 max-sm:aspect-square max-sm:!px-0" icon={<Plus className="size-4" />} aria-label="New video">
        <span className="hidden sm:inline">New video</span>
      </Button>
    </header>
  );
}

const CONNECTION = {
  connected: { label: "Live", color: "var(--color-state-done)" },
  reconnecting: { label: "Reconnecting", color: "var(--color-state-wait)" },
  disconnected: { label: "Offline", color: "var(--color-state-idle)" },
};

function ConnectionChip({ status }) {
  const { label, color } = CONNECTION[status] || CONNECTION.disconnected;
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-lo" title={`Realtime: ${label}`}>
      <Circle
        className={cx("size-2 fill-current", status === "connected" && "animate-v2-pulse")}
        style={{ color }}
      />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}
