import { Bar } from "react-chartjs-2";
import "../../lib/chartjsSetup";
import { resolveColor, cssVar } from "../../lib/chartjsSetup";
import { cn } from "../ui/cn";

const formatLabel = (label) =>
  (label || "Unknown").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// Draws each bar's value at its end - Chart.js has no built-in data-label
// support, so this is a small local plugin instead of pulling in
// chartjs-plugin-datalabels for one line of text per bar.
const barValuePlugin = {
  id: "barValue",
  afterDatasetsDraw(chart) {
    const { formatValue, color } = chart.config.options.plugins?.barValue || {};
    if (!formatValue) return;
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = "600 11.5px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    meta.data.forEach((bar, i) => {
      const value = chart.data.datasets[0].data[i];
      ctx.fillText(formatValue(value), bar.x + 6, bar.y);
    });
    ctx.restore();
  },
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

  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const total = sorted.reduce((sum, r) => sum + r.count, 0);
  const height = Math.max(sorted.length * 30, 48);

  const colors = sorted.map((_, i) => resolveColor(palette ? palette[i % palette.length] : color));
  const tickColor = cssVar("--color-text-secondary", "#555555");
  const labelColor = cssVar("--color-text-secondary", "#555555");
  const surfaceColor = cssVar("--color-surface", "#ffffff");
  const textPrimary = cssVar("--color-text-primary", "#111111");
  const textTertiary = cssVar("--color-text-tertiary", "#888888");

  const chartData = {
    labels: sorted.map((r) => r.label),
    datasets: [
      {
        data: sorted.map((r) => r.count),
        backgroundColor: colors,
        borderRadius: 5,
        barThickness: 12,
        maxBarThickness: 14,
      },
    ],
  };

  const options = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { right: 44 } },
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
          title: (items) => formatLabel(items[0].label),
          label: (ctx) => `${formatValue(ctx.raw)} · ${total ? Math.round((ctx.raw / total) * 100) : 0}%`,
        },
      },
      barValue: { formatValue, color: labelColor },
    },
    scales: {
      x: { display: false, grid: { display: false } },
      y: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: tickColor,
          font: { size: 11.5, weight: "500" },
          callback: (value, index) => formatLabel(sorted[index]?.label),
        },
      },
    },
  };

  return (
    <div className={className} style={{ height }}>
      <Bar data={chartData} options={options} plugins={[barValuePlugin]} />
    </div>
  );
};

export default RankedBarChart;
