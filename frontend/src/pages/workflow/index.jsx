import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Play, FileText, Hand, Mic2, Captions, UserSquare2, Image as ImageIcon, Package, Film,
  UploadCloud, CircleCheck, Plus, Minus, Maximize2, X, ExternalLink, Check, Loader2, Pause,
} from "lucide-react";
import { PageHeader, StatusTag } from "../../components";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { cn } from "../../components/ui/cn";
import { useJobs } from "../../lib/useJobs";
import { queryKeys } from "../../lib/queryClient";
import { getVideoJob } from "../../services/api";
import { useWorkflowJobLive } from "./useWorkflowJobLive";
import { QueuePanel } from "./QueuePanel";
import { NowRunningPanel } from "./NowRunningPanel";
import { isTerminal } from "./queue";
import {
  NODES, EDGES, NODE_W, NODE_H, BOUNDS, NODE_BY_ID, STATE, STATE_COLOR, STAGE_COLOR, SKIPPED,
  edgePath, nodeStates, portOf,
} from "./graph";

const ICONS = {
  play: Play, text: FileText, hand: Hand, mic: Mic2, captions: Captions, user: UserSquare2,
  image: ImageIcon, box: Package, film: Film, upload: UploadCloud, check: CircleCheck,
};

const STATE_ICON = { [STATE.DONE]: Check, [STATE.RUN]: Loader2, [STATE.WAIT]: Pause, [STATE.FAIL]: X };

const STATE_TEXT = {
  [STATE.IDLE]: "Not started",
  [STATE.RUN]: "In progress",
  [STATE.WAIT]: "Waiting for you",
  [STATE.DONE]: "Completed",
  [STATE.FAIL]: "Failed",
  [SKIPPED]: "Skipped",
};

const STAGE_LEGEND = [
  ["script", "Script"], ["voice", "Voice"], ["render", "Render"], ["publish", "Publish"],
];

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.6;
const FIT_PADDING = 56;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Workflow: the render pipeline drawn as a node canvas.
 *
 * Looks like a workflow editor but is a *view* of our own fixed pipeline
 * (see ./graph.js), not an editor - nodes can't be rewired because the
 * worker runs one hard-coded sequence. Pick a job and the same canvas
 * becomes a live run view: every node takes that job's state and updates
 * over the socket.
 */
const WorkflowPage = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const jobId = params.get("job") || "";
  const [selectedId, setSelectedId] = useState(null);

  useWorkflowJobLive(jobId || null);

  // isActive turns on the safety-net refetch while anything is unfinished, so
  // the queue stays current for jobs whose rooms this page has not joined.
  const { jobs } = useJobs({
    page: 1,
    limit: 30,
    filters: { type: "video" },
    isActive: (j) => !isTerminal(j),
  });

  const { data: job } = useQuery({
    queryKey: queryKeys.videos.detail(jobId),
    queryFn: async () => (await getVideoJob(jobId)).data.job,
    enabled: Boolean(jobId),
  });

  const states = useMemo(() => nodeStates(jobId ? job : null), [job, jobId]);
  const selected = NODES.find((n) => n.id === selectedId) || null;

  const options = useMemo(
    () => [{ value: "", label: "Blueprint (no job)" }, ...jobs.map((j) => ({ value: j.id, label: j.title || j.id }))],
    [jobs]
  );

  const pickJob = (value) => {
    const next = new URLSearchParams(params);
    if (value) next.set("job", value);
    else next.delete("job");
    setParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="Workflow"
        description="Every step a video goes through. Pick a job to watch it move through the graph live."
        extra={
          <>
            <Select value={jobId} onChange={pickJob} options={options} className="w-full sm:w-72" />
            {jobId && (
              <Button variant="outline" icon={<ExternalLink className="size-4" />} onClick={() => navigate(`/render?id=${jobId}`)}>
                Open job
              </Button>
            )}
          </>
        }
      />

      <Card className="relative h-[calc(100vh-17rem)] min-h-[460px] overflow-hidden">
        <Canvas states={states} selectedId={selectedId} onSelect={setSelectedId} />

        {job && jobId && (
          <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 rounded-lg border border-border bg-surface/90 px-2.5 py-1.5 backdrop-blur">
            <StatusTag status={job.status} />
            <span className="max-w-[220px] truncate text-[13px] font-medium text-text-primary">{job.title || job.topic}</span>
          </div>
        )}

        {selected && <Inspector node={selected} state={states[selected.id]} onClose={() => setSelectedId(null)} />}
      </Card>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-tertiary">
        {STAGE_LEGEND.map(([id, label]) => (
          <span key={id} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ backgroundColor: STAGE_COLOR[id] }} />
            {label}
          </span>
        ))}
        <span className="hidden h-3 w-px bg-border sm:block" />
        <span>Scroll to zoom · drag to pan · click a step for details</span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <NowRunningPanel job={jobId ? job : null} jobId={jobId} states={states} />
        <QueuePanel jobs={jobs} selectedJobId={jobId} onPick={pickJob} />
      </div>
    </div>
  );
};

/* ── Canvas ───────────────────────────────────────────────────────────── */

function Canvas({ states, selectedId, onSelect }) {
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

/* ── Inspector ────────────────────────────────────────────────────────── */

function Inspector({ node, state, onClose }) {
  return (
    <aside
      data-ctl
      className="absolute inset-y-3 right-3 z-10 flex w-[min(320px,calc(100%-24px))] animate-scale-in flex-col rounded-xl border border-border bg-surface shadow-lg"
    >
      <div className="flex items-start gap-2 border-b border-border-light p-4">
        <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: STAGE_COLOR[node.stage] }} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-text-primary">{node.title}</h3>
          <p className="text-xs text-text-tertiary">{node.tech}</p>
        </div>
        <Button variant="ghost" size="sm" iconOnly className="-mt-1 -mr-2" onClick={onClose} icon={<X className="size-4" />} aria-label="Close details" />
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-[13px]">
        {state && <Field label="This job">{STATE_TEXT[state]}</Field>}
        <Field label="What it does">{node.summary}</Field>
        <Field label="Produces">{node.outputs}</Field>
        {node.file && (
          <Field label="Source">
            <code className="rounded bg-surface-hover px-1.5 py-0.5 font-mono text-xs">{node.file}</code>
          </Field>
        )}
      </div>
    </aside>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold tracking-wide text-text-tertiary uppercase">{label}</p>
      <p className="leading-relaxed text-text-secondary">{children}</p>
    </div>
  );
}

export default WorkflowPage;
