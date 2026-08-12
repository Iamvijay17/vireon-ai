import { cn } from "./cn";

const STATUS_CLS = {
  active: "bg-accent",
  success: "bg-success-500",
  error: "bg-danger-500",
  normal: "bg-accent",
};

export const Progress = ({ percent = 0, status = "normal", showLabel = true, className, size = "md" }) => {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn(
          "flex-1 overflow-hidden rounded-full bg-surface-active",
          size === "sm" ? "h-1.5" : "h-2"
        )}
      >
        <div
          className={cn("h-full rounded-full transition-all duration-300 ease-out", STATUS_CLS[status])}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-text-secondary">
          {Math.round(clamped)}%
        </span>
      )}
    </div>
  );
};

export default Progress;
