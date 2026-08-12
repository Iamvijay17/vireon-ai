import { useState, useEffect, useCallback, useContext, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  LayoutDashboard,
  PlusCircle,
  BookOpen,
  Pencil,
  PlayCircle,
  Lightbulb,
  FolderKanban,
  BarChart3,
  Settings,
  Search,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ThemeContext } from "../shared/themeContextValue";
import { cn } from "../components/ui/cn";
import { useEscapeKey, useLockBodyScroll } from "../components/ui/hooks";

const CommandPalette = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useContext(ThemeContext);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  const commands = useMemo(
    () => [
      { key: "dashboard", label: "Go to Dashboard", icon: LayoutDashboard, action: () => navigate("/") },
      { key: "wizard", label: "Create New Video", icon: PlusCircle, action: () => navigate("/wizard") },
      { key: "courses", label: "View Courses", icon: BookOpen, action: () => navigate("/courses") },
      { key: "studio", label: "Open Studio", icon: Pencil, action: () => navigate("/studio") },
      { key: "render", label: "Render Progress", icon: PlayCircle, action: () => navigate("/render") },
      { key: "projects", label: "Go to Projects", icon: FolderKanban, action: () => navigate("/projects") },
      { key: "analytics", label: "Go to Analytics", icon: BarChart3, action: () => navigate("/analytics") },
      { key: "settings", label: "Go to Settings", icon: Settings, action: () => navigate("/settings") },
      {
        key: "theme",
        label: theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode",
        icon: Lightbulb,
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
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
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
    <div className="fixed inset-0 z-100 flex items-start justify-center px-4 pt-[15vh]">
      <div className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[2px]" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative z-10 w-full max-w-xl animate-scale-in overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
      >
        <div className="flex items-center gap-3 border-b border-border-light px-4">
          <Search className="size-4 shrink-0 text-text-tertiary" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Type a command or search..."
            className="h-12 w-full bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
          />
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-text-tertiary">No matching commands</p>
          ) : (
            filtered.map((command, index) => {
              const Icon = command.icon;
              return (
                <button
                  key={command.key}
                  type="button"
                  onClick={() => runCommand(command)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium transition-colors",
                    index === activeIndex ? "bg-surface-active text-text-primary" : "text-text-secondary"
                  )}
                >
                  <Icon className="size-4 shrink-0 text-accent" />
                  {command.label}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border-light px-4 py-2.5">
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
