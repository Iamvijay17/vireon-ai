import { RotateCw, Pencil, AudioLines, Video } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Tooltip } from "../../components/ui/Tooltip";

/**
 * One clearly-labeled button per pipeline stage, always visible so the
 * whole flow is scannable at a glance; disabled with a tooltip explaining
 * why when a stage isn't reachable yet.
 */
export const PipelineActionsCard = ({
  hasScript,
  canRegenerateScript,
  scriptStageReason,
  regenerateScriptLoading,
  onRegenerateScript,
  showReviewScript,
  approvalStageReason,
  onReviewApprove,
  showGenerateAudio,
  audioStageReason,
  generateAudioLoading,
  onGenerateAudio,
  showGenerateRender,
  canReRenderComplete,
  renderStageReason,
  generateRenderLoading,
  rerenderLoading,
  onGenerateOrRerender,
}) => (
  <Card className="mb-5 animate-slide-up p-5">
    <h3 className="mb-4 text-[13px] font-semibold text-text-primary">Pipeline Actions</h3>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tooltip className="w-full" content={scriptStageReason || "Throws away the current script and regenerates it from scratch"}>
        <Button
          className="w-full"
          variant="secondary"
          icon={<RotateCw className="size-4" />}
          loading={regenerateScriptLoading}
          disabled={!canRegenerateScript}
          onClick={onRegenerateScript}
        >
          {hasScript ? "Regenerate Script" : "Generate Script"}
        </Button>
      </Tooltip>

      <Tooltip className="w-full" content={approvalStageReason || "Review the generated script and approve it to continue"}>
        <Button
          className="w-full"
          variant={showReviewScript ? "primary" : "secondary"}
          icon={<Pencil className="size-4" />}
          disabled={!showReviewScript}
          onClick={onReviewApprove}
        >
          Review & Approve
        </Button>
      </Tooltip>

      <Tooltip className="w-full" content={audioStageReason || "Generate audio for every scene"}>
        <Button
          className="w-full"
          variant={showGenerateAudio ? "primary" : "secondary"}
          icon={<AudioLines className="size-4" />}
          loading={generateAudioLoading}
          disabled={!showGenerateAudio}
          onClick={onGenerateAudio}
        >
          Generate Audio
        </Button>
      </Tooltip>

      <Tooltip className="w-full" content={renderStageReason || (showGenerateRender ? "Generate images and render the final video" : "Re-run rendering and upload")}>
        <Button
          className="w-full"
          variant={showGenerateRender || canReRenderComplete ? "primary" : "secondary"}
          icon={<Video className="size-4" />}
          loading={generateRenderLoading || rerenderLoading}
          disabled={!showGenerateRender && !canReRenderComplete}
          onClick={onGenerateOrRerender}
        >
          {showGenerateRender ? "Generate Render" : "Re-render"}
        </Button>
      </Tooltip>
    </div>
  </Card>
);
