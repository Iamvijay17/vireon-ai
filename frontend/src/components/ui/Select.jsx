import { useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "./cn";
import { useClickOutside, useEscapeKey } from "./hooks";

/**
 * Minimal custom single-select. `options` is [{ value, label, description? }].
 *
 * Follows the listbox pattern: the trigger announces itself as a popup,
 * the panel is a `listbox` of `option`s, and the keyboard works the way a
 * native <select> does (arrows move, Home/End jump, Enter/Space choose,
 * Escape closes) - the previous version could only be operated with a mouse.
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
  "aria-label": ariaLabel,
  id,
}) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const triggerRef = useRef(null);
  const ref = useClickOutside(() => setOpen(false), open);
  useEscapeKey(() => setOpen(false), open);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const openList = () => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const choose = (opt) => {
    onChange?.(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const move = (delta) => {
    if (options.length === 0) return;
    setActiveIndex((prev) => {
      const base = prev < 0 ? (delta > 0 ? -1 : options.length) : prev;
      return Math.min(options.length - 1, Math.max(0, base + delta));
    });
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (options[activeIndex]) choose(options[activeIndex]);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
    }
  };

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        aria-label={ariaLabel}
        aria-invalid={error || undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3",
          "text-left text-sm text-text-primary transition-colors outline-none hover:border-border-strong",
          "focus:border-accent focus:ring-2 focus:ring-accent/25",
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
          id={listId}
          role="listbox"
          className={cn(
            "absolute z-50 mt-1.5 max-h-64 w-full overflow-auto rounded-lg border border-border bg-surface-raised p-1",
            "animate-scale-in shadow-lg",
            panelClassName
          )}
        >
          {options.length === 0 && <div className="px-3 py-2 text-sm text-text-tertiary">No options</div>}
          {options.map((opt, i) => (
            <div
              key={opt.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={opt.value === value}
              onMouseEnter={() => setActiveIndex(i)}
              // mousedown keeps focus on the trigger so the click-outside
              // handler and the trigger's keyboard handling are undisturbed.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(opt)}
              ref={(el) => {
                if (el && i === activeIndex) el.scrollIntoView?.({ block: "nearest" });
              }}
              className={cn(
                "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                opt.value === value ? "text-accent-fg" : "text-text-secondary",
                i === activeIndex && "bg-surface-hover text-text-primary"
              )}
            >
              <span className="min-w-0 truncate">
                {opt.label}
                {opt.description && <span className="ml-1.5 text-xs text-text-tertiary">{opt.description}</span>}
              </span>
              {opt.value === value && <Check className="size-4 shrink-0" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Select;
