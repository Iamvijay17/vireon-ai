import { cn } from "./cn";

/**
 * A measured quantity against its capacity (VRAM, RAM, CPU). value null
 * renders "Unavailable" - a metric that could not be read is never drawn as 0.
 * Colour follows load, so a nearly-full resource reads as a warning without
 * any extra chrome.
 */
export const Meter = ({ label, value, max = 100, display, caption, warnAt = 75, dangerAt = 90, className }) => {
  const known = Number.isFinite(value) && Number.isFinite(max) && max > 0;
  const pct = known ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const tone = pct >= dangerAt ? "bg-danger-500" : pct >= warnAt ? "bg-warning-500" : "bg-accent";

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-text-secondary">{label}</span>
        <span className={cn("tabular text-sm font-semibold", known ? "text-text-primary" : "text-text-tertiary")}>
          {known ? display ?? `${Math.round(pct)}%` : "Unavailable"}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={known ? max : undefined}
        aria-valuenow={known ? value : undefined}
        aria-valuetext={known ? undefined : "Unavailable"}
        className="h-1.5 overflow-hidden rounded-full bg-surface-active"
      >
        {known && <div className={cn("h-full rounded-full transition-[width] duration-500", tone)} style={{ width: `${pct}%` }} />}
      </div>
      {caption && <p className="text-[11px] text-text-tertiary">{caption}</p>}
    </div>
  );
};

export default Meter;
