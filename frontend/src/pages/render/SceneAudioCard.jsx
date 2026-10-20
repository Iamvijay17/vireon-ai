import { RotateCw } from "lucide-react";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Tooltip } from "../../components/ui/Tooltip";
import { Spinner } from "../../components/ui/Spinner";
import { AudioPlayer } from "../../components/ui/AudioPlayer";
import { cn } from "../../components/ui/cn";
import { resolveSceneAudioUrl } from "../../services/api";

/**
 * Per-scene narration: a strip showing which scenes have audio, and a player
 * for each one that does. Audio files are only fetched when played.
 */
export const SceneAudioCard = ({ job, isActive, regeneratingScene, onRegenerateScene }) => {
  const scenes = job.script.scenes;
  const readyScenes = scenes.filter((s) => s.audio?.file);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Scene audio"
        subtitle={`${readyScenes.length} of ${scenes.length} scenes have narration`}
        extra={
          <div className="flex flex-wrap gap-1" aria-label="Scene audio status">
            {scenes.map((scene) => {
              const ready = Boolean(scene.audio?.file);
              const isCurrent = isActive && job?.currentScene === scene.sceneNumber;
              return (
                <span
                  key={scene.sceneNumber}
                  title={`Scene ${scene.sceneNumber}${ready ? ": ready" : isCurrent ? ": generating" : ": pending"}`}
                  className={cn(
                    "flex size-6 items-center justify-center rounded border text-[10.5px] font-medium",
                    ready && "border-success-500/30 bg-success-500/10 text-success-600 dark:text-success-500",
                    !ready && isCurrent && "animate-pulse border-accent bg-accent-subtle text-accent-fg",
                    !ready && !isCurrent && "border-border text-text-tertiary"
                  )}
                >
                  {scene.sceneNumber}
                </span>
              );
            })}
          </div>
        }
      />

      {readyScenes.length > 0 ? (
        <ul className="divide-y divide-border-light">
          {readyScenes.map((scene) => {
            const sceneAudioUrl = resolveSceneAudioUrl(job._id, scene.audio.file);
            const isRegenerating = regeneratingScene === scene.sceneNumber;
            return (
              // Below `sm` the label gets its own line so the player (whose waveform
              // spans the whole track) is not squeezed to nothing beside it.
              <li key={scene.sceneNumber} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:flex-nowrap">
                <span className="w-full shrink-0 text-xs font-medium text-text-secondary sm:w-16">Scene {scene.sceneNumber}</span>
                {isRegenerating ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-text-tertiary">
                    <Spinner size="sm" />
                    Regenerating this scene&rsquo;s audio…
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
                      icon={<RotateCw className={cn("size-3.5", isRegenerating && "animate-spin")} />}
                      disabled={isRegenerating}
                      onClick={() => onRegenerateScene(scene.sceneNumber)}
                    />
                  </Tooltip>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-4 py-5 text-[13px] text-text-tertiary">Audio appears here as each scene finishes generating.</p>
      )}
    </Card>
  );
};
