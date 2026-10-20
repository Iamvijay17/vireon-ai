import { useQuery } from "@tanstack/react-query";
import { getAnalyticsOverview, getSystemWorkers } from "../../services/api";
import { queryKeys } from "../../lib/queryClient";

/**
 * What the Create Video page can honestly tell you about the system before
 * you press the button - both read from the backend, neither invented:
 *
 *   workers    is a video worker connected? Without one the job is accepted
 *              and then simply waits in the queue.
 *   typical    how long recently completed videos actually took to generate
 *              (average of finished jobs - not a prediction for this video).
 *
 * A failed lookup yields `null` for that part, and the page says nothing
 * rather than guessing.
 */
export function useCreationReadiness() {
  const workersQuery = useQuery({
    queryKey: queryKeys.system.workers,
    queryFn: async () => (await getSystemWorkers()).data,
    staleTime: 30_000,
    retry: false,
  });

  const overviewQuery = useQuery({
    queryKey: queryKeys.analytics.overview(30),
    queryFn: async () => (await getAnalyticsOverview(30)).data,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const workers = workersQuery.data
    ? {
        videoOnline: (workersQuery.data.workers || []).filter((w) => w.queue === "video-rendering").length,
        healthy: workersQuery.data.healthy !== false,
      }
    : null;

  const summary = overviewQuery.data?.summary;
  const typical =
    summary && Number.isFinite(summary.avgGenerationTimeMs)
      ? {
          generationMs: summary.avgGenerationTimeMs,
          queueWaitMs: Number.isFinite(summary.avgQueueWaitMs) ? summary.avgQueueWaitMs : null,
          basedOn: summary.completedVideoJobs ?? null,
        }
      : null;

  return {
    workers,
    typical,
    loading: workersQuery.isLoading || overviewQuery.isLoading,
  };
}

export default useCreationReadiness;
