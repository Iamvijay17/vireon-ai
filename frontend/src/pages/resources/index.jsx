import { RefreshCw } from "lucide-react";
import { PageHeader } from "../../components";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import ErrorState from "../../components/ErrorState";
import ResourceMeters from "../../components/ResourceMeters";
import { relativeTime } from "../../lib/relativeTime";
import { useResourcesData } from "./useResourcesData";
import { gpuHeadline } from "./resourceFormat";
import GpuTaskTable from "./GpuTaskTable";
import ServicesPanel from "./ServicesPanel";
import SchedulerPanel from "./SchedulerPanel";
import QueuesPanel from "./QueuesPanel";

/**
 * GPU & Resources: measured load on the machine that runs the pipeline, what
 * the GPU is doing, the state of the local AI services, the scheduler that
 * shares the card between them, and the queues and workers behind it.
 *
 * Every number is read from the server (nvidia-smi, the OS, the task ledger,
 * the queues). A reading that could not be taken is "Unavailable"; nothing is
 * estimated or animated to look alive.
 */
const ResourcesPage = () => {
  const { resources, services, workers, queues, refetchAll } = useResourcesData();
  const data = resources.resources;
  const failed = resources.error && !data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="GPU & Resources"
        description="Live load on the machine running the pipeline. Figures refresh every few seconds while this page is open."
        meta={data?.sampledAt && <span className="text-xs text-text-tertiary">Sampled {relativeTime(data.sampledAt)}</span>}
        extra={
          <Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={refetchAll}>
            Refresh
          </Button>
        }
      />

      <Card>
        <CardHeader
          title="Machine load"
          subtitle={data ? gpuHeadline(data, services.data?.gpu) : failed ? "Telemetry unavailable" : undefined}
        />
        <div className="p-4">
          {resources.loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : failed ? (
            <ErrorState
              message="Resource telemetry is unavailable"
              description={`${resources.error.friendlyMessage || resources.error.message}. No readings are shown rather than guesses.`}
              onRetry={resources.refetch}
            />
          ) : (
            <ResourceMeters resources={data} columns="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" />
          )}
          {data && !data.gpu && (
            <p className="mt-4 text-xs text-text-tertiary">
              No NVIDIA GPU was reported (nvidia-smi is missing or the driver is down), so GPU load, VRAM and temperature are unavailable. CPU and memory are still measured.
            </p>
          )}
        </div>
      </Card>

      <GpuTaskTable tasks={data?.gpuTasks} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ServicesPanel services={services} />
        <SchedulerPanel services={services} />
      </div>

      <QueuesPanel queues={queues} workers={workers} dependencies={data?.dependencies} />
    </div>
  );
};

export default ResourcesPage;
