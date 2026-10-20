import { CheckCircle2, Hourglass, ListOrdered, Loader2, XCircle } from "lucide-react";
import { StatTile } from "../../components/ui/StatTile";
import { useJobsSummary } from "./useJobsSummary";

/** Queue depth, what is running, what waits on you, and recent outcomes - each with its scope stated. */
export function JobsSummary({ onFilter }) {
  const { videos, queue, loading, windowDays } = useJobsSummary();
  const queueNote = "Queue unavailable (Redis not reachable)";

  return (
    <section aria-label="Pipeline summary" className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <StatTile
        label="Waiting in queue"
        icon={ListOrdered}
        loading={loading}
        value={queue ? queue.depth : null}
        hint={queue ? (queue.workersOnline === 0 ? "No worker online" : `${queue.delayed} delayed`) : queueNote}
      />
      <StatTile
        label="Running now"
        icon={Loader2}
        tone="accent"
        loading={loading}
        value={queue ? queue.active : null}
        hint={queue ? `of ${queue.concurrency} worker slots` : queueNote}
        onClick={() => onFilter("processing")}
      />
      <StatTile
        label="Waiting on you"
        icon={Hourglass}
        tone={videos?.awaitingPerson ? "warning" : "neutral"}
        loading={loading}
        value={videos?.awaitingPerson}
        hint={`Paused for approval · last ${windowDays} days`}
      />
      <StatTile
        label="Completed"
        icon={CheckCircle2}
        tone="success"
        loading={loading}
        value={videos?.successful}
        hint={videos?.successRate != null ? `${videos.successRate}% success · last ${windowDays} days` : `Last ${windowDays} days`}
        onClick={() => onFilter("success")}
      />
      <StatTile
        label="Failed"
        icon={XCircle}
        tone={videos?.failed ? "danger" : "neutral"}
        loading={loading}
        value={videos?.failed}
        hint={`Last ${windowDays} days`}
        onClick={() => onFilter("error")}
      />
    </section>
  );
}
