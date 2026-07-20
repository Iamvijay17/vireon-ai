import { useContext } from "react";
import { PanelLeftClose, PanelLeftOpen, Bell, User, Search, HelpCircle, Sun, Moon, LogOut, Settings, UserRound } from "lucide-react";
import { ThemeContext } from "../../shared/themeContextValue";
import { Dropdown, DropdownItem, DropdownDivider } from "../../components/ui/Dropdown";
import { cn } from "../../components/ui/cn";

const AppNavbar = ({ collapsed, onToggle }) => {
  const { theme, toggleTheme } = useContext(ThemeContext);

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border bg-surface/80 px-6 backdrop-blur-md">
      {/* Left: collapse toggle + search */}
      <div className="flex flex-1 items-center gap-4">
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
        </button>

        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("vireon:open-command-palette"))}
          className="flex h-9 w-full max-w-96 items-center gap-2 rounded-lg border border-border bg-bg px-3 text-left text-sm text-text-tertiary transition-colors hover:border-neutral-300 dark:hover:border-neutral-700"
        >
          <Search className="size-4 shrink-0" />
          <span className="flex-1 truncate">Search or jump to...</span>
          <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] text-text-tertiary">⌘K</span>
        </button>
      </div>

      {/* Right: actions + user */}
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="flex size-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
        </button>

        <button
          type="button"
          aria-label="Help"
          className="flex size-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          <HelpCircle className="size-[18px]" />
        </button>

        <button
          type="button"
          aria-label="Notifications"
          className="relative flex size-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          <Bell className="size-[18px]" />
          <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-white">
            3
          </span>
        </button>

        <Dropdown
          align="end"
          trigger={({ toggle, open }) => (
            <button
              type="button"
              onClick={toggle}
              aria-label="Account menu"
              className={cn(
                "user-menu-trigger ml-1 flex items-center gap-2.5 rounded-lg py-1 pl-3 pr-1 transition-colors",
                open && "bg-surface-hover"
              )}
            >
              <span className="text-[13px] font-medium text-text-primary">Vijay</span>
              <span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-accent-400 to-accent-600 text-white">
                <User className="size-4" />
              </span>
            </button>
          )}
        >
          {() => (
            <>
              <DropdownItem icon={<UserRound className="size-4" />}>Profile</DropdownItem>
              <DropdownItem icon={<Settings className="size-4" />}>Settings</DropdownItem>
              <DropdownDivider />
              <DropdownItem danger icon={<LogOut className="size-4" />}>
                Logout
              </DropdownItem>
            </>
          )}
        </Dropdown>
      </div>
    </header>
  );
};

export default AppNavbar;
