import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "./cn";
import { useClickOutside, useEscapeKey } from "./hooks";

/**
 * Minimal custom single-select. `options` is [{ value, label, description? }].
 */
export const Select = ({
  value,
  onChange,
  options = [],
  placeholder = "Select...",
  className,
  panelClassName,
  disabled = false,
  error = false,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false), open);
  useEscapeKey(() => setOpen(false), open);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3",
          "text-left text-sm text-text-primary transition-colors outline-none",
          "focus:border-accent focus:ring-4 focus:ring-accent/10",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-danger-500"
        )}
      >
        <span className={cn("truncate", !selected && "text-text-tertiary")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-text-tertiary transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 mt-1.5 max-h-64 w-full overflow-auto rounded-xl border border-border bg-surface p-1.5",
            "animate-scale-in shadow-lg shadow-black/5",
            panelClassName
          )}
        >
          {options.length === 0 && (
            <div className="px-3 py-2 text-sm text-text-tertiary">No options</div>
          )}
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange?.(opt.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                opt.value === value
                  ? "bg-accent-subtle text-accent"
                  : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              )}
            >
              <span className="min-w-0 truncate">
                {opt.label}
                {opt.description && (
                  <span className="ml-1.5 text-xs text-text-tertiary">{opt.description}</span>
                )}
              </span>
              {opt.value === value && <Check className="size-4 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default Select;
