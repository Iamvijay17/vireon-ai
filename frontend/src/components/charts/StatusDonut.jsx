import { useMemo } from "react";
import { Doughnut } from "react-chartjs-2";
import "../../lib/chartjsSetup";
import { resolveColor, cssVar } from "../../lib/chartjsSetup";
import { classifyStatus, STATUS_TONE_HEX } from "../../lib/statusTone";
import { cn } from "../ui/cn";

const formatLabel = (label) => (label || "Unknown").replace(/_/g, " ");

// Draws the "N total" center label Chart.js doesn't provide natively for a
// doughnut - reads its text from the chart's own options so it stays in
// sync with whatever data this specific chart instance was given.
const centerTextPlugin = {
  id: "centerText",
  afterDraw(chart) {
    const { centerText } = chart.config.options.plugins || {};
    if (!centerText) return;
    const { ctx, chartArea } = chart;
    const cx = (chartArea.left + chartArea.right) / 2;
    const cy = (chartArea.top + chartArea.bottom) / 2;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = centerText.color;
    ctx.font = `700 20px ${centerText.font || "system-ui, sans-serif"}`;
    ctx.fillText(centerText.value, cx, cy - 8);
    ctx.fillStyle = centerText.subColor;
    ctx.font = `500 10px ${centerText.font || "system-ui, sans-serif"}`;
    ctx.fillText(centerText.label, cx, cy + 10);
    ctx.restore();
  },
};

/**
 * Donut chart for a status breakdown (jobs/courses by status), colored via
 * the shared status-tone palette so it always matches StatusTag elsewhere.
 * Center label shows the grand total.
 */
export const StatusDonut = ({ rows = [], emptyLabel = "No data yet", className }) => {
  const filtered = rows.filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
  const total = filtered.reduce((sum, r) => sum + r.count, 0);

  const surfaceColor = cssVar("--color-surface", "#ffffff");
  const textPrimary = cssVar("--color-text-primary", "#111111");
  const textTertiary = cssVar("--color-text-tertiary", "#888888");

  const colors = useMemo(
    () => filtered.map((r) => resolveColor(STATUS_TONE_HEX[classifyStatus(r.label)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, surfaceColor]
  );

  if (total === 0) {
    return <p className={cn("py-10 text-center text-sm text-text-tertiary", className)}>{emptyLabel}</p>;
  }

  const chartData = {
    labels: filtered.map((r) => formatLabel(r.label)),
    datasets: [
      {
        data: filtered.map((r) => r.count),
        backgroundColor: colors,
        borderColor: surfaceColor,
        borderWidth: 2,
        hoverOffset: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "72%",
    animation: { duration: 500 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: surfaceColor,
        titleColor: textPrimary,
        bodyColor: textTertiary,
        borderColor: cssVar("--color-border", "#e5e5e5"),
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (ctx) => `${ctx.raw} · ${Math.round((ctx.raw / total) * 100)}%`,
        },
      },
      centerText: {
        value: String(total),
        label: "total",
        color: textPrimary,
        subColor: textTertiary,
      },
    },
  };

  return (
    <div className={cn("flex flex-col items-center gap-3 sm:flex-row", className)}>
      <div className="relative size-24 shrink-0">
        <Doughnut data={chartData} options={options} plugins={[centerTextPlugin]} />
      </div>

      <div className="w-full flex-1 space-y-1.5">
        {filtered.map((row, i) => (
          <div key={row.label}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-1.5 font-medium text-text-secondary">
                <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: colors[i] }} />
                {formatLabel(row.label)}
              </span>
              <span className="shrink-0 tabular-nums text-text-tertiary">
                {row.count} &middot; {Math.round((row.count / total) * 100)}%
              </span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-active">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(row.count / total) * 100}%`, backgroundColor: colors[i] }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StatusDonut;
