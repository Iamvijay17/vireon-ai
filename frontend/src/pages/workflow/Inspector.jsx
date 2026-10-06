import { X } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { STAGE_COLOR } from "./graph";
import { STATE_TEXT } from "./nodeDisplay";

/** Side panel with the details of the clicked pipeline step. */
export function Inspector({ node, state, onClose }) {
  return (
    <aside
      data-ctl
      className="absolute inset-y-3 right-3 z-10 flex w-[min(320px,calc(100%-24px))] animate-scale-in flex-col rounded-xl border border-border bg-surface shadow-lg"
    >
      <div className="flex items-start gap-2 border-b border-border-light p-4">
        <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: STAGE_COLOR[node.stage] }} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-text-primary">{node.title}</h3>
          <p className="text-xs text-text-tertiary">{node.tech}</p>
        </div>
        <Button variant="ghost" size="sm" iconOnly className="-mt-1 -mr-2" onClick={onClose} icon={<X className="size-4" />} aria-label="Close details" />
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-[13px]">
        {state && <Field label="This job">{STATE_TEXT[state]}</Field>}
        <Field label="What it does">{node.summary}</Field>
        <Field label="Produces">{node.outputs}</Field>
        {node.file && (
          <Field label="Source">
            <code className="rounded bg-surface-hover px-1.5 py-0.5 font-mono text-xs">{node.file}</code>
          </Field>
        )}
      </div>
    </aside>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold tracking-wide text-text-tertiary uppercase">{label}</p>
      <p className="leading-relaxed text-text-secondary">{children}</p>
    </div>
  );
}

