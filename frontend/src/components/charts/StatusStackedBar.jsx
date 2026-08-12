import { classifyStatus, STATUS_TONE_HEX } from "../../lib/statusTone";

const formatLabel = (label) => (label || "Unknown").replace(/_/g, " ");

/**
 * Single stacked horizontal bar showing a status breakdown (e.g. jobs by
 * status, or one pipeline stage's Pending/Processing/Completed/Failed mix).
 * Segment colors reuse the same status-tone mapping as StatusTag so a given
 * status always reads as the same color across the whole app.
 */
export const StatusStackedBar = ({ label, rows = [], className }) => {
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-medium text-text-primary">{label}</span>
        <span className="tabular-nums text-text-tertiary">{total} total</span>
      </div>

      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-surface-active">
        {total === 0 ? (
          <div className="h-full w-full rounded-full bg-surface-active" />
        ) : (
          rows
            .filter((r) => r.count > 0)
            .map((r) => (
              <div
                key={r.label}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${(r.count / total) * 100}%`,
                  backgroundColor: STATUS_TONE_HEX[classifyStatus(r.label)],
                }}
                title={`${formatLabel(r.label)}: ${r.count}`}
              />
            ))
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {rows
          .filter((r) => r.count > 0)
          .map((r) => (
            <div key={r.label} className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: STATUS_TONE_HEX[classifyStatus(r.label)] }}
              />
              {formatLabel(r.label)}
              <span className="tabular-nums text-text-tertiary">{r.count}</span>
            </div>
          ))}
      </div>
    </div>
  );
};

export default StatusStackedBar;
