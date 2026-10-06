import { ArrowLeft, RotateCw, Square } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Tooltip } from "../../../components/ui/Tooltip";

/** Title, topic, live/worker badges, and Stop or Retry when they apply. */
export function LessonHeader({ video, socketStatus, workerRunning, isProcessing, isFailed, actionLoading, onBack, onStop, onRetry }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <Button variant="ghost" size="md" iconOnly aria-label="Back to course" onClick={onBack} icon={<ArrowLeft className="size-4" />} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-text-primary [overflow-wrap:anywhere]">{video.title}</h1>
          <p className="mt-1 text-sm text-text-secondary [overflow-wrap:anywhere]">{video.topic}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Badge variant={socketStatus === "connected" ? "success" : "neutral"} dot>
              {socketStatus === "connected" ? "Live" : socketStatus === "reconnecting" ? "Reconnecting..." : "Offline"}
            </Badge>
            {workerRunning !== null && (
              <Tooltip
                content={
                  workerRunning
                    ? "The course worker is running - generation jobs will process."
                    : "The course worker is not running. Start it (npm run course-worker) before generating - otherwise generation requests will be rejected."
                }
              >
                <Badge variant={workerRunning ? "success" : "danger"} dot>
                  {workerRunning ? "Worker Running" : "Worker Offline"}
                </Badge>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
      {isProcessing && (
        <Button variant="danger" icon={<Square className="size-4" />} loading={actionLoading.stop} onClick={onStop}>
          Stop
        </Button>
      )}
      {isFailed && (
        <Button variant="danger" icon={<RotateCw className="size-4" />} loading={actionLoading.retry} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
