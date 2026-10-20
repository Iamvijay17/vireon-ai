import { useQuery } from "@tanstack/react-query";
import { getAnalyticsOverview } from "../../services/api";
import { queryKeys } from "../../lib/queryClient";

/**
 * Persisted totals for the Overview (all read from the analytics overview, not
 * counted from the page of jobs on screen):
 *
 *   totalVideoJobs / completedVideoJobs / failedVideoJobs / activeVideoJobs
 *   jobSuccessRate, avgGenerationTimeMs, totalStorageBytes, recentFailures
 *
 * A null figure means there is no data behind it (e.g. no finished job to
 * average) and is shown as an em dash, never 0.
 */
export function useOverview() {
  const query = useQuery({
    queryKey: queryKeys.analytics.overview(30),
    queryFn: async () => (await getAnalyticsOverview(30)).data,
    staleTime: 60_000,
    retry: 1,
  });

  return {
    summary: query.data?.summary ?? null,
    recentFailures: query.data?.recentFailures ?? [],
    worker: query.data?.worker ?? null,
    storageByCategory: query.data?.storageByCategory ?? [],
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export default useOverview;
