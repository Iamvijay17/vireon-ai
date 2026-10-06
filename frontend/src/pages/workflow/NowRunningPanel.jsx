import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Progress } from "../../components/ui/Progress";
import { Alert } from "../../components/ui/Alert";
import { SceneAudioCard } from "../render/SceneAudioCard";
import { isJobRunning } from "../../lib/jobStatus";
import { STATE, activeNode } from "./graph";

const Stat = ({ label, value }) => (
  <div>
    <p className="text-[11px] font-semibold tracking-wide text-text-tertiary uppercase">{label}</p>
    <p className="text-[13px] font-medium text-text-primary">{value}</p>
  </div>
);

function StageBody({ node, job }) {
  const scenes = job.script?.scenes || [];

  if ((node.id === "voice" || node.id === "captions") && scenes.length > 0) {
    // Same card the render page uses: per-scene readiness chips and a player
    // for each scene as it finishes. `isActive` hides its regenerate buttons.
    return <SceneAudioCard job={job} isActive regeneratingScene={null} onRegenerateScene={() => {}} />;
  }

  if (node.id === "images" && scenes.length > 0) {
    const withImage = scenes.filter((s) => s.imageUrl).length;
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Scenes" value={scenes.length} />
        <Stat label="Images ready" value={`${withImage}/${scenes.length}`} />
        <Stat label="Current scene" value={job.currentScene || "-"} />
      </div>
    );
  }

  return <p className="text-[13px] leading-relaxed text-text-secondary">{node.summary}</p>;
}

/**
 * Live detail for the stage the selected job is currently on. The canvas shows
 * where a job is; this shows what that stage is doing right now.
 */
export const NowRunningPanel = ({ job, jobId, states }) => {
  const navigate = useNavigate();

  if (!jobId || !job) {
    return (
      <Card>
        <CardHeader title="Current stage" subtitle="Pick a job from the queue or the selector to follow it" />
      </Card>
    );
  }

  const node = activeNode(states);
  const running = isJobRunning(job.status);
  const total = job.script?.scenes?.length || 0;
  const status = String(job.status || "").toUpperCase();

  if (!node) {
    return (
      <Card>
        <CardHeader
          title="Current stage"
          subtitle={status === "COMPLETED" ? "This job has finished" : "No stage is active for this job"}
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title={node.title}
        subtitle={node.tech}
        extra={
          <Button variant="outline" size="sm" icon={<ExternalLink className="size-3.5" />} onClick={() => navigate(`/render?id=${jobId}`)}>
            Open job
          </Button>
        }
      />
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-text-tertiary">
            <span>
              {states[node.id] === STATE.WAIT
                ? "Waiting"
                : states[node.id] === STATE.FAIL
                  ? "Stopped"
                  : total > 0 && job.currentScene
                    ? `Scene ${job.currentScene} of ${total}`
                    : "In progress"}
            </span>
            <span>Whole video</span>
          </div>
          <Progress percent={job.progress || 0} trickle={running} status={states[node.id] === STATE.FAIL ? "error" : "active"} />
        </div>

        {states[node.id] === STATE.FAIL && job.error && (
          <Alert type="error">{typeof job.error === "string" ? job.error : job.error?.message || "This step failed"}</Alert>
        )}

        <StageBody node={node} job={job} />
      </div>
    </Card>
  );
};

export default NowRunningPanel;
