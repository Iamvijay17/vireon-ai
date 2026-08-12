import { cn } from "../ui/cn";

const formatLabel = (label) =>
  (label || "Unknown").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Ranked horizontal bar list for a single categorical breakdown (type,
 * resolution, category, ...). Each row already carries its own text label,
 * so bars share one accent color rather than needing a multi-hue palette.
 */
export const BarList = ({ rows = [], color = "var(--color-accent-500)", emptyLabel = "No data yet", className }) => {
  if (rows.length === 0) {
    return <p className={cn("py-6 text-center text-sm text-text-tertiary", className)}>{emptyLabel}</p>;
  }

  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const max = Math.max(...sorted.map((r) => r.count), 1);
  const total = sorted.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className={cn("space-y-3", className)}>
      {sorted.map((row) => (
        <div key={row.label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium text-text-primary">{formatLabel(row.label)}</span>
            <span className="tabular-nums text-text-tertiary">
              {row.count} &middot; {total ? Math.round((row.count / total) * 100) : 0}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-active">
            <div
              className="h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${(row.count / max) * 100}%`, backgroundColor: color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default BarList;
