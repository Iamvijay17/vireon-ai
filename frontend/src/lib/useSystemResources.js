import { useQuery } from "@tanstack/react-query";
import { getSystemResources } from "../services/api";
import { queryKeys } from "./queryClient";

/**
 * Measured host telemetry (GET /api/system/resources), polled while the page
 * is visible. Polling pauses in a background tab - there is nothing to watch
 * and every sample spawns nvidia-smi on the server.
 *
 * No retry and no toast: a failed read is the answer ("Unavailable"), shown
 * where the number would have been.
 */
export function useSystemResources({ pollMs = 5000, enabled = true } = {}) {
  const query = useQuery({
    queryKey: queryKeys.system.resources,
    queryFn: async () => (await getSystemResources()).data,
    refetchInterval: pollMs,
    refetchIntervalInBackground: false,
    staleTime: Math.max(1000, pollMs - 500),
    retry: false,
    enabled,
  });

  return {
    resources: query.data ?? null,
    loading: query.isLoading,
    error: query.error,
    // When the data on screen was actually measured - shown so stale numbers are recognisable.
    sampledAt: query.data?.sampledAt ?? null,
    refetch: query.refetch,
  };
}

export default useSystemResources;
