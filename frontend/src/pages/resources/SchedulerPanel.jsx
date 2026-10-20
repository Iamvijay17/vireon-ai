import { Card, CardHeader } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { DescriptionList } from "../../components/ui/DescriptionList";
import { Skeleton } from "../../components/ui/Skeleton";
import { formatMb, formatElapsed } from "../../lib/format";
import { SERVICE_LABELS, breakerState } from "./resourceFormat";

/**
 * Scheduler policy and per-service circuit breakers. The policy and breakers
 * are this API process's own view; GPU tasks themselves run in the worker
 * processes (see the task table), so the live queue is not read from here.
 */
const SchedulerPanel = ({ services }) => {
  const { data, loading, error } = services;
  const gpu = data?.gpu;
  const scheduler = gpu?.scheduler;
  const policy = scheduler?.policy;
  const breakers = Object.entries(scheduler?.breakers || {});
  const waiting = scheduler?.global;

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Scheduler" subtitle="How GPU work is admitted" />
      {loading ? (
        <div className="p-4">
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error || !gpu ? (
        <p className="p-4 text-[13px] text-text-tertiary">Scheduler state is unavailable.</p>
      ) : !scheduler ? (
        <p className="p-4 text-[13px] text-text-tertiary">The GPU scheduler is switched off (GPU_SCHEDULER=false); GPU work runs one service at a time without a queue.</p>
      ) : (
        <div className="space-y-4 p-4">
          <DescriptionList
            items={[
              { label: "Coordination", value: gpu.coordinator === "redis" ? "Across processes (Redis)" : "This process only" },
              { label: "Concurrent GPU services", value: gpu.maxConcurrent },
              { label: "Mode", value: gpu.mode },
              { label: "VRAM admission", value: policy?.vramAdmission ? "On" : "Off" },
              { label: "VRAM budget", value: policy?.budgetMb != null ? `${formatMb(policy.budgetMb)} (a configured estimate)` : "—" },
              ...(policy?.affinityWindowMs != null ? [{ label: "Keep-warm window", value: formatElapsed(policy.affinityWindowMs) }] : []),
            ]}
          />

          {breakers.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-text-secondary">Circuit breakers</p>
              <ul className="space-y-2">
                {breakers.map(([service, breaker]) => {
                  const b = breakerState(breaker);
                  return (
                    <li key={service} className="flex flex-wrap items-center gap-2 text-[13px]">
                      <span className="w-32 text-text-secondary">{SERVICE_LABELS[service]?.name || service}</span>
                      <Badge variant={b.variant}>{b.label}</Badge>
                      {b.failures > 0 && <span className="text-xs text-text-tertiary">{b.failures} consecutive failure{b.failures === 1 ? "" : "s"}</span>}
                      {b.retryInMs && <span className="text-xs text-text-tertiary">retries in {formatElapsed(b.retryInMs)}</span>}
                      {b.lastError && <span className="w-full truncate text-xs text-danger-500" title={b.lastError}>{b.lastError}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {Array.isArray(waiting) && (
            <p className="text-xs text-text-tertiary">
              {waiting.length === 0 ? "Nothing is waiting in the cross-process GPU line." : `${waiting.length} task${waiting.length === 1 ? " is" : "s are"} waiting in the cross-process GPU line.`}
            </p>
          )}
        </div>
      )}
    </Card>
  );
};

export default SchedulerPanel;
