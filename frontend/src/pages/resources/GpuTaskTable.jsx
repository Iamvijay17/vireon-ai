import { Link } from "react-router-dom";
import { Cpu } from "lucide-react";
import { Card, CardHeader } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Table } from "../../components/ui/Table";
import EmptyState from "../../components/EmptyState";
import { formatElapsed } from "../../lib/format";
import { taskStatus, taskElapsedMs, SERVICE_LABELS } from "./resourceFormat";

const serviceName = (id) => SERVICE_LABELS[id]?.name || id;

const columns = [
  { key: "service", title: "Service", render: (t) => <span className="font-medium text-text-primary">{serviceName(t.service)}</span> },
  {
    key: "label",
    title: "Task",
    render: (t) => (
      <div className="min-w-0">
        <p className="truncate text-[13px] text-text-primary">{t.label || t.stage || "-"}</p>
        {t.jobId && (
          <Link to={`/render?id=${t.jobId}`} className="font-mono text-[11px] text-text-tertiary hover:text-accent-fg" onClick={(e) => e.stopPropagation()}>
            {t.jobId}
          </Link>
        )}
      </div>
    ),
  },
  {
    key: "status",
    title: "State",
    render: (t) => {
      const s = taskStatus(t);
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={s.variant}>{s.label}</Badge>
          {t.admittedUnderPressure && <Badge variant="warning">Low VRAM</Badge>}
          {t.attempts > 1 && <span className="text-[11px] text-text-tertiary">attempt {t.attempts}</span>}
        </div>
      );
    },
  },
  {
    key: "elapsed",
    title: "Time",
    align: "right",
    render: (t) => <span className="tabular">{formatElapsed(taskElapsedMs(t))}</span>,
  },
  { key: "priority", title: "Priority", align: "right", render: (t) => <span className="tabular text-text-tertiary">{t.priority}</span> },
];

/**
 * The GPU task ledger: what is running on the card, what is waiting for it,
 * and (below) what finished recently. It is read from the database that every
 * worker process writes to, so it is complete across processes.
 */
const GpuTaskTable = ({ tasks }) => {
  // Only an affirmative "available" counts: no data at all (the telemetry
  // request failed) must not read as an idle GPU.
  const available = tasks?.available === true;
  const active = tasks?.active ?? [];
  const recent = tasks?.recent ?? [];

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Cpu className="size-4 text-text-tertiary" /> GPU tasks
          </span>
        }
        subtitle={!available ? "The task ledger could not be read" : `${active.length} running or waiting${recent.length ? ` · ${recent.length} finished recently, below` : ""}`}
      />
      {!available ? (
        <EmptyState compact title="Task history unavailable" description="The database that records GPU tasks did not answer, so nothing is shown rather than a possibly wrong list." />
      ) : active.length === 0 ? (
        <EmptyState compact title="The GPU is idle" description="No task is running or waiting. Narration, scripts and images appear here while they use the card." />
      ) : (
        <Table columns={columns} data={active} rowKey="taskId" />
      )}
      {recent.length > 0 && (
        <details className="border-t border-border-light">
          <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-text-secondary hover:text-text-primary">Recently finished ({recent.length})</summary>
          <Table columns={columns} data={recent} rowKey="taskId" />
        </details>
      )}
    </Card>
  );
};

export default GpuTaskTable;
