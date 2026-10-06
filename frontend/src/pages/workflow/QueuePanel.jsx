import { Card, CardHeader } from "../../components/ui/Card";
import { Progress } from "../../components/ui/Progress";
import { cn } from "../../components/ui/cn";
import { StatusTag } from "../../components";
import { buildQueue, waitReason, STAGE_PHRASE } from "./queue";

const Row = ({ job, selected, onPick, index, note, running }) => (
  <button
    type="button"
    onClick={() => onPick(job.id)}
    aria-pressed={selected}
    className={cn(
      "w-full cursor-pointer rounded-xl border p-3 text-left transition-colors",
      selected ? "border-accent bg-accent/5" : "border-border-light hover:border-border hover:bg-surface-hover"
    )}
  >
    <div className="flex items-center gap-2">
      {index != null && (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-hover text-[11px] font-semibold text-text-secondary">
          {index}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary">{job.title || job.id}</span>
    </div>
    <div className={cn("mt-1.5", index != null && "pl-7")}>
      <StatusTag status={job.status} />
    </div>
    {running && (
      <Progress percent={job.progress || 0} size="sm" trickle className="mt-2" />
    )}
    {note && <p className={cn("mt-1.5 text-xs text-text-tertiary", index != null && "pl-7")}>{note}</p>}
  </button>
);

const Group = ({ title, children }) => (
  <div>
    <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-text-tertiary uppercase">{title}</p>
    <div className="flex flex-col gap-2">{children}</div>
  </div>
);

/**
 * Who the worker is on, who is next, and who is waiting on a person.
 * "Up next" is oldest-first, which approximates (not guarantees) the
 * worker's real order - see buildQueue.
 */
export const QueuePanel = ({ jobs, selectedJobId, onPick }) => {
  const { running, waiting, approval } = buildQueue(jobs);
  const empty = running.length + waiting.length + approval.length === 0;

  return (
    <Card className="h-fit">
      <CardHeader
        title="Queue"
        subtitle={empty ? "Nothing in progress" : `${running.length} running · ${waiting.length} waiting`}
      />
      <div className="flex max-h-[420px] flex-col gap-4 overflow-y-auto p-4">
        {empty && <p className="text-[13px] text-text-tertiary">New video requests will show up here.</p>}

        {running.length > 0 && (
          <Group title="Running now">
            {running.map((job) => (
              <Row
                key={job.id}
                job={job}
                running
                selected={job.id === selectedJobId}
                onPick={onPick}
                note={STAGE_PHRASE[String(job.status).toUpperCase()]}
              />
            ))}
          </Group>
        )}

        {waiting.length > 0 && (
          <Group title="Up next">
            {waiting.map((job, i) => (
              <Row
                key={job.id}
                job={job}
                index={i + 1}
                selected={job.id === selectedJobId}
                onPick={onPick}
                note={waitReason(job, running)}
              />
            ))}
          </Group>
        )}

        {approval.length > 0 && (
          <Group title="Needs your approval">
            {approval.map((job) => (
              <Row
                key={job.id}
                job={job}
                selected={job.id === selectedJobId}
                onPick={onPick}
                note="Review and approve the script to continue"
              />
            ))}
          </Group>
        )}
      </div>
    </Card>
  );
};

export default QueuePanel;
