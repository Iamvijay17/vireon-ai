import { ChevronDown, Check, Lock, Inbox } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { Spinner } from "../../../components/ui/Spinner";
import { STEP_CIRCLE_CLASSES } from "./constants";

export const InlineEmpty = ({ description, children }) => (
  <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
    <div className="flex size-11 items-center justify-center rounded-2xl bg-surface-hover text-text-tertiary">
      <Inbox className="size-5" />
    </div>
    <p className="max-w-xs text-sm text-text-tertiary">{description}</p>
    {children}
  </div>
);

export const InlineSpinner = ({ label }) => (
  <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
    <Spinner size="lg" />
    <p className="text-sm text-text-secondary">{label}</p>
  </div>
);

/**
 * Collapsible card for one pipeline step (Script/Audio/Render). Completed or
 * locked steps default to a compact summary row; the current step opens
 * automatically. Clicking the header toggles it, overriding the default.
 */
export const StepSection = ({ number, title, state, badges, summary, actions, isOpen, onToggle, children }) => (
  <Card>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light px-5 py-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <ChevronDown className={`size-4 shrink-0 text-text-tertiary transition-transform ${isOpen ? "" : "-rotate-90"}`} />
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold ${STEP_CIRCLE_CLASSES[state]}`}>
          {state === "done" ? <Check className="size-4" /> : state === "locked" ? <Lock className="size-3.5" /> : number}
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-text-primary">{title}</h3>
            {badges}
          </span>
          {!isOpen && summary && <p className="mt-0.5 truncate text-xs text-text-tertiary">{summary}</p>}
        </span>
      </button>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
    {isOpen && <div className="p-5">{children}</div>}
  </Card>
);
