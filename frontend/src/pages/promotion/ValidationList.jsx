import { CircleAlert, TriangleAlert, CircleCheck } from "lucide-react";
import { cn } from "../../components/ui/cn";
import { PlatformTile } from "./shared";
import { FORMAT_LABEL } from "./format";

/**
 * Per-destination readiness: what blocks posting (red) and what is merely worth knowing (amber).
 * Messages are the server's own - the same rules that run again right before the post is sent.
 */
export const ValidationList = ({ results = [], schedule = [], checking, onSkip }) => {
  if (!results.length) return <p className="text-sm text-text-tertiary">Choose at least one account to check the post.</p>;
  return (
    <ul className="space-y-3" aria-live="polite" aria-busy={checking}>
      {results.map((r) => {
        const issues = [...(r.errors || []), ...(r.warnings || [])];
        return (
          <li key={r.accountId} className="rounded-xl border border-border-light p-3">
            <div className="flex flex-wrap items-center gap-2">
              {r.platform && <PlatformTile platform={r.platform} size="sm" />}
              <span className="text-[13px] font-semibold text-text-primary">{r.accountLabel || r.accountId}</span>
              {r.format && <span className="text-xs text-text-tertiary">{FORMAT_LABEL[r.format] || r.format}</span>}
              <span className={cn("ml-auto inline-flex items-center gap-1 text-xs font-medium", r.ok ? "text-success-600" : "text-danger-500")}>
                {r.ok ? <CircleCheck className="size-3.5" /> : <CircleAlert className="size-3.5" />}
                {r.ok ? "Ready" : "Needs changes"}
              </span>
              {!r.ok && onSkip && (
                <button type="button" onClick={() => onSkip(r.accountId)} className="cursor-pointer text-xs font-medium text-accent hover:underline">Skip this account</button>
              )}
            </div>
            {issues.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {issues.map((i, idx) => (
                  <li key={`${i.code}-${idx}`} className="flex items-start gap-2 text-[13px]">
                    {i.level === "error" ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger-500" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-600" />}
                    <span className="text-text-secondary">{i.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
      {schedule.map((i) => (
        <li key={i.code} className="flex items-start gap-2 text-[13px]"><CircleAlert className="mt-0.5 size-4 shrink-0 text-danger-500" /><span className="text-text-secondary">{i.message}</span></li>
      ))}
    </ul>
  );
};

export default ValidationList;
