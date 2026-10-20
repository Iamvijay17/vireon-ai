import { Card } from "../../components/ui/Card";
import { buildSummary } from "./summary";
import { Readiness } from "./ReviewStep";

/** The always-visible "what you have chosen so far" column (wide screens). */
export function SummaryPanel({ values, voiceOptions, readiness, currentStep, onEdit }) {
  const groups = buildSummary(values, voiceOptions);

  return (
    <aside aria-label="Summary" className="hidden lg:block">
      <div className="sticky top-20 space-y-4">
        <Card className="p-4">
          <h2 className="mb-1 text-sm font-semibold text-text-primary">Summary</h2>
          {groups.map((group) => (
            <div key={group.key} className="border-t border-border-light py-3 first:border-t-0 first:pt-2">
              <button
                type="button"
                onClick={() => onEdit(group.step)}
                className="mb-1.5 flex w-full cursor-pointer items-center justify-between text-left"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">{group.title}</span>
                {currentStep === group.step && <span className="text-[11px] text-accent-fg">Editing</span>}
              </button>
              <dl className="space-y-1">
                {group.rows.map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0 text-xs text-text-tertiary">{row.label}</dt>
                    <dd className="min-w-0 truncate text-right text-xs text-text-secondary" title={typeof row.value === "string" ? row.value : undefined}>
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </Card>
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold text-text-primary">System</h2>
          <Readiness readiness={readiness} compact />
        </Card>
      </div>
    </aside>
  );
}
