import { useRef } from "react";
import { cn } from "./cn";

/**
 * A single-choice pill group (status filters, view modes). `options` is
 * [{ value, label, count?, icon?, title? }]. Rendered as a radiogroup with
 * roving arrow-key navigation, so it is one tab stop, like a native radio set.
 */
export const SegmentedControl = ({ value, onChange, options = [], "aria-label": ariaLabel, size = "md", className }) => {
  const refs = useRef([]);

  const onKeyDown = (e, index) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    refs.current[next]?.focus();
    onChange?.(options[next].value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-surface p-0.5 [scrollbar-width:none]",
        className
      )}
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            title={opt.title}
            onClick={() => onChange?.(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
              active ? "bg-surface-active text-text-primary" : "text-text-tertiary hover:text-text-secondary"
            )}
          >
            {opt.icon}
            {opt.label}
            {opt.count !== undefined && (
              <span className={cn("tabular text-[11px]", active ? "text-text-secondary" : "text-text-tertiary")}>
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default SegmentedControl;
