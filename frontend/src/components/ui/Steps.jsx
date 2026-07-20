import { Check, X } from "lucide-react";
import { cn } from "./cn";

/**
 * Horizontal step indicator.
 * items: [{ title, description? }]
 * current: index of the active step
 * status: status of the *current* step only ('process' | 'finish' | 'error')
 * onStepClick: optional (index) => void, for navigable wizards
 */
export const Steps = ({ items = [], current = 0, status = "process", onStepClick, className }) => (
  <div className={cn("flex w-full items-start", className)}>
    {items.map((item, i) => {
      const isDone = i < current || (i === current && status === "finish");
      const isError = i === current && status === "error";
      const isActive = i === current && !isDone && !isError;
      const clickable = typeof onStepClick === "function" && i <= current;

      return (
        <div key={item.title ?? i} className="flex flex-1 items-start last:flex-none">
          <div className="flex flex-col items-center">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick(i)}
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                clickable && "cursor-pointer",
                isError
                  ? "border-danger-500 bg-danger-500/10 text-danger-500"
                  : isDone
                  ? "border-accent bg-accent text-white"
                  : isActive
                  ? "border-accent bg-surface text-accent"
                  : "border-border bg-surface text-text-tertiary"
              )}
            >
              {isError ? <X className="size-4" /> : isDone ? <Check className="size-4" /> : i + 1}
            </button>
            <div className="mt-2 max-w-24 text-center">
              <p
                className={cn(
                  "text-xs font-medium",
                  isActive || isDone ? "text-text-primary" : "text-text-tertiary",
                  isError && "text-danger-500"
                )}
              >
                {item.title}
              </p>
              {item.description && (
                <p className="mt-0.5 text-[11px] text-text-tertiary">{item.description}</p>
              )}
            </div>
          </div>
          {i < items.length - 1 && (
            <div
              className={cn(
                "mt-4 h-0.5 flex-1 rounded-full transition-colors",
                i < current ? "bg-accent" : "bg-border"
              )}
            />
          )}
        </div>
      );
    })}
  </div>
);

export default Steps;
