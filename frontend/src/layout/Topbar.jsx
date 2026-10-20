import { useContext } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, PanelLeftClose, PanelLeftOpen, Search, Sun, Moon, Plus } from "lucide-react";
import { ThemeContext } from "../shared/themeContextValue";
import ConnectionIndicator from "../components/ConnectionIndicator";
import Breadcrumbs from "./Breadcrumbs";
import ActivityMenu from "./ActivityMenu";

const iconButton =
  "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary";

/**
 * The persistent header: sidebar toggle and breadcrumb trail on the left;
 * command search, live-connection state, running-job activity, theme and the
 * primary action on the right. Every control here does something real - there
 * is no account menu because the app has no accounts.
 */
const Topbar = ({ collapsed, onToggle, isDrawer = false }) => {
  const { theme, toggleTheme } = useContext(ThemeContext);
  const { pathname } = useLocation();

  const openPalette = () => window.dispatchEvent(new CustomEvent("vireon:open-command-palette"));

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between gap-3 border-b border-border bg-bg px-3 sm:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-label={isDrawer ? "Open navigation" : collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={isDrawer ? !collapsed : undefined}
          className={iconButton}
        >
          {isDrawer ? <Menu className="size-[18px]" /> : collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
        </button>
        <Breadcrumbs />
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        <button
          type="button"
          onClick={openPalette}
          className="hidden h-9 w-56 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-left text-[13px] text-text-tertiary transition-colors hover:border-border-strong lg:flex"
        >
          <Search className="size-4 shrink-0" />
          <span className="flex-1 truncate">Search or jump to…</span>
          <kbd className="shrink-0 rounded border border-border px-1.5 py-px text-[10.5px]">Ctrl K</kbd>
        </button>
        <button type="button" onClick={openPalette} aria-label="Search or jump to" className={`${iconButton} lg:hidden`}>
          <Search className="size-[18px]" />
        </button>

        <ConnectionIndicator className="hidden sm:inline-flex" />
        <ActivityMenu />

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          className={iconButton}
        >
          {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
        </button>

        {pathname !== "/wizard" && (
          <Link
            to="/wizard"
            className="ml-1 inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-white outline-none transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">Create Video</span>
            <span className="sr-only sm:hidden">Create Video</span>
          </Link>
        )}
      </div>
    </header>
  );
};

export default Topbar;
