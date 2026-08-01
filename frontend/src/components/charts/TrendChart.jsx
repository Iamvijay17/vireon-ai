import { useRef, useState } from "react";
import { cn } from "../ui/cn";

const CHART_HEIGHT = 220;
const CHART_WIDTH = 640;
const PAD = { top: 16, right: 12, bottom: 24, left: 12 };

const formatDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * Multi-series line chart over a date axis - single y-axis (count), never
 * dual-axis. Series colors are passed in by the caller so callers can reuse
 * the app's status-tone palette (created/completed/failed) instead of a
 * generic categorical scale.
 */
export const TrendChart = ({ data = [], series = [], className }) => {
  const svgRef = useRef(null);
  const [hoverIndex, setHoverIndex] = useState(null);

  const innerW = CHART_WIDTH - PAD.left - PAD.right;
  const innerH = CHART_HEIGHT - PAD.top - PAD.bottom;
  const n = data.length;

  const maxVal = Math.max(1, ...data.flatMap((d) => series.map((s) => d[s.key] || 0)));
  const niceMax = Math.ceil(maxVal / 5) * 5 || 5;

  const xAt = (i) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v) => PAD.top + innerH - (v / niceMax) * innerH;

  const linePath = (key) =>
    data.map((d, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(d[key] || 0)}`).join(" ");

  const handleMove = (e) => {
    if (!svgRef.current || n === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const idx = Math.round(fraction * (n - 1));
    setHoverIndex(idx);
  };

  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  const hovered = hoverIndex !== null ? data[hoverIndex] : null;

  // Show at most ~6 x-axis labels regardless of range length.
  const labelStep = Math.max(1, Math.ceil(n / 6));

  if (n === 0) {
    return <div className={cn("flex h-56 items-center justify-center text-sm text-text-tertiary", className)}>No activity in this range</div>;
  }

  return (
    <div className={className}>
      {series.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-4">
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </div>
          ))}
        </div>
      )}

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="w-full touch-none"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          {gridLines.map((g) => (
            <line
              key={g}
              x1={PAD.left}
              x2={CHART_WIDTH - PAD.right}
              y1={PAD.top + innerH * g}
              y2={PAD.top + innerH * g}
              stroke="var(--color-border-light)"
              strokeWidth={1}
            />
          ))}

          {series.map((s) => (
            <path
              key={s.key}
              d={linePath(s.key)}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {hoverIndex !== null && (
            <line
              x1={xAt(hoverIndex)}
              x2={xAt(hoverIndex)}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
          )}

          {hoverIndex !== null &&
            series.map((s) => (
              <circle
                key={s.key}
                cx={xAt(hoverIndex)}
                cy={yAt(data[hoverIndex][s.key] || 0)}
                r={3.5}
                fill={s.color}
                stroke="var(--color-surface)"
                strokeWidth={1.5}
              />
            ))}

          {data.map((d, i) =>
            i % labelStep === 0 ? (
              <text
                key={d.date}
                x={xAt(i)}
                y={CHART_HEIGHT - 6}
                fontSize={10}
                textAnchor="middle"
                fill="var(--color-text-tertiary)"
              >
                {formatDate(d.date)}
              </text>
            ) : null
          )}
        </svg>

        {hovered && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg shadow-black/5"
            style={{
              left: `${(xAt(hoverIndex) / CHART_WIDTH) * 100}%`,
              transform: `translateX(${hoverIndex < n / 2 ? "8px" : "calc(-100% - 8px)"})`,
            }}
          >
            <p className="mb-1 font-medium text-text-primary">{formatDate(hovered.date)}</p>
            {series.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-3 py-0.5">
                <span className="flex items-center gap-1.5 text-text-secondary">
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.label}
                </span>
                <span className="font-medium tabular-nums text-text-primary">{hovered[s.key] || 0}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrendChart;
