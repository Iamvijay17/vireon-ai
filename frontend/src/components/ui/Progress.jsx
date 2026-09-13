import { useEffect, useRef, useState } from "react";
import { cn } from "./cn";

const STATUS_CLS = {
  active: "bg-accent",
  success: "bg-success-500",
  error: "bg-danger-500",
  normal: "bg-accent",
};

/**
 * The backend reports progress at fixed checkpoints (see JOB_STEPS) plus
 * finer per-scene/per-frame updates during the longer steps - but some
 * stages (script generation, image generation) still only ever report a
 * single jump. `trickle` creeps the displayed value up a few points past
 * whatever the last real update was so the bar keeps moving instead of
 * sitting dead between checkpoints; it never overtakes the next real
 * value, and any actual increase snaps forward immediately. Off by
 * default - only pass `trickle` where `percent` represents a job that is
 * actually still running right now (not a static ratio, and not a
 * finished/failed/cancelled job whose progress just never reached 100).
 */
export const Progress = ({ percent = 0, status = "normal", showLabel = true, className, size = "md", trickle = false }) => {
  const target = Math.min(100, Math.max(0, percent));
  const [display, setDisplay] = useState(target);
  const ceilingRef = useRef(target + 4);

  useEffect(() => {
    setDisplay((prev) => {
      if (target > prev) ceilingRef.current = Math.min(99, target + 4);
      return target > prev ? target : prev;
    });
  }, [target]);

  useEffect(() => {
    if (!trickle || target >= 100) return undefined;
    const id = setInterval(() => {
      setDisplay((prev) => Math.min(ceilingRef.current, prev + 0.3));
    }, 400);
    return () => clearInterval(id);
  }, [trickle, target]);

  const clamped = display;
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
