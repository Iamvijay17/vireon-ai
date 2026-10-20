import { useQuery } from "@tanstack/react-query";
import { getControlCenter } from "../../services/api";
import { queryKeys } from "../../lib/queryClient";

const WINDOW_DAYS = 7;

/**
 * The strip above the jobs table. Everything here is measured, and each figure
 * keeps its own scope so nothing reads as more than it is:
 *
 *   queue.depth / queue.active   live BullMQ counts (right now)
 *   awaitingPerson, failed       video jobs created in the last 7 days
 *
 * `queue` is null when Redis could not be read - the tiles then say so
 * instead of showing an empty queue.
 */
export function useJobsSummary() {
  const query = useQuery({
    queryKey: queryKeys.analytics.controlCenter(WINDOW_DAYS),
    queryFn: async () => (await getControlCenter(WINDOW_DAYS)).data,
    staleTime: 15_000,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    retry: false,
  });

  const queue = query.data?.workers?.video;
  return {
    windowDays: WINDOW_DAYS,
    videos: query.data?.videos ?? null,
    queue: queue && queue.available !== false ? queue : null,
    loading: query.isLoading,
    error: query.error,
  };
}

export default useJobsSummary;
