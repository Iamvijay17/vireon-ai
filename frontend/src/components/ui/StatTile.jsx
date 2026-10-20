import { cn } from "./cn";
import { Skeleton } from "./Skeleton";

const TONES = {
  neutral: "text-text-tertiary",
  accent: "text-accent-fg",
  success: "text-success-600 dark:text-success-500",
  warning: "text-warning-600 dark:text-warning-500",
  danger: "text-danger-600 dark:text-danger-500",
};

/**
 * One headline number with its label. value null/undefined shows an em dash
 * ("no data"), never 0 - the same rule the analytics pages follow. onClick
 * turns the tile into a button (e.g. "Failed" -> the failed jobs).
 */
export const StatTile = ({ label, value, hint, icon: Icon, tone = "neutral", loading = false, onClick, className }) => {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-xl border border-border bg-surface p-3.5 text-left",
        onClick && "hover-lift cursor-pointer",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-text-tertiary">{label}</span>
        {Icon && <Icon className={cn("size-4", TONES[tone])} />}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-16" />
      ) : (
        <p className="tabular mt-1.5 text-2xl font-semibold tracking-tight text-text-primary">{value ?? "—"}</p>
      )}
      {hint && <p className="mt-0.5 truncate text-[11px] text-text-tertiary">{hint}</p>}
    </Wrapper>
  );
};

export default StatTile;
