import { AlertTriangle, Clock } from "lucide-react";
import { EmptyState } from "../../components";
import { Badge } from "../../components/ui/Badge";
import { ChartCard } from "./ChartCard";

/** Latest failed video jobs and course video stages, newest first. */
export function RecentFailures({ failures }) {
  return (
    <ChartCard
      icon={AlertTriangle}
      title="Recent Failures"
      subtitle="Latest failed video jobs and course video stages"
      extra={failures.length > 0 && <Badge variant="danger">{failures.length}</Badge>}
      stagger={18}
      className="mt-4"
      bodyClassName="p-2"
    >
      {failures.length === 0 ? (
        <EmptyState description="No failures — everything is running smoothly." />
      ) : (
        <div className="divide-y divide-border-light">
          {failures.map((f) => (
            <div key={`${f.source}-${f.id}`} className="flex items-start gap-3 px-3 py-2">
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-danger-500/10 text-danger-600 dark:text-danger-500">
                <AlertTriangle className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium text-text-primary">{f.title}</p>
                  <Badge variant="neutral">{f.source === "videoJob" ? "Video Job" : "Course Video"}</Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-text-tertiary">{f.subtitle}</p>
                <p className="mt-1 text-xs text-danger-600 dark:text-danger-500">{f.message}</p>
              </div>
              <div className="shrink-0 text-right text-xs text-text-tertiary">
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {new Date(f.occurredAt).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </ChartCard>
  );
}
