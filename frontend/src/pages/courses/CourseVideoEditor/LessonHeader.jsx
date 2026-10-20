import { RotateCw, Square } from "lucide-react";
import { PageHeader } from "../../../components";
import ConnectionIndicator from "../../../components/ConnectionIndicator";
import StatusBadge from "../../../components/StatusBadge";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Tooltip } from "../../../components/ui/Tooltip";

/** Title, topic, live/worker state, and Stop or Retry when they apply. */
export function LessonHeader({ video, socketStatus, workerRunning, isProcessing, isFailed, actionLoading, onStop, onRetry }) {
  return (
    <PageHeader
      title={<span className="[overflow-wrap:anywhere]">{video.title}</span>}
      description={<span className="[overflow-wrap:anywhere]">{video.topic}</span>}
      meta={
        <>
          <StatusBadge status={video.status} />
          <ConnectionIndicator status={socketStatus} />
          {workerRunning !== null && (
            <Tooltip
              content={
                workerRunning
                  ? "The course worker is running - generation jobs will process."
                  : "The course worker is not running. Start it (npm run course-worker) before generating - otherwise generation requests will be rejected."
              }
            >
              <Badge variant={workerRunning ? "success" : "danger"} dot>
                {workerRunning ? "Worker running" : "Worker offline"}
              </Badge>
            </Tooltip>
          )}
        </>
      }
      extra={
        <>
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
        </>
      }
    />
  );
}
