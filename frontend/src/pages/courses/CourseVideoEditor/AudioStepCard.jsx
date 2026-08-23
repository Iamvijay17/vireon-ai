import { RotateCw, Zap } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Tooltip } from "../../../components/ui/Tooltip";
import { DescriptionList } from "../../../components/ui/DescriptionList";
import { Spinner } from "../../../components/ui/Spinner";
import { AudioPlayer } from "../../../components/ui/AudioPlayer";
import { resolveMediaUrl, resolveSceneAudioUrl } from "../../../services/api";
import { InlineEmpty, InlineSpinner, StepSection } from "./shared";

export const AudioStepCard = ({
  video,
  scenes,
  hasAudio,
  isApproved,
  isProcessing,
  audioState,
  audioSummary,
  isOpen,
  onToggle,
  actionLoading,
  regeneratingScene,
  onGenerateAudio,
  onRegenerateAudio,
  onRegenerateSceneAudio,
  onManualRefresh,
}) => (
  <StepSection
    number={2}
    title="Audio Generation"
    state={audioState}
    isOpen={isOpen}
    onToggle={onToggle}
    summary={audioSummary}
    actions={
      <>
        <Button variant="ghost" size="sm" iconOnly aria-label="Refresh" icon={<RotateCw className="size-3.5" />} onClick={onManualRefresh} />
        {isApproved && !hasAudio && video?.status !== "Generating Audio" && (
          <Button variant="primary" size="sm" icon={<Zap className="size-3.5" />} loading={actionLoading.audio} onClick={onGenerateAudio}>
            Generate Audio
          </Button>
        )}
        {hasAudio && video?.status !== "Generating Audio" && (
          <Button variant="secondary" size="sm" icon={<RotateCw className="size-3.5" />} loading={actionLoading.audio} onClick={onRegenerateAudio}>
            Regenerate Audio
          </Button>
        )}
      </>
    }
  >
    {!isApproved && !hasAudio && <InlineEmpty description="Approve the script first to generate audio" />}
    {isApproved && !hasAudio && !isProcessing && (
      <InlineEmpty description="Audio not yet generated">
        <Button variant="primary" size="sm" icon={<Zap className="size-3.5" />} loading={actionLoading.audio} onClick={onGenerateAudio} className="mt-1">
          Generate Audio
        </Button>
      </InlineEmpty>
    )}
    {video?.status === "Generating Audio" && scenes.length === 0 && (
      <InlineSpinner label="Generating audio narration..." />
    )}
    {(hasAudio || video?.status === "Generating Audio") && scenes.length > 0 && (() => {
      const readyCount = scenes.filter((s) => Boolean(s.audio?.file)).length;
      return (
        <div>
          <p className="mb-3 font-semibold text-text-primary">
            Per-Scene Audio ({readyCount}/{scenes.length} ready)
          </p>
          <div className="flex flex-col divide-y divide-border-light rounded-xl border border-border-light">
            {scenes.map((scene, idx) => {
              const sceneNum = scene.sceneNumber || idx + 1;
              const sceneReady = Boolean(scene.audio?.file);
              const sceneAudioUrl = resolveSceneAudioUrl(video._id, scene.audio?.file);
              const sceneTitle = scene.title || `Scene ${sceneNum}`;
              const sceneType = scene.sceneType || "content";
              const isRegenerating = regeneratingScene === sceneNum;
              return (
                <div key={idx} className="p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs font-medium text-text-tertiary">{sceneNum}</span>
                    <span className="text-[13px] font-semibold text-text-primary">{sceneTitle}</span>
                    <Badge className="ml-auto shrink-0">{sceneType}</Badge>
                    {sceneReady && !isProcessing && (
                      <Tooltip content="Regenerate just this scene's audio">
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-label={`Regenerate scene ${sceneNum} audio`}
                          icon={<RotateCw className={`size-3.5 ${isRegenerating ? "animate-spin" : ""}`} />}
                          disabled={isRegenerating}
                          onClick={() => onRegenerateSceneAudio(sceneNum)}
                        />
                      </Tooltip>
                    )}
                  </div>
                  {sceneReady && !isRegenerating ? (
                    <AudioPlayer src={sceneAudioUrl} className="w-full" />
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border-light px-3 py-2 text-xs text-text-tertiary">
                      <Spinner size="sm" />
                      {isRegenerating ? "Regenerating this scene's audio..." : "Generating this scene's audio..."}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    })()}
    {hasAudio && scenes.length === 0 && (
      <div>
        <DescriptionList
          items={[
            { label: "Total Duration", value: `${Math.round(video.audioDuration)} seconds` },
            { label: "Generated", value: video.audioGeneratedAt ? new Date(video.audioGeneratedAt).toLocaleString() : "N/A" },
          ]}
        />
        {video.audioUrl && <AudioPlayer src={resolveMediaUrl(video.audioUrl)} className="mt-3" />}
      </div>
    )}
  </StepSection>
);
