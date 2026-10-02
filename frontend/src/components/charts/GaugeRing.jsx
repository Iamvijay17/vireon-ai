import { Doughnut } from "react-chartjs-2";
import "../../lib/chartjsSetup";
import { resolveColor, cssVar } from "../../lib/chartjsSetup";
import { cn } from "../ui/cn";

/**
 * Circular progress ring for a single rate/target metric (cache hit rate,
 * completion rate, ...) - the "how am I tracking against 100%" gauge you'd
 * see on a KPI dashboard. Two-segment doughnut (value + remainder) with the
 * percentage drawn in the center via a small DOM overlay (simpler and
 * theme-safer than a canvas text plugin for this one static label).
 */
export const GaugeRing = ({ value, color = "var(--color-accent-500)", size = 128, label, className }) => {
  const pct = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, value));
  const trackColor = cssVar("--color-surface-active", "#f1f1f1");

  const chartData = {
    datasets: [
      {
        data: [pct, 100 - pct],
        backgroundColor: [resolveColor(color), trackColor],
        borderWidth: 0,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "76%",
    animation: { duration: 600 },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
    },
  };

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <Doughnut data={chartData} options={options} />
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
