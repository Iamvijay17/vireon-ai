import { useQuery } from "@tanstack/react-query";
import { getAiServices, getSystemWorkers, getControlCenter } from "../../services/api";
import { queryKeys } from "../../lib/queryClient";
import { useSystemResources } from "../../lib/useSystemResources";

/**
 * Everything the GPU & Resources page shows, from four independent reads.
 * They are kept separate on purpose: one failing (say, Redis down so the queue
 * counts are unreadable) must blank only its own panel, never the whole page.
 * All of them pause while the tab is hidden.
 */
export function useResourcesData() {
  const resources = useSystemResources({ pollMs: 3000 });

  const services = useQuery({
    queryKey: queryKeys.system.aiServices,
    queryFn: async () => (await getAiServices()).data,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
    retry: false,
  });

  const workers = useQuery({
    queryKey: queryKeys.system.workers,
    queryFn: async () => (await getSystemWorkers()).data,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    retry: false,
  });

  // Queue depth and worker counts live in the control center (persisted + BullMQ).
  const queues = useQuery({
    queryKey: queryKeys.analytics.controlCenter(1),
    queryFn: async () => (await getControlCenter(1)).data,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
    staleTime: 5000,
    retry: false,
  });

  return {
    resources,
    services: { data: services.data ?? null, loading: services.isLoading, error: services.error, refetch: services.refetch },
    workers: { data: workers.data ?? null, loading: workers.isLoading, error: workers.error, refetch: workers.refetch },
    queues: { data: queues.data?.workers ?? null, loading: queues.isLoading, error: queues.error, refetch: queues.refetch },
    refetchAll: () => {
      resources.refetch();
      services.refetch();
      workers.refetch();
      queues.refetch();
    },
  };
}

export default useResourcesData;
