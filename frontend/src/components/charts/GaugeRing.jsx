import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { cn } from "../ui/cn";

/**
 * Circular progress ring for a single rate/target metric (cache hit rate,
 * completion rate, ...) - the "how am I tracking against 100%" gauge you'd
 * see on a KPI dashboard. Built on the same Pie primitive as StatusDonut
 * (two segments: value + remainder) rather than hand-rolled arc math, so it
 * inherits the same theme-safe rendering.
 */
export const GaugeRing = ({ value, color = "var(--color-accent-500)", size = 128, label, className }) => {
  const pct = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, value));
  const data = [{ v: pct }, { v: 100 - pct }];

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="v"
            startAngle={90}
            endAngle={-270}
            innerRadius="74%"
            outerRadius="100%"
            stroke="none"
            cornerRadius={8}
            isAnimationActive
            animationDuration={600}
          >
            <Cell fill={color} />
            <Cell fill="var(--color-surface-active)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold tabular-nums text-text-primary">
          {value === null || value === undefined ? "—" : `${Math.round(pct)}%`}
        </span>
        {label && <span className="mt-0.5 max-w-[80%] text-center text-[10px] leading-tight text-text-tertiary">{label}</span>}
      </div>
    </div>
  );
};

export default GaugeRing;
