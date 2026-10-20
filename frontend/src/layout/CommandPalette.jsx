import { useState, useEffect, useCallback, useContext, useId, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Lightbulb, PlusCircle, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ThemeContext } from "../shared/themeContextValue";
import { cn } from "../components/ui/cn";
import { useEscapeKey, useLockBodyScroll } from "../components/ui/hooks";
import { NAV_ITEMS } from "./navConfig";

/**
 * Ctrl/Cmd+K: jump to any page or run a quick action. The page list comes
 * from navConfig, so it is always the same set the sidebar shows.
 */
const CommandPalette = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useContext(ThemeContext);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listId = useId();

  const commands = useMemo(
    () => [
      { key: "action-create", label: "Create a new video", icon: PlusCircle, action: () => navigate("/wizard"), keywords: "start generate new" },
      ...NAV_ITEMS.map((item) => ({
        key: `go-${item.key}`,
        label: `Go to ${item.label}`,
        icon: item.icon,
        action: () => navigate(item.route),
        keywords: item.keywords,
      })),
      {
        key: "action-theme",
        label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        icon: Lightbulb,
        action: toggleTheme,
        keywords: "appearance mode",
      },
    ],
    [navigate, theme, toggleTheme]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.label} ${c.keywords || ""}`.toLowerCase().includes(q));
  }, [commands, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  const runCommand = useCallback(
    (command) => {
      if (!command) return;
      command.action();
      close();
    },
    [close]
  );

  useEscapeKey(close, open);
  useLockBodyScroll(open);

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
    if (open) inputRef.current?.focus();
  }, [open]);

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

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-start justify-center px-4 pt-[14vh]">
      <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative z-10 w-full max-w-xl animate-scale-in overflow-hidden rounded-xl border border-border bg-surface-raised shadow-xl"
      >
        <div className="flex items-center gap-3 border-b border-border-light px-4">
          <Search className="size-4 shrink-0 text-text-tertiary" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined}
            aria-label="Search pages and actions"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="Search pages and actions…"
            className="h-12 w-full bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
          />
        </div>

        <div id={listId} role="listbox" className="max-h-80 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-text-tertiary">Nothing matches “{query}”</p>
          ) : (
            filtered.map((command, index) => {
              const Icon = command.icon;
              return (
                <div
                  key={command.key}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onClick={() => runCommand(command)}
                  onMouseEnter={() => setActiveIndex(index)}
                  ref={(el) => {
                    if (el && index === activeIndex) el.scrollIntoView?.({ block: "nearest" });
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-[13px] font-medium transition-colors",
                    index === activeIndex ? "bg-surface-active text-text-primary" : "text-text-secondary"
                  )}
                >
                  <Icon className="size-4 shrink-0 text-accent-fg" />
                  {command.label}
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border-light px-4 py-2">
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[11px] text-text-tertiary">↑↓ navigate</kbd>
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[11px] text-text-tertiary">↵ select</kbd>
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[11px] text-text-tertiary">esc close</kbd>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CommandPalette;
