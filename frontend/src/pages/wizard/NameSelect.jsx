import { useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { cn } from "../../components/ui/cn";
import { useClickOutside, useEscapeKey } from "../../components/ui/hooks";
import { SUGGESTED_NAMES } from "./constants";

// Dropdown of sample names for the Host/Guest Name fields, with a "Add new
// name" row at the bottom for typing a custom one - a plain text input made
// picking a name from the Quick Pair feel disconnected from typing your own.
export const NameSelect = ({ value, onChange, placeholder = "Select or add a name", options = SUGGESTED_NAMES }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useClickOutside(() => setOpen(false), open);
  useEscapeKey(() => setOpen(false), open);

  const commitDraft = () => {
    const name = draft.trim();
    if (!name) return;
    onChange?.(name);
    setDraft("");
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3",
          "text-left text-sm text-text-primary transition-colors outline-none cursor-pointer",
          "focus:border-accent focus:ring-4 focus:ring-accent/10"
        )}
      >
        <span className={cn("truncate", !value && "text-text-tertiary")}>{value || placeholder}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-text-tertiary transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-border bg-surface p-1.5 shadow-lg shadow-black/5 animate-scale-in">
          <div className="max-h-48 overflow-auto">
            {options.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  onChange?.(name);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors cursor-pointer",
                  name === value
                    ? "bg-accent-subtle text-accent"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                )}
              >
                {name}
                {name === value && <Check className="size-4 shrink-0" />}
              </button>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-1.5 border-t border-border-light pt-1.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitDraft();
                }
              }}
              placeholder="Add new name"
              maxLength={80}
              className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-bg px-2.5 text-sm text-text-primary outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={commitDraft}
              disabled={!draft.trim()}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white transition-opacity cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
