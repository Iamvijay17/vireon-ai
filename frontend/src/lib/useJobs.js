import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getJobs, getJob, getVideoJobs } from '../services/api';
import { queryKeys } from './queryClient';

/**
 * The jobs console's data, as one hook.
 *
 * Replaces: a `fetchJobs(page, silent)` function, four pieces of local
 * state (`jobs`, `loading`, `pagination`, plus a `silent` flag whose only
 * job was to stop the poll from flashing a spinner), a `useRef` interval,
 * and the effect that started and stopped it.
 *
 * `activePollMs` is the deliberate exception to "sockets, not polling":
 * jobs progress through steps that don't all emit events, so an active job
 * still gets a slow safety-net refetch. It is off entirely when nothing is
 * running, which is the common case and where the old unconditional
 * interval wasted the most work.
 *
 * `isActive(job)` decides what "running" means; the caller owns that
 * because status vocabularies differ between job types (see
 * lib/statusTone.js's classifyStatus).
 */
export function useJobs({ page = 1, limit = 20, filters = {}, isActive, activePollMs = 10_000 } = {}) {
  const query = useQuery({
    queryKey: queryKeys.jobs.list(page, filters),
    queryFn: async () => {
      const res = await getJobs(page, limit, filters);
      return {
        jobs: res.data.jobs || [],
        pagination: res.data.pagination || { page, total: 0, pages: 0 },
      };
    },
    // Function form so the decision reads the data this query just
    // produced. Deriving "is anything running" in the component instead
    // would need it one render before the rows it depends on exist.
    refetchInterval: (query) => {
      const jobs = query.state.data?.jobs ?? [];
      return jobs.some((job) => isActive?.(job)) ? activePollMs : false;
    },
    // Keep the safety net running when the tab is backgrounded only while
    // something is actually in flight - a long render finishing while the
    // user is elsewhere should be visible when they come back.
    refetchIntervalInBackground: false,
  });

  return {
    jobs: query.data?.jobs ?? [],
    pagination: query.data?.pagination ?? { page, total: 0, pages: 0 },
    // `isLoading` is only the first load; a background refetch must not put
    // the page back into a skeleton state. That distinction is what the old
    // `silent` parameter was hand-rolling.
    loading: query.isLoading,
    refreshing: query.isFetching && !query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * One job's detail, fetched only once a row is actually opened.
 * `enabled` keeps the drawer's query from firing for a closed drawer.
 */
export function useJobDetail(type, id, { enabled = true } = {}) {
  const query = useQuery({
    queryKey: queryKeys.jobs.detail(type, id),
    queryFn: async () => {
      const res = await getJob(type, id);
      return {
        job: res.data.job,
        logs: res.data.logs || [],
        lessons: res.data.lessons || [],
      };
    },
    enabled: Boolean(enabled && type && id),
  });

  return {
    detail: query.data,
    loading: query.isLoading,
    error: query.error,
  };
}

/**
 * The video-jobs list, for views that show only the render pipeline
 * (/render's queue) rather than the cross-type console.
 *
 * Same safety-net rule as useJobs: per-job progress is only pushed to
 * sockets that joined that job's room (see SocketService.emitJobProgress),
 * so a page showing many jobs without joining any of their rooms genuinely
 * does need a fallback refetch - but only while something is rendering.
 */
export function useVideoJobs({ page = 1, limit = 100, isActive, activePollMs = 10_000 } = {}) {
  const query = useQuery({
    queryKey: queryKeys.videos.list(page, { limit }),
    queryFn: async () => {
      const res = await getVideoJobs(page, limit);
      return res.data.jobs || [];
    },
    refetchInterval: (query) => {
      const jobs = query.state.data ?? [];
      return jobs.some((job) => isActive?.(job)) ? activePollMs : false;
    },
    refetchIntervalInBackground: false,
  });

  return {
    jobs: query.data ?? [],
    loading: query.isLoading,
    refreshing: query.isFetching && !query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Invalidate every jobs query after a mutation (cancel/retry/delete, single
 * or bulk). Call this instead of re-running a fetch by hand, so a list, a
 * detail drawer and any other mounted view all update from one call.
 */
export function useInvalidateJobs() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.videos.all });
  };
}
