import { CheckCircle2, XCircle, CircleSlash, RefreshCw } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Steps } from "../../components/ui/Steps";
import { CircularProgress } from "../../components/ui/CircularProgress";
import { PIPELINE_STEPS } from "./constants";

export const ProgressCard = ({ job, currentStepIndex, isComplete, isFailed, isCancelled, isActive }) => (
  <Card className="animate-slide-up p-6">
    <div className="flex flex-col items-center gap-3 border-b border-border-light pb-6 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex items-center gap-4">
        <CircularProgress percent={job?.progress || 0} error={isFailed} />
        <div>
          <Badge
            variant={isComplete ? "success" : isFailed ? "danger" : isCancelled ? "neutral" : "accent"}
            icon={
              isComplete ? <CheckCircle2 className="size-3" /> :
              isFailed ? <XCircle className="size-3" /> :
              isCancelled ? <CircleSlash className="size-3" /> :
              <RefreshCw className="size-3 animate-spin" />
            }
          >
            {job?.status?.replace(/_/g, " ")}
          </Badge>
          {isActive && job?.currentScene ? (
            <p className="mt-1.5 text-xs text-text-tertiary">Scene {job.currentScene}</p>
          ) : null}
        </div>
      </div>
    </div>

    <div className="pt-6">
      <Steps
        items={PIPELINE_STEPS}
        current={currentStepIndex >= 0 ? currentStepIndex : 0}
        status={isFailed || isCancelled ? "error" : isComplete ? "finish" : "process"}
      />

      {isFailed && job?.error && (
        <Alert type="error" className="mt-5">
          {typeof job.error === "string" ? job.error : job.error?.message || "An error occurred"}
        </Alert>
      )}

      {isCancelled && (
        <Alert type="info" className="mt-5">
          Stopped before reaching {job?.error?.step?.replace(/_/g, " ") || "completion"}. Use Restart Job to pick back up from here.
        </Alert>
      )}

      {isComplete && (
        <Alert type="success" title="Video generation completed successfully!" className="mt-5 animate-scale-in" />
      )}
    </div>
  </Card>
);
