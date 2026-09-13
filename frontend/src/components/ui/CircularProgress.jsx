import { useEffect, useRef, useState } from "react";

/**
 * See Progress.jsx's `trickle` comment - same reasoning applies here, this
 * is the ring used on the single-job detail view. Off by default.
 */
export const CircularProgress = ({ percent = 0, size = 120, stroke = 8, error = false, label, trickle = false }) => {
  const target = Math.min(100, Math.max(0, percent));
  const [display, setDisplay] = useState(target);
  const ceilingRef = useRef(target + 4);

  useEffect(() => {
    setDisplay((prev) => {
      if (target > prev) ceilingRef.current = Math.min(99, target + 4);
      return target > prev ? target : prev;
    });
  }, [target]);

  useEffect(() => {
    if (!trickle || error || target >= 100) return undefined;
    const id = setInterval(() => {
      setDisplay((prev) => Math.min(ceilingRef.current, prev + 0.3));
    }, 400);
    return () => clearInterval(id);
  }, [trickle, error, target]);

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (display / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} className="fill-none stroke-surface-active" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeLinecap="round"
          className={`fill-none transition-all duration-500 ${error ? "stroke-danger-500" : "stroke-accent"}`}
          style={{ strokeDasharray: circumference, strokeDashoffset: offset }}
        />
      </svg>
      <span className="absolute text-lg font-semibold text-text-primary">{label ?? `${Math.round(display)}%`}</span>
    </div>
  );
};

export default CircularProgress;
