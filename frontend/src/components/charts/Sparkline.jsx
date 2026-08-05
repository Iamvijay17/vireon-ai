import { cn } from "../ui/cn";

const WIDTH = 120;
const HEIGHT = 32;
const PAD = 3;

/**
 * Minimal inline trend line for a stat card - no axes, no labels, just shape.
 * Renders a soft area fill under the line so it reads at a glance even at
 * this size. `values` is a plain array of numbers (already ordered by time).
 */
export const Sparkline = ({ values = [], color = "var(--color-accent-500)", className }) => {
  const n = values.length;
  if (n < 2) return <div className={cn("h-8", className)} />;

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const innerW = WIDTH - PAD * 2;
  const innerH = HEIGHT - PAD * 2;

  const xAt = (i) => PAD + (i / (n - 1)) * innerW;
  const yAt = (v) => PAD + innerH - ((v - min) / range) * innerH;

  const linePath = values.map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(v)}`).join(" ");
  const areaPath = `${linePath} L ${xAt(n - 1)} ${HEIGHT} L ${xAt(0)} ${HEIGHT} Z`;
  const gradientId = `spark-${color.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={cn("h-8 w-full", className)} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xAt(n - 1)} cy={yAt(values[n - 1])} r={2.25} fill={color} />
    </svg>
  );
};

export default Sparkline;
