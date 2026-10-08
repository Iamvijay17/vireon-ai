import { ArrowLeft, Save, Redo2, CheckCircle2, Pencil, AudioLines, Video } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";

/** Title row, save + the stage's primary action, and the stage's explainer banner. */
export function StudioToolbar({ job, stage, socketStatus, hasChanges, actions, onBack }) {
  const { isAwaitingApproval, isManual, isAwaitingAudioTrigger, isAwaitingRenderTrigger, canRegenerateAudio, canEdit } = stage;
  const { busy } = actions;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <Button variant="secondary" size="sm" icon={<ArrowLeft className="size-4" />} onClick={onBack}>
            Back
          </Button>
          <h1 className="flex min-w-0 items-center gap-2 text-lg font-semibold tracking-tight text-text-primary">
            <Pencil className="size-[18px] shrink-0 text-text-tertiary" /> <span className="truncate">{job.topic}</span>
          </h1>
          <Badge variant={socketStatus === "connected" ? "success" : "neutral"} dot>
            {socketStatus === "connected" ? "Live" : "Offline"}
          </Badge>
          {hasChanges && <Badge variant="warning">Unsaved changes</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" icon={<Save className="size-4" />} onClick={actions.handleSave} loading={busy.saving} disabled={!hasChanges || !canEdit}>
            Save Changes
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
