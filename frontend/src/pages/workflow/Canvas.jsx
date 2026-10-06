import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Plus, Minus, Maximize2 } from "lucide-react";
import { cn } from "../../components/ui/cn";
import {
  NODES, EDGES, NODE_W, NODE_H, BOUNDS, NODE_BY_ID, STATE, STATE_COLOR, STAGE_COLOR, SKIPPED,
  edgePath, portOf,
} from "./graph";
import { ICONS, STATE_ICON, STATE_TEXT } from "./nodeDisplay";

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.6;
const FIT_PADDING = 56;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * The pan/zoom node canvas: every pipeline step as a card, wired by edges,
 * coloured by the selected job's state for each step.
 */
export function Canvas({ states, selectedId, onSelect }) {
  const ref = useRef(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef(null);
  const [panning, setPanning] = useState(false);
  // Until the user pans or zooms, keep the graph fitted as the pane resizes.
  const touched = useRef(false);

  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const k = clamp(
      Math.min((width - FIT_PADDING * 2) / BOUNDS.w, (height - FIT_PADDING * 2) / BOUNDS.h),
      MIN_ZOOM,
      1
    );
    setView({ k, x: (width - BOUNDS.w * k) / 2, y: (height - BOUNDS.h * k) / 2 });
  }, []);

  useLayoutEffect(() => {
    fit();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => {
      if (!touched.current) fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  const zoomAt = useCallback((factor, cx, cy) => {
    touched.current = true;
    setView((v) => {
      const k = clamp(v.k * factor, MIN_ZOOM, MAX_ZOOM);
      const ratio = k / v.k;
      // Keep the point under the cursor fixed while scaling.
      return { k, x: cx - (cx - v.x) * ratio, y: cy - (cy - v.y) * ratio };
    });
  }, []);

  // Wheel must be a non-passive native listener to stop the page scrolling.
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onPointerDown = (e) => {
    if (e.button !== 0 || e.target.closest("[data-node]") || e.target.closest("[data-ctl]")) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    setPanning(true);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) {
      d.moved = true;
      touched.current = true;
    }
    setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setPanning(false);
    // A click on empty canvas (not a drag) deselects, like any editor.
    if (d && !d.moved) onSelect(null);
  };

  const center = () => {
    const r = ref.current.getBoundingClientRect();
    return [r.width / 2, r.height / 2];
  };

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cn("absolute inset-0 touch-none bg-bg select-none", panning ? "cursor-grabbing" : "cursor-grab")}
      style={{
        backgroundImage: "radial-gradient(circle, var(--border) 1.2px, transparent 1.4px)",
        backgroundSize: `${22 * view.k}px ${22 * view.k}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
      >
        <svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width={BOUNDS.w} height={BOUNDS.h} aria-hidden="true">
          {EDGES.map((edge) => (
            <Edge key={edge.id} edge={edge} states={states} />
          ))}
        </svg>

        {NODES.map((node) => (
          <NodeCard
            key={node.id}
            node={node}
            state={states[node.id]}
            selected={selectedId === node.id}
            onSelect={() => onSelect(node.id)}
          />
        ))}
      </div>

      <div data-ctl className="absolute bottom-3 left-3 flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <CanvasButton label="Zoom in" onClick={() => zoomAt(1.25, ...center())} icon={<Plus className="size-4" />} />
        <CanvasButton label="Zoom out" onClick={() => zoomAt(0.8, ...center())} icon={<Minus className="size-4" />} />
        <CanvasButton
          label="Fit to screen"
          onClick={() => {
            touched.current = false;
            fit();
          }}
          icon={<Maximize2 className="size-3.5" />}
        />
      </div>
    </div>
  );
}

function CanvasButton({ label, icon, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-8 cursor-pointer items-center justify-center text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary not-last:border-b not-last:border-border-light"
    >
      {icon}
    </button>
  );
}

/* ── Edge ─────────────────────────────────────────────────────────────── */

function Edge({ edge, states }) {
  const from = NODE_BY_ID[edge.from];
  const done = states[edge.from] === STATE.DONE;
  const toState = states[edge.to];
  const flowing = done && (toState === STATE.RUN || toState === STATE.WAIT);
  const color = done ? STAGE_COLOR[from.stage] : "var(--text-tertiary)";
  const opacity = done ? 0.9 : 0.5;
  const d = edgePath(edge);

  // Chevron on the target port, pointing into the node it feeds.
  const tip = portOf(NODE_BY_ID[edge.to], edge.toSide);
  const [dx, dy] = { left: [1, 0], right: [-1, 0], top: [0, 1], bottom: [0, -1] }[edge.toSide];
  const arrow = `M ${tip.x - dx * 9 - dy * 5} ${tip.y - dy * 9 - dx * 5} L ${tip.x - dx} ${tip.y - dy} L ${tip.x - dx * 9 + dy * 5} ${tip.y - dy * 9 + dx * 5}`;

  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeDasharray={edge.optional ? "6 6" : undefined} opacity={opacity} />
      <path d={arrow} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={opacity} />
      {flowing && (
        // Moving dashes over the edge feeding the active node: the eye
        // follows the line to where the work is happening.
        <path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeDasharray="4 14" className="workflow-flow" />
      )}
    </g>
  );
}

/* ── Node ─────────────────────────────────────────────────────────────── */

function NodeCard({ node, state, selected, onSelect }) {
  const color = STAGE_COLOR[node.stage];
  const Icon = ICONS[node.icon];
  const StateIcon = STATE_ICON[state];
  const skipped = state === SKIPPED;
  const run = state === STATE.RUN;
  const ring = state === STATE.FAIL || state === STATE.WAIT ? STATE_COLOR[state] : run ? color : null;

  return (
    <button
      type="button"
      data-node
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      aria-pressed={selected}
      aria-label={`${node.title}: ${state ? STATE_TEXT[state] : "blueprint"}`}
      className={cn(
        "absolute flex cursor-pointer flex-col justify-between rounded-xl border bg-surface p-3 text-left",
        "transition-[border-color,box-shadow,opacity] duration-150",
        selected ? "border-accent" : "border-border hover:border-text-tertiary",
        skipped && "opacity-45",
        node.optional && "border-dashed"
      )}
      style={{
        left: node.x,
        top: node.y,
        width: NODE_W,
        height: NODE_H,
        boxShadow: ring
          ? `0 0 0 1px ${ring}, 0 0 22px -4px color-mix(in srgb, ${ring} 50%, transparent)`
          : selected
            ? "0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent)"
            : "var(--shadow-sm)",
      }}
    >
      {/* Ports. Decorative: edges are drawn independently of these dots. */}
      {node.id !== "trigger" && <Port side={node.dir === "ltr" ? "left" : "right"} />}
      {!node.terminal && <Port side={node.dir === "ltr" ? "right" : "left"} />}

      <div className="flex items-start gap-2.5">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
        >
          {Icon && <Icon className="size-4" strokeWidth={2} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-text-primary">{node.title}</p>
          <p className="truncate text-xs text-text-tertiary">{node.tech}</p>
        </div>
        {StateIcon && (
          <span
            className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full"
            style={{
              color: STATE_COLOR[state],
              backgroundColor: `color-mix(in srgb, ${STATE_COLOR[state]} 14%, transparent)`,
            }}
          >
            <StateIcon className={cn("size-3", run && "animate-spin")} strokeWidth={3} />
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {node.gate && <Tag>Gate</Tag>}
        {node.optional && <Tag>Optional</Tag>}
        {skipped && <Tag>Skipped</Tag>}
        {!node.gate && !node.optional && !skipped && (
          <span className="truncate text-[11px] text-text-tertiary">{node.outputs}</span>
        )}
      </div>
    </button>
  );
}

function Tag({ children }) {
  return (
    <span className="rounded-full border border-border px-1.5 py-px text-[10px] font-medium tracking-wide text-text-secondary uppercase">
      {children}
    </span>
  );
}

function Port({ side }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full border-2 border-text-tertiary bg-surface",
        side === "left" ? "-left-[6px]" : "-right-[6px]"
      )}
    />
  );
}
