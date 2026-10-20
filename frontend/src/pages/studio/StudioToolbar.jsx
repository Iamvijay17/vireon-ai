import { Save, Redo2, CheckCircle2, AudioLines, Video, Undo2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import StatusBadge from "../../components/StatusBadge";
import ConnectionIndicator from "../../components/ConnectionIndicator";

/** Title row, save + the stage's primary action, and the stage's explainer banner. */
export function StudioToolbar({ job, stage, socketStatus, hasChanges, actions, onDiscard }) {
  const { isAwaitingApproval, isManual, isAwaitingAudioTrigger, isAwaitingRenderTrigger, canRegenerateAudio, canEdit } = stage;
  const { busy } = actions;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-text-primary">{job.topic}</h1>
          <StatusBadge status={job.status} />
          <ConnectionIndicator status={socketStatus} />
          {hasChanges && (
            <Badge variant="warning" dot>
              Unsaved changes
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasChanges && (
            <Button variant="ghost" size="sm" icon={<Undo2 className="size-4" />} onClick={onDiscard} disabled={busy.saving}>
              Discard
            </Button>
          )}
          <Button variant="secondary" size="sm" icon={<Save className="size-4" />} onClick={actions.handleSave} loading={busy.saving} disabled={!hasChanges || !canEdit}>
            Save changes
          </Button>
          {canRegenerateAudio && (
            <Button variant="secondary" size="sm" icon={<AudioLines className="size-4" />} onClick={actions.handleGenerateAudio} loading={busy.generatingAudio}>
              Regenerate Audio
            </Button>
          )}
          {isAwaitingApproval ? (
            <Button variant="primary" size="sm" icon={<CheckCircle2 className="size-4" />} onClick={actions.handleApprove} loading={busy.approving}>
              {isManual ? "Approve Script" : "Approve & Continue"}
            </Button>
          ) : isAwaitingAudioTrigger ? (
            <Button variant="primary" size="sm" icon={<AudioLines className="size-4" />} onClick={actions.handleGenerateAudio} loading={busy.generatingAudio}>
              Generate Audio
            </Button>
          ) : isAwaitingRenderTrigger ? (
            <Button variant="primary" size="sm" icon={<Video className="size-4" />} onClick={actions.handleGenerateRender} loading={busy.generatingRender}>
              Generate Render
            </Button>
          ) : (
            <Button variant="primary" size="sm" icon={<Redo2 className="size-4" />} onClick={actions.handleRerender} loading={busy.rerendering} disabled={!canEdit}>
              Re-render
            </Button>
          )}
        </div>
      </div>

      {isAwaitingApproval && (
        <Alert type="info" title="Script ready for review">
          Review and edit the scenes below - you can also paste a manual image URL for any image scene instead of
          waiting for AI image generation.{" "}
          {isManual
            ? 'Click "Approve Script" when ready - you\'ll then trigger audio and rendering separately.'
            : 'Click "Approve & Continue" when you\'re ready to generate audio, images, and the final video.'}
        </Alert>
      )}

      {isAwaitingAudioTrigger && (
        <Alert type="info" title="Script approved">
          Click "Generate Audio" when you're ready to generate the voiceover for each scene.
        </Alert>
      )}

      {isAwaitingRenderTrigger && (
        <Alert type="info" title="Audio ready">
          Click "Generate Render" when you're ready to generate images (if any) and produce the final video. Changed the
          voice or narration? Click "Regenerate Audio" to redo every scene first.
        </Alert>
      )}

      {!canEdit && !isAwaitingApproval && !isAwaitingAudioTrigger && !isAwaitingRenderTrigger && (
        <Alert type="warning" title="This job cannot be edited in its current state.">
          Only completed, failed, or awaiting-approval jobs can be edited and re-rendered.
        </Alert>
      )}
    </>
  );
}
