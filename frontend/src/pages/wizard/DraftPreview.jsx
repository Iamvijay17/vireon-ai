import { PencilLine, Film } from "lucide-react";
import { Card, CardHeader } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/Skeleton";
import { ErrorState } from "../../components";
import StatusBadge from "../../components/StatusBadge";
import { ScenePreview } from "../../components/video/ScenePreview";
import { getVideoJob } from "../../services/api";
import { useApiQuery } from "../../lib/useApiQuery";
import { queryKeys } from "../../lib/queryClient";
import { previewState, previewPollInterval } from "./previewState";

/**
 * Live preview of the job just created, using the real Remotion composition via the same
 * ScenePreview the Studio uses. It is explicitly a DRAFT: the browser plays the script's scenes
 * with the project's templates - it is not the rendered file. The final video, once rendered and
 * quality-checked, lives on the render page and is linked here only when it exists.
 */
export function DraftPreview({ jobId, onOpenStudio, onOpenRender }) {
  const query = useApiQuery([...queryKeys.videos.detail(jobId), "draft-preview"], () => getVideoJob(jobId), {
    select: (data) => data.job,
    errorMessage: "Could not load the draft preview",
    refetchInterval: (q) => previewPollInterval(q.state.data),
  });
  const job = query.data;
  const state = previewState(job);

  return (
    <Card className="mx-auto mt-4 max-w-3xl overflow-hidden" data-testid="draft-preview">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            Draft preview <Badge variant="warning">Draft</Badge>
          </span>
        }
        subtitle="Played in your browser from the script - not the rendered video"
        extra={job ? <StatusBadge status={job.status} /> : null}
      />
      <div className="p-4">
        {query.error && !job ? (
          <ErrorState message="Could not load the draft preview" description={query.error.friendlyMessage || query.error.message} onRetry={query.refetch} />
        ) : query.loading && !job ? (
          <Skeleton className="aspect-video w-full" />
        ) : state.kind === "waiting" ? (
          <p className="text-[13px] text-text-secondary" data-testid="draft-waiting">
            The script is still being written. Scenes appear here as soon as it is saved - this page checks automatically.
          </p>
        ) : state.kind === "failed" ? (
          <ErrorState message="No script was produced" description={job?.error?.message || "The job stopped before any scenes existed. Open the project to see why and retry."} />
        ) : (
          <>
            <ScenePreview scenes={state.scenes} videoId={jobId} />
            <p className="mt-3 text-xs text-text-tertiary">
              {state.scenes.length} scene{state.scenes.length === 1 ? "" : "s"}. Images and narration that have not been generated yet are missing here and will be in the final render.
            </p>
          </>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {state.kind === "draft" && (
            <Button variant="secondary" icon={<PencilLine className="size-4" />} onClick={onOpenStudio}>
              Review scenes in Studio
            </Button>
          )}
          {state.finalReady && (
            <Button variant="primary" icon={<Film className="size-4" />} onClick={onOpenRender}>
              Watch the final render
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
