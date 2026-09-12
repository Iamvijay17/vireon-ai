import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, LabelList, ResponsiveContainer } from "recharts";
import { cn } from "../ui/cn";

const formatLabel = (label) =>
  (label || "Unknown").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const BarTooltip = ({ active, payload, total, formatValue }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg shadow-black/5">
      <p className="font-medium text-text-primary">{formatLabel(row.label)}</p>
      <p className="mt-0.5 tabular-nums text-text-tertiary">
        {formatValue(row.count)} &middot; {total ? Math.round((row.count / total) * 100) : 0}%
      </p>
    </div>
  );
};

/**
 * Horizontal ranked bar chart for a single categorical breakdown (type,
 * resolution, category, template, storage bytes, ...). Rows are sorted desc
 * and the row height grows with the dataset so labels never collide.
 * `formatValue` controls how the raw `count` renders in the tooltip/label
 * (e.g. byte formatting for storage) - defaults to the plain number.
 */
export const RankedBarChart = ({
  rows = [],
  color = "var(--color-accent-500)",
  emptyLabel = "No data yet",
  formatValue = (v) => v,
  className,
}) => {
  if (rows.length === 0) {
    return <p className={cn("py-6 text-center text-sm text-text-tertiary", className)}>{emptyLabel}</p>;
  }

  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const total = sorted.reduce((sum, r) => sum + r.count, 0);
  const height = Math.max(sorted.length * 34, 60);

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 0, right: 36, bottom: 0, left: 0 }}
          barCategoryGap={10}
        >
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis
            type="category"
            dataKey="label"
            tickFormatter={formatLabel}
            width={110}
            tick={{ fill: "var(--color-text-secondary)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip cursor={{ fill: "var(--color-surface-hover)" }} content={<BarTooltip total={total} formatValue={formatValue} />} />
          <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={16} isAnimationActive animationDuration={400}>
            {sorted.map((row) => (
              <Cell key={row.label} fill={color} />
            ))}
            <LabelList
              dataKey="count"
              position="right"
              formatter={formatValue}
              className="tabular-nums"
              style={{ fill: "var(--color-text-tertiary)", fontSize: 11 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default RankedBarChart;
