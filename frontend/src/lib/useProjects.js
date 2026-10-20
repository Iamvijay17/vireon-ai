import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getVideoJobs, getCourses } from "../services/api";
import { queryKeys } from "./queryClient";
import { videoToProject, courseToProject } from "./projectModel";
import { jobPhase } from "./jobStatus";

const EMPTY = [];
const NO_PAGINATION = { total: 0 };

/**
 * Video jobs and courses as one list of projects.
 *
 * Two independent queries - cached and invalidated under their own keys, so a
 * course event does not refetch the video jobs beside it. `search` is applied
 * by the server (so it reaches projects beyond the loaded page); status, kind
 * and sort are applied to what is loaded. `limit` caps each list; `total`
 * says how many exist, so the page can offer "load more" instead of silently
 * hiding the rest.
 */
export function useProjects({ search = "", limit = 100 } = {}) {
  const filters = { limit, search: search || undefined };

  const videos = useQuery({
    queryKey: queryKeys.videos.list(1, { ...filters, scope: "projects" }),
    queryFn: async () => (await getVideoJobs(1, limit, { search: filters.search })).data,
    // A running job should not freeze on the page; sockets cover it, this is
    // the safety net, and only while something is in flight.
    refetchInterval: (q) => {
      const jobs = q.state.data?.jobs ?? EMPTY;
      return jobs.some((j) => ["running", "queued"].includes(jobPhase(j.status))) ? 15_000 : false;
    },
  });

  const courses = useQuery({
    queryKey: queryKeys.courses.list(1, { ...filters, scope: "projects" }),
    queryFn: async () => (await getCourses(1, limit, { search: filters.search })).data,
  });

  const projects = useMemo(
    () => [...(videos.data?.jobs ?? EMPTY).map(videoToProject), ...(courses.data?.courses ?? EMPTY).map(courseToProject)],
    [videos.data, courses.data]
  );

  const totals = {
    videos: (videos.data?.pagination ?? NO_PAGINATION).total,
    courses: (courses.data?.pagination ?? NO_PAGINATION).total,
  };

  return {
    projects,
    totals,
    // Whether more exist on the server than are loaded.
    truncated: totals.videos > (videos.data?.jobs?.length ?? 0) || totals.courses > (courses.data?.courses?.length ?? 0),
    loading: videos.isLoading || courses.isLoading,
    refreshing: (videos.isFetching || courses.isFetching) && !(videos.isLoading || courses.isLoading),
    // Either list failing is surfaced - a half-empty page must not look complete.
    error: videos.error || courses.error || null,
    failed: { videos: Boolean(videos.error), courses: Boolean(courses.error) },
    refetch: () => Promise.all([videos.refetch(), courses.refetch()]),
  };
}

export default useProjects;
