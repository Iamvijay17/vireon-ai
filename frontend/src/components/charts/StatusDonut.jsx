import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { classifyStatus, STATUS_TONE_HEX } from "../../lib/statusTone";
import { cn } from "../ui/cn";

const formatLabel = (label) => (label || "Unknown").replace(/_/g, " ");

const DonutTooltip = ({ active, payload, total }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg shadow-black/5">
      <p className="flex items-center gap-1.5 font-medium text-text-primary">
        <span className="size-1.5 rounded-full" style={{ backgroundColor: row.fill }} />
        {formatLabel(row.label)}
      </p>
      <p className="mt-0.5 tabular-nums text-text-tertiary">
        {row.count} &middot; {total ? Math.round((row.count / total) * 100) : 0}%
      </p>
    </div>
  );
};

/**
 * Donut chart for a status breakdown (jobs/courses by status), colored via
 * the shared status-tone palette so it always matches StatusTag elsewhere.
 * Center label shows the grand total.
 */
export const StatusDonut = ({ rows = [], emptyLabel = "No data yet", className }) => {
  const filtered = rows.filter((r) => r.count > 0);
  const total = filtered.reduce((sum, r) => sum + r.count, 0);

  if (total === 0) {
    return <p className={cn("py-10 text-center text-sm text-text-tertiary", className)}>{emptyLabel}</p>;
  }

  const data = filtered.map((r) => ({
    ...r,
    fill: STATUS_TONE_HEX[classifyStatus(r.label)],
  }));

  return (
    <div className={cn("flex flex-col items-center gap-4 sm:flex-row", className)}>
      <div className="relative size-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="label"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={2}
              stroke="var(--color-surface)"
              strokeWidth={2}
              isAnimationActive
              animationDuration={500}
            >
              {data.map((row) => (
                <Cell key={row.label} fill={row.fill} />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip total={total} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold tabular-nums text-text-primary">{total}</span>
          <span className="text-[10px] text-text-tertiary">total</span>
        </div>
      </div>

      <div className="flex-1 space-y-1.5">
        {data
          .sort((a, b) => b.count - a.count)
          .map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-text-secondary">
                <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: row.fill }} />
                {formatLabel(row.label)}
              </span>
              <span className="shrink-0 tabular-nums text-text-tertiary">
                {row.count} &middot; {Math.round((row.count / total) * 100)}%
              </span>
            </div>
          ))}
      </div>
    </div>
  );
};

export default StatusDonut;
