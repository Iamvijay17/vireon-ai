import { useRef, useState } from "react";
import { cn } from "../ui/cn";

const CHART_HEIGHT = 240;
const CHART_WIDTH = 640;
const PAD = { top: 16, right: 12, bottom: 24, left: 32 };

const formatDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

// Smooths a set of points into a single cubic-bezier path so the line reads
// as a curve rather than sharp created/completed/failed zig-zags.
const smoothPath = (points) => {
  if (points.length < 2) return points.length === 1 ? `M ${points[0].x} ${points[0].y}` : "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
};

/**
 * Multi-series area/line chart over a date axis - single y-axis (count),
 * never dual-axis. Series colors are passed in by the caller so callers can
 * reuse the app's status-tone palette (created/completed/failed) instead of
 * a generic categorical scale. Legend doubles as a visibility toggle.
 */
export const TrendChart = ({ data = [], series = [], className }) => {
  const svgRef = useRef(null);
  const [hoverIndex, setHoverIndex] = useState(null);
  const [hidden, setHidden] = useState(() => new Set());

  const visibleSeries = series.filter((s) => !hidden.has(s.key));

  const innerW = CHART_WIDTH - PAD.left - PAD.right;
  const innerH = CHART_HEIGHT - PAD.top - PAD.bottom;
  const n = data.length;

  const maxVal = Math.max(1, ...data.flatMap((d) => visibleSeries.map((s) => d[s.key] || 0)));
  const niceMax = Math.ceil(maxVal / 5) * 5 || 5;

  const xAt = (i) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v) => PAD.top + innerH - (v / niceMax) * innerH;

  const pointsFor = (key) => data.map((d, i) => ({ x: xAt(i), y: yAt(d[key] || 0) }));

  const areaPath = (key) => {
    const pts = pointsFor(key);
    if (pts.length === 0) return "";
    return `${smoothPath(pts)} L ${pts[pts.length - 1].x} ${PAD.top + innerH} L ${pts[0].x} ${PAD.top + innerH} Z`;
  };

  const toggleSeries = (key) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < series.length - 1) next.add(key);
      return next;
    });
  };

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

  const totals = series.reduce((acc, s) => {
    acc[s.key] = data.reduce((sum, d) => sum + (d[s.key] || 0), 0);
    return acc;
  }, {});

  if (n === 0) {
    return <div className={cn("flex h-56 items-center justify-center text-sm text-text-tertiary", className)}>No activity in this range</div>;
  }

  return (
    <div className={className}>
      {series.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {series.map((s) => {
            const isHidden = hidden.has(s.key);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => toggleSeries(s.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  isHidden
                    ? "border-border bg-transparent text-text-tertiary opacity-60"
                    : "border-transparent bg-surface-hover text-text-secondary"
                )}
              >
                <span
                  className="size-2 rounded-full transition-colors"
                  style={{ backgroundColor: isHidden ? "var(--color-text-tertiary)" : s.color }}
                />
                {s.label}
                <span className="tabular-nums text-text-tertiary">{totals[s.key] ?? 0}</span>
              </button>
            );
          })}
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
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`trend-fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.18" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

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

          {gridLines.map((g) => (
            <text
              key={`y-${g}`}
              x={PAD.left - 8}
              y={PAD.top + innerH * g}
              fontSize={10}
              textAnchor="end"
              dominantBaseline="middle"
              fill="var(--color-text-tertiary)"
            >
              {Math.round(niceMax * (1 - g))}
            </text>
          ))}

          {visibleSeries.map((s) => (
            <path key={`area-${s.key}`} d={areaPath(s.key)} fill={`url(#trend-fill-${s.key})`} stroke="none" />
          ))}

          {visibleSeries.map((s) => (
            <path
              key={s.key}
              d={smoothPath(pointsFor(s.key))}
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
            visibleSeries.map((s) => (
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
            {visibleSeries.map((s) => (
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
