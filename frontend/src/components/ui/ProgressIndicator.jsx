import { cn } from "./cn";
import { Progress } from "./Progress";

/**
 * A progress bar with its label and status, for places that need to say what
 * is progressing. percent null/undefined means "working, amount unknown":
 * an indeterminate bar, never a made-up number.
 */
export const ProgressIndicator = ({ label, detail, percent, status = "normal", trickle = false, className }) => {
  const known = Number.isFinite(percent);
  return (
    <div className={cn("space-y-1.5", className)}>
      {(label || detail) && (
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="min-w-0 truncate font-medium text-text-secondary">{label}</span>
          {detail && <span className="shrink-0 text-text-tertiary">{detail}</span>}
        </div>
      )}
      {known ? (
        <Progress percent={percent} status={status} size="sm" trickle={trickle} />
      ) : (
        <div
          role="progressbar"
          aria-label={typeof label === "string" ? label : "In progress"}
          className="h-1.5 overflow-hidden rounded-full bg-surface-active"
        >
          <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
        </div>
      )}
    </div>
  );
};

export default ProgressIndicator;
