import { cn } from "../../components/ui/cn";

// Compact pill-style single choice: one control with every option visible.
// An option may carry an `icon`, or a `box` (classes for a little aspect-ratio
// glyph drawn as a bordered rectangle).
export const Segmented = ({ options, value, onChange, label, disabled = false, className }) => (
  <div
    role="group"
    aria-label={label}
    className={cn("grid gap-1 rounded-lg bg-surface-hover p-1", disabled && "opacity-50", className)}
    style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
  >
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        title={o.title}
        disabled={disabled}
        aria-pressed={value === o.value}
        onClick={() => onChange(o.value)}
        className={cn(
          "flex h-7 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
          value === o.value ? "bg-surface text-accent shadow-xs" : "text-text-secondary hover:text-text-primary"
        )}
      >
        {o.icon ?? (o.box ? <span className={cn("rounded-[2px] border-[1.5px] border-current", o.box)} /> : null)}
        {o.label}
      </button>
    ))}
  </div>
);

export default Segmented;
