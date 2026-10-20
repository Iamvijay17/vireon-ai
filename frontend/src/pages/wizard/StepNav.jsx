import { Check } from "lucide-react";
import { cn } from "../../components/ui/cn";

/**
 * The step list across the top of Create Video. A step can be revisited once
 * reached; later steps are not selectable until the earlier ones validate, so
 * the only way forward is through the form's own checks.
 */
export function StepNav({ steps, current, reached, onSelect }) {
  return (
    <ol className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1 [scrollbar-width:none]">
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        const enabled = i <= reached;
        return (
          <li key={step.key} className="min-w-0 flex-1">
            <button
              type="button"
              disabled={!enabled}
              onClick={() => onSelect(i)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors",
                enabled ? "cursor-pointer" : "cursor-not-allowed",
                active ? "bg-surface-active" : enabled ? "hover:bg-surface-hover" : "opacity-60"
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  done ? "bg-accent text-white" : active ? "border border-accent text-accent-fg" : "border border-border text-text-tertiary"
                )}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={cn("block truncate text-[13px] font-medium", active || done ? "text-text-primary" : "text-text-tertiary")}>
                  {step.title}
                </span>
                <span className="hidden truncate text-[11px] text-text-tertiary md:block">{step.description}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
