import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, LabelList, ResponsiveContainer } from "recharts";
import { cn } from "../ui/cn";

const formatLabel = (label) =>
  (label || "Unknown").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const BarTooltip = ({ active, payload, total, formatValue }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg shadow-black/5">
      <p className="flex items-center gap-1.5 font-medium text-text-primary">
        <span className="size-1.5 rounded-full" style={{ backgroundColor: row.fill }} />
        {formatLabel(row.label)}
      </p>
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
 * Pass `palette` (an array of colors, cycled per row) for a categorical look
 * when rows don't already carry semantic meaning of their own; a single
 * `color` is used otherwise.
 */
export const RankedBarChart = ({
  rows = [],
  color = "var(--color-accent-500)",
  palette,
  emptyLabel = "No data yet",
  formatValue = (v) => v,
  className,
}) => {
  if (rows.length === 0) {
    return <p className={cn("py-10 text-center text-sm text-text-tertiary", className)}>{emptyLabel}</p>;
  }

  const sorted = [...rows].sort((a, b) => b.count - a.count).map((row, i) => ({
    ...row,
    fill: palette ? palette[i % palette.length] : color,
  }));
  const total = sorted.reduce((sum, r) => sum + r.count, 0);
  const height = Math.max(sorted.length * 30, 56);

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 2, right: 40, bottom: 2, left: 2 }}
          barCategoryGap={8}
        >
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis
            type="category"
            dataKey="label"
            tickFormatter={formatLabel}
            width={104}
            tick={{ fill: "var(--color-text-secondary)", fontSize: 12, fontWeight: 500 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip cursor={{ fill: "var(--color-surface-hover)" }} content={<BarTooltip total={total} formatValue={formatValue} />} />
          <Bar dataKey="count" radius={[6, 6, 6, 6]} maxBarSize={14} isAnimationActive animationDuration={500} background={{ fill: "var(--color-surface-active)", radius: 6 }}>
            {sorted.map((row) => (
              <Cell key={row.label} fill={row.fill} />
            ))}
            <LabelList
              dataKey="count"
              position="right"
              formatter={formatValue}
              className="tabular-nums"
              style={{ fill: "var(--color-text-secondary)", fontSize: 12, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default RankedBarChart;
