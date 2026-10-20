import { AlertTriangle, CheckCircle2, Clock, Pencil } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/Skeleton";
import { formatDuration } from "../../lib/format";
import { buildSummary } from "./summary";

const Row = ({ label, value, long }) => (
  <div className={long ? "grid gap-0.5 py-2" : "flex items-baseline justify-between gap-4 py-2"}>
    <dt className="shrink-0 text-xs text-text-tertiary">{label}</dt>
    <dd className={long ? "text-[13px] leading-relaxed text-text-primary" : "min-w-0 truncate text-right text-[13px] text-text-primary"} title={typeof value === "string" ? value : undefined}>
      {value}
    </dd>
  </div>
);

/** What the system can say about the run before it starts - only real readings. */
export function Readiness({ readiness, compact = false }) {
  const { workers, typical, loading } = readiness;

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }

  const items = [];
  if (workers) {
    items.push(
      workers.videoOnline > 0
        ? { tone: "ok", text: `${workers.videoOnline} video worker${workers.videoOnline === 1 ? "" : "s"} connected` }
        : { tone: "warn", text: "No video worker is connected. The job will be accepted and wait in the queue until one starts." }
    );
  }
  if (typical) {
    const basis = typical.basedOn ? ` (average of ${typical.basedOn} finished video${typical.basedOn === 1 ? "" : "s"})` : "";
    items.push({
      tone: "info",
      text: `Recent videos took about ${formatDuration(typical.generationMs)} of working time to generate${basis}. Yours depends on length, size and quality.`,
    });
  }

  if (items.length === 0) {
    return <p className="text-xs text-text-tertiary">{compact ? "System status unavailable." : "System status could not be read, so no estimate is shown."}</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.text} className="flex items-start gap-2 text-xs leading-relaxed text-text-secondary">
          {item.tone === "ok" && <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success-500" />}
          {item.tone === "warn" && <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning-500" />}
          {item.tone === "info" && <Clock className="mt-0.5 size-3.5 shrink-0 text-text-tertiary" />}
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Step 4: every choice in one place, with a way back to change any of them. */
export function ReviewStep({ values, voiceOptions, readiness, onEdit }) {
  const groups = buildSummary(values, voiceOptions);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {groups.map((group, i) => (
          <Card key={group.key} className={i === 0 ? "p-5 lg:col-span-2" : "p-5"}>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">{group.title}</h2>
              <Button variant="ghost" size="xs" icon={<Pencil className="size-3" />} onClick={() => onEdit(group.step)}>
                Edit
              </Button>
            </div>
            <dl className="divide-y divide-border-light">
              {group.rows.map((row) => (
                <Row key={row.label} {...row} />
              ))}
            </dl>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Before you start</h2>
        <Readiness readiness={readiness} />
        <p className="mt-3 text-xs text-text-tertiary">
          Starting creates the job and queues it. You can follow it live, stop it, or edit its details from its progress page.
        </p>
      </Card>
    </div>
  );
}
