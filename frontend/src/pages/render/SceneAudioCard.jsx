import { AudioLines, RotateCw } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Tooltip } from "../../components/ui/Tooltip";
import { Spinner } from "../../components/ui/Spinner";
import { AudioPlayer } from "../../components/ui/AudioPlayer";
import { resolveSceneAudioUrl } from "../../services/api";

export const SceneAudioCard = ({ job, isActive, regeneratingScene, onRegenerateScene }) => {
  const scenes = job.script.scenes;
  const readyScenes = scenes.filter((s) => s.audio?.file);

  return (
    <Card className="animate-slide-up p-6" style={{ "--stagger-index": 1 }}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
          <AudioLines className="size-[18px] text-accent" /> Scene Audio
        </h3>
        <span className="text-xs font-medium text-text-tertiary">{readyScenes.length}/{scenes.length} ready</span>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {scenes.map((scene) => {
          const ready = Boolean(scene.audio?.file);
          const isCurrent = isActive && job?.currentScene === scene.sceneNumber;
          return (
            <span
              key={scene.sceneNumber}
              title={`Scene ${scene.sceneNumber}${ready ? " — ready" : isCurrent ? " — generating" : " — pending"}`}
              className={`flex size-7 items-center justify-center rounded-md border text-[11px] font-medium ${
                ready
                  ? "border-success-500/30 bg-success-500/10 text-success-600"
                  : isCurrent
                  ? "animate-pulse border-accent bg-accent/10 text-accent"
                  : "border-border text-text-tertiary"
              }`}
            >
              {scene.sceneNumber}
            </span>
          );
        })}
      </div>

      {readyScenes.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-border-light pt-4">
          {readyScenes.map((scene) => {
            const sceneAudioUrl = resolveSceneAudioUrl(job._id, scene.audio.file);
            const isRegenerating = regeneratingScene === scene.sceneNumber;
            return (
              <div key={scene.sceneNumber} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-[13px] font-medium text-text-secondary">Scene {scene.sceneNumber}</span>
                {isRegenerating ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-dashed border-border-light px-3 py-2 text-xs text-text-tertiary">
                    <Spinner size="sm" />
                    Regenerating this scene's audio...
                  </div>
                ) : (
                  <AudioPlayer src={sceneAudioUrl} className="min-w-0 flex-1" />
                )}
                {!isActive && (
                  <Tooltip content="Regenerate just this scene's audio">
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      aria-label={`Regenerate scene ${scene.sceneNumber} audio`}
                      icon={<RotateCw className={`size-3.5 ${isRegenerating ? "animate-spin" : ""}`} />}
                      disabled={isRegenerating}
                      onClick={() => onRegenerateScene(scene.sceneNumber)}
                    />
                  </Tooltip>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="border-t border-border-light pt-4 text-[13px] text-text-tertiary">Audio will appear here as scenes finish generating.</p>
      )}
    </Card>
  );
};
