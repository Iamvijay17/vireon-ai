import { Card, CardHeader } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Skeleton } from "../../components/ui/Skeleton";
import ErrorState from "../../components/ErrorState";
import { queueState, showCount } from "../analytics/controlCenterFormat";

const QUEUES = [
  { key: "video", name: "Video pipeline" },
  { key: "course", name: "Course lessons" },
];

const Stat = ({ label, value, hint }) => (
  <div>
    <p className="text-[11px] text-text-tertiary">{label}</p>
    <p className="tabular text-base font-semibold text-text-primary">{value}</p>
    {hint && <p className="text-[11px] text-text-tertiary">{hint}</p>}
  </div>
);

const QueueCard = ({ name, queue }) => {
  const state = queueState(queue);
  return (
    <div className="rounded-lg border border-border-light p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-text-primary">{name}</p>
        <Badge variant={state.tone}>{state.label}</Badge>
      </div>
      {queue?.available === false ? (
        <p className="mt-2 text-xs text-text-tertiary">The queue could not be read. Is Redis reachable?</p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="Queue length" value={queue.depth} hint={`${queue.waiting} waiting · ${queue.delayed} delayed`} />
          <Stat label="Active" value={queue.active} hint={`of ${queue.concurrency} slots`} />
          <Stat label="Workers" value={queue.workersOnline ?? "—"} />
          <Stat label="Completed" value={showCount(queue.completed)} />
          <Stat label="Failed" value={showCount(queue.failed)} />
        </div>
      )}
    </div>
  );
};

const DEPENDENCIES = [
  { key: "mongo", label: "Database" },
  { key: "redis", label: "Queue (Redis)" },
  { key: "storage", label: "Media storage" },
];

/** Job queues, connected workers (and any problem with them), and core dependencies. */
const QueuesPanel = ({ queues, workers, dependencies }) => (
  <Card className="overflow-hidden">
    <CardHeader title="Queues & workers" subtitle="Where jobs wait, and who is picking them up" />
    <div className="space-y-4 p-4">
      {queues.loading ? (
        <Skeleton className="h-28 w-full" />
      ) : queues.error || !queues.data ? (
        <ErrorState message="Queue counts unavailable" description={queues.error?.friendlyMessage || "The queue endpoint did not respond."} onRetry={queues.refetch} />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {QUEUES.map(({ key, name }) => (
            <QueueCard key={key} name={name} queue={queues.data[key]} />
          ))}
        </div>
      )}

      {workers.error ? (
        <p className="text-xs text-text-tertiary">Worker list unavailable.</p>
      ) : workers.data ? (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <p className="text-xs font-medium text-text-secondary">Workers</p>
            <Badge variant={workers.data.healthy ? "success" : "warning"}>{workers.data.healthy ? "Healthy" : "Needs attention"}</Badge>
          </div>
          {workers.data.workers.length === 0 ? (
            <p className="text-xs text-text-tertiary">No worker is connected. Jobs are accepted but wait until one starts.</p>
          ) : (
            <ul className="space-y-1.5">
              {workers.data.workers.map((w, i) => (
                <li key={`${w.queue}-${w.pid ?? i}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-secondary">
                  <span className="font-medium text-text-primary">{w.queue === "video-rendering" ? "Video" : "Course"}</span>
                  <span>{w.role}</span>
                  <span className="font-mono text-text-tertiary">{w.commit ? w.commit.slice(0, 7) : "no commit"}</span>
                  {w.pid != null && <span className="text-text-tertiary">pid {w.pid}</span>}
                  {w.stale && <Badge variant="warning">Older build than the API</Badge>}
                  {w.role === "unnamed" && <Badge variant="warning">Unidentified (old code)</Badge>}
                </li>
              ))}
            </ul>
          )}
          {workers.data.duplicates?.length > 0 && (
            <p className="mt-2 text-xs text-warning-600 dark:text-warning-500">
              Duplicate workers: {workers.data.duplicates.map((d) => `${d.key} ×${d.count}`).join(", ")}. An extra one is usually a process left over from a restart.
            </p>
          )}
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-xs font-medium text-text-secondary">Dependencies</p>
        <div className="flex flex-wrap gap-2">
          {DEPENDENCIES.map(({ key, label }) => {
            const ok = dependencies?.[key];
            return (
              <Badge key={key} variant={ok === true ? "success" : ok === false ? "danger" : "neutral"} dot>
                {label}: {ok === true ? "Up" : ok === false ? "Down" : "Unknown"}
              </Badge>
            );
          })}
        </div>
      </div>
    </div>
  </Card>
);

export default QueuesPanel;
