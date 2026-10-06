import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { PageHeader, StatusTag } from "../../components";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { useJobs } from "../../lib/useJobs";
import { queryKeys } from "../../lib/queryClient";
import { getVideoJob } from "../../services/api";
import { useWorkflowJobLive } from "./useWorkflowJobLive";
import { QueuePanel } from "./QueuePanel";
import { NowRunningPanel } from "./NowRunningPanel";
import { isTerminal } from "./queue";
import { NODES, STAGE_COLOR, nodeStates } from "./graph";
import { Canvas } from "./Canvas";
import { Inspector } from "./Inspector";

const STAGE_LEGEND = [
  ["script", "Script"], ["voice", "Voice"], ["render", "Render"], ["publish", "Publish"],
];

/**
 * Workflow: the render pipeline drawn as a node canvas.
 *
 * Looks like a workflow editor but is a *view* of our own fixed pipeline
 * (see ./graph.js), not an editor - nodes can't be rewired because the
 * worker runs one hard-coded sequence. Pick a job and the same canvas
 * becomes a live run view: every node takes that job's state and updates
 * over the socket.
 */
const WorkflowPage = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const jobId = params.get("job") || "";
  const [selectedId, setSelectedId] = useState(null);

  useWorkflowJobLive(jobId || null);

  // isActive turns on the safety-net refetch while anything is unfinished, so
  // the queue stays current for jobs whose rooms this page has not joined.
  const { jobs } = useJobs({
    page: 1,
    limit: 30,
    filters: { type: "video" },
    isActive: (j) => !isTerminal(j),
  });

  const { data: job } = useQuery({
    queryKey: queryKeys.videos.detail(jobId),
    queryFn: async () => (await getVideoJob(jobId)).data.job,
    enabled: Boolean(jobId),
  });

  const states = useMemo(() => nodeStates(jobId ? job : null), [job, jobId]);
  const selected = NODES.find((n) => n.id === selectedId) || null;

  const options = useMemo(
    () => [{ value: "", label: "Blueprint (no job)" }, ...jobs.map((j) => ({ value: j.id, label: j.title || j.id }))],
    [jobs]
  );

  const pickJob = (value) => {
    const next = new URLSearchParams(params);
    if (value) next.set("job", value);
    else next.delete("job");
    setParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="Workflow"
        description="Every step a video goes through. Pick a job to watch it move through the graph live."
        extra={
          <>
            <Select value={jobId} onChange={pickJob} options={options} className="w-full sm:w-72" />
            {jobId && (
              <Button variant="outline" icon={<ExternalLink className="size-4" />} onClick={() => navigate(`/render?id=${jobId}`)}>
                Open job
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Card className="relative h-[calc(100vh-17rem)] min-h-[460px] overflow-hidden">
            <Canvas states={states} selectedId={selectedId} onSelect={setSelectedId} />

            {job && jobId && (
              <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 rounded-lg border border-border bg-surface/90 px-2.5 py-1.5 backdrop-blur">
                <StatusTag status={job.status} />
                <span className="max-w-[220px] truncate text-[13px] font-medium text-text-primary">{job.title || job.topic}</span>
              </div>
            )}

            {selected && <Inspector node={selected} state={states[selected.id]} onClose={() => setSelectedId(null)} />}
          </Card>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-tertiary">
            {STAGE_LEGEND.map(([id, label]) => (
              <span key={id} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: STAGE_COLOR[id] }} />
                {label}
              </span>
            ))}
            <span className="hidden h-3 w-px bg-border sm:block" />
            <span>Scroll to zoom · drag to pan · click a step for details</span>
          </div>

          <div className="mt-4">
            <NowRunningPanel job={jobId ? job : null} jobId={jobId} states={states} />
          </div>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <QueuePanel jobs={jobs} selectedJobId={jobId} onPick={pickJob} />
        </aside>
      </div>
    </div>
  );
};

export default WorkflowPage;
