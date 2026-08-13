import { useCallback, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "../ui/cn";

const ROLES = [
  { key: "title", label: "Title", dot: "bg-accent border-accent" },
  { key: "subtitle", label: "Subtitle", dot: "bg-purple-500 border-purple-500" },
];

const clamp01 = (n) => Math.min(1, Math.max(0, n));

// Mirrors the 1920x1080 frame at a fixed 16:9 aspect ratio. Dragging a marker
// writes a normalized {xPct, yPct} (0-1) into `elements.styleConfig.<role>.position`,
// which `positionStyle()` (backend/remotion/src/theme.js) turns into absolute
// CSS at render time - see the Studio "Template Style" panel for how this
// wires into `handleElementFieldChange`.
export function TextPositionPad({ positions, hasSubtitle = true, onChange, onReset, disabled = false }) {
  const padRef = useRef(null);
  const [activeRole, setActiveRole] = useState("title");
  const [dragging, setDragging] = useState(false);

  const roles = hasSubtitle ? ROLES : ROLES.filter((r) => r.key === "title");

  const posFromEvent = useCallback((e) => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      xPct: clamp01((e.clientX - rect.left) / rect.width),
      yPct: clamp01((e.clientY - rect.top) / rect.height),
    };
  }, []);

  const handlePointerDown = (e) => {
    if (disabled) return;
    e.preventDefault();
    const pos = posFromEvent(e);
    if (pos) onChange?.(activeRole, pos);
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!dragging || disabled) return;
    const pos = posFromEvent(e);
    if (pos) onChange?.(activeRole, pos);
  };

  const handlePointerUp = (e) => {
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        {roles.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setActiveRole(r.key)}
            disabled={disabled}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
              activeRole === r.key
                ? "border-accent bg-accent-subtle text-accent"
                : "border-border-light text-text-tertiary hover:text-text-primary",
              disabled && "cursor-not-allowed opacity-50"
            )}
          >
            <span className={cn("size-2 shrink-0 rounded-full border-2", r.dot)} />
            {r.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onReset?.(activeRole)}
          disabled={disabled || !positions?.[activeRole]}
          title="Reset to template default"
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-text-tertiary hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
        >
          <RotateCcw className="size-3" />
          Reset
        </button>
      </div>

      <div
        ref={padRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={cn(
          "relative aspect-video w-full touch-none rounded-md border border-border-light bg-black/90",
          disabled ? "cursor-not-allowed" : "cursor-crosshair"
        )}
      >
        {/* center guides */}
        <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/10" />
        <div className="pointer-events-none absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/10" />

        {roles.map((r) => {
          const pos = positions?.[r.key] ?? { xPct: 0.5, yPct: r.key === "title" ? 0.42 : 0.58 };
          const isSet = !!positions?.[r.key];
          return (
            <div
              key={r.key}
              className={cn(
                "pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow",
                r.dot,
                !isSet && "opacity-40",
                r.key === activeRole && "ring-2 ring-white/60"
              )}
              style={{ left: `${pos.xPct * 100}%`, top: `${pos.yPct * 100}%` }}
            />
          );
        })}
      </div>
      <p className="text-[10px] text-text-tertiary">
        Drag on the frame to place the {activeRole === "title" ? "title" : "subtitle"}. Faded dot = using the template's default layout.
      </p>
    </div>
  );
}

export default TextPositionPad;
