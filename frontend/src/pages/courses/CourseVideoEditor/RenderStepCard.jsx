import { RotateCw, Zap, CheckCircle2, PlayCircle } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Progress } from "../../../components/ui/Progress";
import { Spinner } from "../../../components/ui/Spinner";
import { resolveMediaUrl } from "../../../services/api";
import { InlineEmpty, StepSection } from "./shared";

export const RenderStepCard = ({
  video,
  hasAudio,
  isCompleted,
  isUploading,
  isProcessing,
  renderState,
  renderSummary,
  isOpen,
  onToggle,
  actionLoading,
  onRender,
  onReRender,
  onManualRefresh,
  courseId,
  navigate,
}) => (
  <StepSection
    number={3}
    title="Video Render"
    state={renderState}
    isOpen={isOpen}
    onToggle={onToggle}
    summary={renderSummary}
    actions={
      <>
        <Button variant="ghost" size="sm" iconOnly aria-label="Refresh" icon={<RotateCw className="size-3.5" />} onClick={onManualRefresh} />
        {hasAudio && !isCompleted && !isProcessing && (
          <Button variant="primary" size="sm" icon={<Zap className="size-3.5" />} loading={actionLoading.render} onClick={onRender}>
            Render Video
          </Button>
        )}
        {isCompleted && (
          <Button variant="secondary" size="sm" icon={<RotateCw className="size-3.5" />} loading={actionLoading.render} onClick={onReRender}>
            Re-Render
          </Button>
        )}
      </>
    }
  >
    {!hasAudio && !isCompleted && <InlineEmpty description="Generate audio first to render the video" />}
    {hasAudio && !isCompleted && !isProcessing && (
      <InlineEmpty description="Ready to render">
        <Button variant="primary" size="sm" icon={<Zap className="size-3.5" />} loading={actionLoading.render} onClick={onRender} className="mt-1">
          Render Video
        </Button>
      </InlineEmpty>
    )}
    {video?.status === "Rendering Video" && (
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <Spinner size="lg" />
        <p className="text-sm text-text-secondary">Rendering video...</p>
        {video.renderProgress > 0 && <Progress percent={video.renderProgress} className="mt-1 w-full max-w-sm" />}
      </div>
    )}
    {isUploading && (
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <Spinner size="lg" />
        <p className="text-sm text-text-secondary">Uploading assets to cloud storage...</p>
        {video.renderProgress > 0 && <Progress percent={video.renderProgress} className="mt-1 w-full max-w-sm" />}
      </div>
    )}
    {isCompleted && (
      <div className="flex flex-col items-center py-6 text-center">
        <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-success-500/10 text-success-500">
          <CheckCircle2 className="size-7" />
        </div>
        <h3 className="text-base font-semibold text-text-primary">Video Completed!</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Rendered at: {video.renderedAt ? new Date(video.renderedAt).toLocaleString() : "N/A"}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {video.renderUrl && (
            <Button href={resolveMediaUrl(video.renderUrl)} target="_blank" rel="noopener noreferrer" variant="primary" icon={<PlayCircle className="size-4" />}>
              Watch Video
            </Button>
          )}
          <Button variant="secondary" icon={<RotateCw className="size-4" />} loading={actionLoading.render} onClick={onReRender}>
            Re-Render
          </Button>
          <Button variant="ghost" onClick={() => navigate(`/courses/${courseId}`)}>
            Back to Course
          </Button>
        </div>
      </div>
    )}
  </StepSection>
);
