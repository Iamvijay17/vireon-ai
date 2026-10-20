import { Link } from "react-router-dom";
import { ArrowRight, Cpu } from "lucide-react";
import { Card, CardHeader } from "../../components/ui/Card";
import ResourceMeters from "../../components/ResourceMeters";
import { Skeleton } from "../../components/ui/Skeleton";
import { useSystemResources } from "../../lib/useSystemResources";

/** A glance at GPU / VRAM / RAM / CPU, plus what the GPU is doing, from live telemetry. */
const ResourcePanel = () => {
  const { resources, loading, error } = useSystemResources({ pollMs: 5000 });
  const running = resources?.gpuTasks?.active?.filter((t) => t.status === "running") ?? [];
  const queued = resources?.gpuTasks?.active?.filter((t) => t.status === "queued" || t.status === "retrying") ?? [];

  return (
    <Card className="flex flex-col">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Cpu className="size-4 text-text-tertiary" /> Resources
          </span>
        }
        subtitle={error ? "Telemetry unavailable" : "Measured on the machine running the API"}
      />
      <div className="p-4">
        {loading ? (
          <div className="grid grid-cols-2 gap-4" aria-hidden="true">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (
          <ResourceMeters resources={resources} columns="grid-cols-2" showGpuName={false} />
        )}

        {!loading && !error && resources?.gpuTasks?.available && (
          <p className="mt-4 text-xs text-text-tertiary">
            {running.length > 0
              ? `GPU task running: ${running.map((t) => t.label || t.service).join(", ")}`
              : "No GPU task running"}
            {queued.length > 0 && ` · ${queued.length} waiting`}
          </p>
        )}
        {error && <p className="mt-3 text-xs text-text-tertiary">The resources endpoint did not respond, so no readings are shown.</p>}
      </div>
      <Link
        to="/resources"
        className="mt-auto flex items-center justify-between border-t border-border-light px-4 py-2.5 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
      >
        GPU &amp; Resources
        <ArrowRight className="size-3.5" />
      </Link>
    </Card>
  );
};

export default ResourcePanel;
