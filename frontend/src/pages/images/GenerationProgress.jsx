import { useState, useEffect } from "react";
import { cn } from "../../components/ui/cn";

const PHASE_LABEL = {
  queued: "Waiting for the GPU",
  loading: "Loading models",
  saving: "Saving image",
};

const label = (progress) => {
  if (progress?.phase === "sampling") return `Step ${progress.step} of ${progress.steps}`;
  return PHASE_LABEL[progress?.phase] || "Starting";
};

const formatElapsed = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// Ticks once a second so the clock moves between the (also 1s) progress polls.
const Elapsed = ({ since }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <span className="tabular-nums">{formatElapsed(now - new Date(since).getTime())}</span>;
};

// The pending tile's body: a real percentage from ComfyUI's own step counter,
// the phase it is in, and how long it has been going. `progress` is undefined
// for the instant between creating a record and the first progress poll.
export const GenerationProgress = ({ progress, since, className }) => {
  const percent = Math.round(progress?.percent ?? 0);
  const waiting = !progress || progress.phase === "queued";

  return (
    <div className={cn("flex flex-col items-center justify-center gap-2.5 bg-surface-hover px-5 text-center", className)}>
      <p className={cn("text-3xl font-semibold tabular-nums tracking-tight", waiting ? "text-text-tertiary" : "text-accent")}>
        {percent}%
      </p>
      <div
        className="h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Image generation progress"
      >
        <div
          className={cn("h-full rounded-full bg-accent transition-[width] duration-700 ease-out", waiting && "animate-pulse")}
          style={{ width: `${Math.max(percent, waiting ? 4 : 2)}%` }}
        />
      </div>
      <div className="text-xs text-text-tertiary">
        <p>{label(progress)}</p>
        {since && (
          <p className="mt-0.5">
            <Elapsed since={since} /> elapsed
          </p>
        )}
      </div>
    </div>
  );
};

export default GenerationProgress;
