import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import "../../lib/chartjsSetup";
import { resolveColor, cssVar, withAlpha } from "../../lib/chartjsSetup";
import { cn } from "../ui/cn";

const formatDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * Multi-series area/line chart over a date axis - single y-axis (count).
 * Series colors are passed in by the caller so callers can reuse the app's
 * status-tone palette (created/completed/failed) instead of a generic
 * categorical scale. Built on Chart.js for native gradient fills, a
 * combined hover tooltip across all series, and a clickable legend that
 * toggles series visibility for free.
 */
export const TrendChart = ({ data = [], series = [], className }) => {
  const gridColor = cssVar("--color-border-light", "#e5e5e5");
  const tickColor = cssVar("--color-text-tertiary", "#888888");
  const surfaceColor = cssVar("--color-surface", "#ffffff");
  const textPrimary = cssVar("--color-text-primary", "#111111");

  const chartData = useMemo(
    () => ({
      labels: data.map((d) => formatDate(d.date)),
      datasets: series.map((s) => {
        const color = resolveColor(s.color);
        return {
          label: s.label,
          data: data.map((d) => d[s.key] || 0),
          borderColor: color,
          backgroundColor: (ctx) => {
            const { chart } = ctx;
            const { ctx: canvasCtx, chartArea } = chart;
            if (!chartArea) return withAlpha(color, 0.15);
            const gradient = canvasCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, withAlpha(color, 0.22));
            gradient.addColorStop(1, withAlpha(color, 0));
            return gradient;
          },
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: color,
          pointHoverBorderColor: surfaceColor,
          pointHoverBorderWidth: 2,
        };
      }),
    }),
    [data, series, surfaceColor]
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "top",
          align: "start",
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 7,
            boxHeight: 7,
            padding: 14,
            color: cssVar("--color-text-secondary", "#555555"),
            font: { size: 12, weight: "500" },
          },
        },
        tooltip: {
          backgroundColor: surfaceColor,
          titleColor: textPrimary,
          bodyColor: tickColor,
          borderColor: gridColor,
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          boxPadding: 4,
          usePointStyle: true,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: tickColor, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 },
          border: { display: false },
        },
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: { color: tickColor, font: { size: 10 }, precision: 0 },
          border: { display: false },
        },
      },
    }),
    [gridColor, tickColor, surfaceColor, textPrimary]
  );

  if (data.length === 0) {
    return <div className={cn("flex h-56 items-center justify-center text-sm text-text-tertiary", className)}>No activity in this range</div>;
  }

  return (
    <div className={cn("h-56 w-full", className)}>
      <Line data={chartData} options={options} />
    </div>
  );
};

export default TrendChart;
