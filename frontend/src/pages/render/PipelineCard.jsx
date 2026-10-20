import { AudioLines, Check, Pencil, RotateCw, Video, X } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { Progress } from "../../components/ui/Progress";
import { cn } from "../../components/ui/cn";
import StatusBadge from "../../components/StatusBadge";
import { isJobRunning } from "../../lib/jobStatus";
import { PIPELINE_STEPS } from "./constants";

/** Where each pipeline step stands, from the job's position in the pipeline. */
const stepState = (index, current, { isComplete, isFailed, isCancelled }) => {
  if (isComplete) return "done";
  if (index < current) return "done";
  if (index === current) return isFailed || isCancelled ? "error" : "active";
  return "pending";
};

const Tracker = ({ current, flags }) => (
  <ol className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="Pipeline steps">
    {PIPELINE_STEPS.map((step, i) => {
      const state = stepState(i, current, flags);
      return (
        <li key={step.status} className="min-w-[4.25rem] flex-1" aria-current={state === "active" ? "step" : undefined}>
          <div
            className={cn(
              "h-1 rounded-full",
              state === "done" && "bg-accent",
              state === "active" && "animate-pulse bg-accent-fg",
              state === "error" && "bg-danger-500",
              state === "pending" && "bg-surface-active"
            )}
          />
          <p
            className={cn(
              "mt-1.5 flex items-center gap-1 text-[11px] font-medium",
              state === "pending" ? "text-text-tertiary" : "text-text-secondary",
              state === "active" && "text-text-primary",
              state === "error" && "text-danger-500"
            )}
          >
            {state === "done" && <Check className="size-3 text-accent-fg" />}
            {state === "error" && <X className="size-3" />}
            {step.title}
          </p>
        </li>
      );
    })}
  </ol>
);

const StageAction = ({ title, state, children }) => (
  <div className="flex flex-col gap-2 rounded-lg border border-border-light bg-bg p-3">
    <div>
      <p className="text-xs font-semibold text-text-primary">{title}</p>
      <p className="mt-0.5 min-h-8 text-[11px] leading-snug text-text-tertiary">{state}</p>
    </div>
    {children}
  </div>
);

/**
 * The job's whole pipeline in one card: where it is (status, progress, a
 * nine-step tracker) and the four stage actions beneath it. An action that is
 * not available says why in plain text right under its name - no hidden
 * tooltips - and the one that is the next step is the violet one.
 */
export const PipelineCard = ({ job, v, actions, onReviewApprove, onGenerateOrRerender }) => {
  const flags = { isComplete: v.isComplete, isFailed: v.isFailed, isCancelled: v.isCancelled };
  const running = isJobRunning(job?.status);
  const showBar = v.isActive && Number.isFinite(job?.progress);
  const errorText = typeof job?.error === "string" ? job.error : job?.error?.message;

  const audioReady = v.showGenerateAudio || v.showRegenerateAudio;
  const renderReady = v.showGenerateRender || v.canReRenderComplete;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2.5">
          <StatusBadge status={job?.status} />
          {v.isActive && job?.currentScene ? <span className="text-xs text-text-tertiary">Scene {job.currentScene}</span> : null}
        </div>
        {Number.isFinite(job?.progress) && (
          <span className="tabular text-sm font-semibold text-text-primary">{Math.round(job.progress)}%</span>
        )}
      </div>

      {showBar && <Progress className="mt-3" percent={job.progress} size="sm" showLabel={false} status={v.isFailed ? "error" : "active"} trickle={running} />}

      <div className="mt-4">
        <Tracker current={v.currentStepIndex >= 0 ? v.currentStepIndex : 0} flags={flags} />
      </div>

      {v.isFailed && errorText && (
        <Alert type="error" title="Why it failed" className="mt-4">
          {errorText}
        </Alert>
      )}
      {v.isCancelled && (
        <Alert type="info" className="mt-4">
          Stopped before {job?.error?.step?.replace(/_/g, " ") || "completion"}. Use Restart job to pick back up from here.
        </Alert>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StageAction title="Script" state={v.canRegenerateScript ? (v.hasScript ? "Written. Regenerating replaces it." : "Not generated yet") : v.scriptStageReason}>
          <Button size="sm" variant="secondary" icon={<RotateCw className="size-3.5" />} loading={actions.regenerateScriptLoading} disabled={!v.canRegenerateScript} onClick={actions.handleRegenerateScript}>
            {v.hasScript ? "Regenerate script" : "Generate script"}
          </Button>
        </StageAction>

        <StageAction title="Review" state={v.showReviewScript ? "Waiting for your approval" : v.approvalStageReason}>
          <Button size="sm" variant={v.showReviewScript ? "primary" : "secondary"} icon={<Pencil className="size-3.5" />} disabled={!v.showReviewScript} onClick={onReviewApprove}>
            Review &amp; approve
          </Button>
        </StageAction>

        <StageAction
          title="Audio"
          state={audioReady ? (v.showRegenerateAudio ? "Redo every scene, e.g. after a voice change" : "Ready to generate") : v.audioStageReason}
        >
          <Button size="sm" variant={v.showGenerateAudio ? "primary" : "secondary"} icon={<AudioLines className="size-3.5" />} loading={actions.generateAudioLoading} disabled={!audioReady} onClick={actions.handleGenerateAudio}>
            {v.showRegenerateAudio ? "Regenerate audio" : "Generate audio"}
          </Button>
        </StageAction>

        <StageAction
          title="Render"
          state={renderReady ? (v.showGenerateRender ? "Ready: builds images, then the video" : "Run rendering and quality checks again") : v.renderStageReason}
        >
          <Button
            size="sm"
            variant={renderReady ? "primary" : "secondary"}
            icon={<Video className="size-3.5" />}
            loading={actions.generateRenderLoading || actions.rerenderLoading}
            disabled={!renderReady}
            onClick={onGenerateOrRerender}
          >
            {v.showGenerateRender ? "Generate render" : "Re-render"}
          </Button>
        </StageAction>
      </div>
    </Card>
  );
};
