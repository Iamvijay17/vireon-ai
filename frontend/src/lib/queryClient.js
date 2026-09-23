import { QueryClient } from '@tanstack/react-query';

/**
 * Query keys in one place so an invalidation and the query it is meant to
 * refresh can't drift apart - the failure mode where a socket event fires,
 * an invalidation runs against a key nobody uses, and the UI silently keeps
 * showing stale data until the next manual refresh.
 *
 * Each key is a prefix: invalidating `jobs.all` refreshes every jobs list
 * regardless of page or filters, which is what a socket event ("something
 * about some job changed") can actually tell us.
 */
export const queryKeys = {
  jobs: {
    all: ['jobs'],
    list: (page, filters) => ['jobs', 'list', page, filters],
    detail: (type, id) => ['jobs', 'detail', type, id],
  },
  videos: {
    all: ['videos'],
    list: (page, filters) => ['videos', 'list', page, filters],
    detail: (id) => ['videos', 'detail', id],
  },
  audio: {
    all: ['audio'],
    history: (page) => ['audio', 'history', page],
  },
  courses: {
    all: ['courses'],
    list: (page, filters) => ['courses', 'list', page, filters],
    detail: (id) => ['courses', 'detail', id],
    videos: (courseId) => ['courses', courseId, 'videos'],
  },
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Sockets are the push channel; these defaults decide what happens
      // when a socket event is missed (dropped connection, an event the
      // backend doesn't emit yet) rather than being the primary mechanism.
      //
      // No refetchInterval here on purpose: interval polling is exactly
      // what this layer replaces. Screens that genuinely need a safety net
      // opt in per-query - see useJobs' `activePollMs`.
      staleTime: 30_000,
      // Cheap, and it is the moment a user is most likely to notice
      // staleness.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      // One retry: these are localhost calls, so a failure is usually the
      // backend being down, which retrying will not fix. Retrying harder
      // just delays the error state the user needs to see.
      retry: 1,
      // Keeps a revisited page rendering its last data while refetching,
      // instead of flashing a spinner over content that is probably still
      // correct.
      placeholderData: (previous) => previous,
    },
    mutations: {
      retry: 0,
    },
  },
});
