import { Link, useLocation } from "react-router-dom";
import { X } from "lucide-react";
import { cn } from "../components/ui/cn";
import VersionLabel from "../components/VersionLabel";
import { Logo, LogoMark } from "../components/Logo";
import { NAV_SECTIONS, isNavItemActive } from "./navConfig";

const NavRow = ({ item, active, collapsed }) => {
  const Icon = item.icon;
  return (
    <Link
      to={item.route}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium outline-none transition-colors",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
        collapsed && "justify-center px-0",
        active
          ? "bg-sidebar-active-bg text-sidebar-text-active"
          : "text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active"
      )}
    >
      {active && <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-accent-fg" />}
      <Icon className={cn("size-[17px] shrink-0", active && "text-accent-fg")} />
      {collapsed ? <span className="sr-only">{item.label}</span> : <span className="min-w-0 flex-1 truncate">{item.label}</span>}
    </Link>
  );
};

/**
 * Persistent navigation. Desktop: a rail that collapses to icons. Below `lg`
 * it is an off-canvas drawer (isDrawer), closed by default and inert while
 * hidden so keyboard focus cannot wander into it.
 */
const Sidebar = ({ collapsed, isDrawer = false, open = false, onClose }) => {
  const { pathname, search } = useLocation();
  const hidden = isDrawer && !open;

  return (
    <>
      {isDrawer && (
        <div
          aria-hidden="true"
          onClick={onClose}
          className={cn(
            "fixed inset-0 z-[45] bg-black/60 transition-opacity duration-200",
            open ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        />
      )}
      <aside
        aria-label="Primary"
        aria-hidden={hidden || undefined}
        inert={hidden || undefined}
        className={cn(
          "fixed inset-y-0 left-0 flex flex-col border-r border-border-light bg-sidebar transition-[width,transform] duration-200",
          isDrawer ? "z-50 w-64 max-w-[85vw]" : collapsed ? "z-40 w-16" : "z-40 w-60",
          hidden ? "-translate-x-full" : "translate-x-0"
        )}
      >
        <div className="flex h-14 shrink-0 items-center border-b border-border-light">
          <Link
            to="/"
            aria-label="Vireon AI - Overview"
            className={cn(
              "flex h-full min-w-0 flex-1 items-center px-4 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
              collapsed && "justify-center px-0"
            )}
          >
            {collapsed ? <LogoMark size={30} className="shrink-0" /> : <Logo variant="compact" height={30} className="shrink-0" />}
          </Link>
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

        <nav aria-label="Main" className="flex-1 overflow-y-auto px-2.5 py-3">
          {NAV_SECTIONS.map((section, index) => (
            <div key={section.key} className={cn(index > 0 && "mt-4")}>
              {collapsed ? (
                index > 0 && <div className="mx-2 mb-2 h-px bg-border-light" />
              ) : (
                <p className="mb-1 px-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-sidebar-text/70">
                  {section.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.key}>
                    <NavRow item={item} active={isNavItemActive(item, pathname, search)} collapsed={collapsed} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <VersionLabel className="shrink-0 truncate border-t border-border-light px-2 py-2.5 text-center text-[11px] text-sidebar-text" />
      </aside>
    </>
  );
};

export default Sidebar;
