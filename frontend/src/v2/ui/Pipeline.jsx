import { Check, X, Loader2, Pause } from "lucide-react";
import { cx } from "./cx";
import { STAGES, STATE, stageColor } from "../lib/status";

/**
 * The pipeline track: the signature component of v2.
 *
 * v1 surfaced pipeline position as a status string in a table cell, which
 * told you the current step but never where that step sat in the whole
 * sequence - you had to already know the pipeline to read it. This makes
 * the sequence itself the UI: four fixed stages, each with a permanent
 * colour identity, so position and progress are legible at a glance and in
 * peripheral vision.
 *
 * @param {Record<string, 'idle'|'run'|'wait'|'done'|'fail'>} stages
 *        state per stage id (script, voice, render, publish)
 * @param {'sm'|'md'} size  sm = table rows, md = detail headers
 */
export function PipelineTrack({ stages = {}, size = "md", className }) {
  const compact = size === "sm";

  return (
    // Detail size: below `sm` each stage stacks its label under the dot so
    // four labelled stages fit a phone; connectors drop to dot height.
    <div className={cx("flex", compact ? "items-center gap-1" : "items-start gap-1 sm:items-center sm:gap-1.5", className)}>
      {STAGES.map((stage, i) => {
        const state = stages[stage.id] || STATE.IDLE;
        return (
          <div
            key={stage.id}
            className={cx("flex", compact ? "items-center" : "min-w-0 items-start sm:items-center")}
            style={{ flex: compact ? "0 0 auto" : "1 1 0%" }}
          >
            <StageNode stage={stage} state={state} compact={compact} />
            {/* Connector, tinted by the stage *behind* it so a completed run
                reads as one continuous line rather than five islands. */}
            {i < STAGES.length - 1 && (
              <span
                className={cx("h-px shrink-0", compact ? "w-2" : "mx-1 mt-3 flex-1 sm:mx-1.5 sm:mt-0")}
                style={{
                  backgroundColor:
                    state === STATE.DONE
                      ? `color-mix(in srgb, ${stageColor(stage.id)} 50%, transparent)`
                      : "var(--v2-line)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Spoken form of each state - "wait" alone is not a sentence. */
const STATE_LABEL = {
  [STATE.IDLE]: "not started",
  [STATE.RUN]: "in progress",
  [STATE.WAIT]: "waiting for you",
  [STATE.DONE]: "completed",
  [STATE.FAIL]: "failed",
};

const STATE_ICON = {
  [STATE.DONE]: Check,
  [STATE.FAIL]: X,
  [STATE.RUN]: Loader2,
  [STATE.WAIT]: Pause,
};

function StageNode({ stage, state, compact }) {
  const color = stageColor(stage.id);
  const Icon = STATE_ICON[state];
  const done = state === STATE.DONE;
  const run = state === STATE.RUN;
  const fail = state === STATE.FAIL;
  const wait = state === STATE.WAIT;
  const active = done || run || fail || wait;

  const dot = (
    <span
      className={cx(
        "relative flex shrink-0 items-center justify-center rounded-full transition-all duration-300 ease-[var(--ease-v2-out)]",
        compact ? "size-4" : "size-6"
      )}
      style={{
        // An untouched stage is a hollow ring, not a filled grey dot: it
        // reads as "not yet" rather than as another kind of status.
        backgroundColor: active ? `color-mix(in srgb, ${color} 18%, transparent)` : "transparent",
        boxShadow: `inset 0 0 0 1.5px ${
          active ? color : "var(--v2-line-strong)"
        }`,
        color: active ? color : "var(--v2-text-3)",
      }}
    >
      {Icon && (
        <Icon
          className={cx(compact ? "size-2.5" : "size-3.5", run && "animate-spin")}
          strokeWidth={3}
        />
      )}
      {/* Halo on the running stage - the one place the eye should land. */}
      {run && (
        <span
          className="absolute -inset-1 animate-v2-pulse rounded-full"
          style={{ boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 18%, transparent)` }}
        />
      )}
    </span>
  );

  if (compact) {
    // In a table row the label would cost more width than it earns; the
    // title attribute keeps it available on hover and to screen readers.
    return (
      <span
        title={`${stage.label}: ${STATE_LABEL[state] || state}`}
        aria-label={`${stage.label}: ${STATE_LABEL[state] || state}`}
      >
        {dot}
      </span>
    );
  }

  return (
    // The visible label names the stage, but its *state* is carried only by
    // the icon and colour - so the group gets an accessible name that says
    // both. Without this a screen reader announces "Voice" for a stage that
    // has failed, which is worse than silence.
    <div
      className="flex min-w-0 flex-col items-center gap-1 sm:flex-row sm:gap-2"
      role="group"
      aria-label={`${stage.label}: ${STATE_LABEL[state] || state}`}
    >
      {dot}
      <span
        aria-hidden="true"
        className={cx(
          "max-w-full truncate text-[11px] font-medium transition-colors sm:text-[12px]",
          active ? "text-hi" : "text-lo"
        )}
      >
        {stage.label}
      </span>
    </div>
  );
}
