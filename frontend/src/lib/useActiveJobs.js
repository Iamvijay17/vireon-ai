import { useQuery } from "@tanstack/react-query";
import { getVideoJobs } from "../services/api";
import { queryKeys } from "./queryClient";
import { jobPhase } from "./jobStatus";

const FEED_SIZE = 30;
// Safety net only: socket events invalidate this query (see useSocketQuerySync),
// and it stops entirely once nothing is running or queued.
const POLL_MS = 15_000;

const EMPTY = [];

/**
 * What the pipeline is doing right now, for the top bar: running, queued and
 * waiting-for-you video jobs among the most recent ones. It looks at the
 * newest FEED_SIZE jobs only, so "count" is a floor on very busy systems -
 * the Generation Jobs page is the complete view.
 */
export function useActiveJobs() {
  const query = useQuery({
    queryKey: queryKeys.videos.activity,
    queryFn: async () => (await getVideoJobs(1, FEED_SIZE)).data.jobs ?? EMPTY,
    refetchInterval: (q) => {
      const jobs = q.state.data ?? EMPTY;
      return jobs.some((j) => ["running", "queued"].includes(jobPhase(j.status))) ? POLL_MS : false;
    },
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });

  const jobs = query.data ?? EMPTY;
  const running = jobs.filter((j) => jobPhase(j.status) === "running");
  const queued = jobs.filter((j) => jobPhase(j.status) === "queued");
  const waiting = jobs.filter((j) => jobPhase(j.status) === "waiting");

  return { jobs, running, queued, waiting, loading: query.isLoading, error: query.error };
}

export default useActiveJobs;
