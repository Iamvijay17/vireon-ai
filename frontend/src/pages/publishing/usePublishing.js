import { useCallback, useEffect, useState } from "react";
import { useApiQuery } from "../../lib/useApiQuery";
import { queryKeys } from "../../lib/queryClient";
import { toast } from "../../components/ui/toastBus";
import { connect, onPublishingJobUpdated } from "../../services/socket";
import {
  getPublishingCapabilities, getPublishingAccounts, getPublishingJobs, getPublishingJob,
  getPublishingLessons, getPublishingVideos, getUdemyOverview, getCourses,
} from "../../services/api";
import { isActiveStatus } from "./format";

// Safety net only: sockets push changes (lib/useSocketQuerySync.js) and invalidate these
// queries. This covers a missed event while something is actually in flight.
const ACTIVE_POLL_MS = 15000;

export const usePublishingCapabilities = () =>
  useApiQuery(queryKeys.publishing.capabilities, getPublishingCapabilities, { errorMessage: "Failed to load publishing status" });

export const usePublishingAccounts = () =>
  useApiQuery(queryKeys.publishing.accounts, getPublishingAccounts, { errorMessage: "Failed to load connected accounts" });

export const usePublishingCourses = () =>
  useApiQuery(queryKeys.courses.list(1, { limit: 100 }), () => getCourses(1, 100), { errorMessage: "Failed to load courses" });

export const usePublishingLessons = (courseId) =>
  useApiQuery(queryKeys.publishing.lessons(courseId), () => getPublishingLessons(courseId), {
    enabled: Boolean(courseId),
    errorMessage: "Failed to load lessons",
  });

export const usePublishingVideos = (enabled = true) =>
  useApiQuery(queryKeys.publishing.videos, getPublishingVideos, { enabled, errorMessage: "Failed to load videos" });

export const usePublishingJob = (jobId) =>
  useApiQuery([...queryKeys.publishing.all, "job", jobId], () => getPublishingJob(jobId), {
    enabled: Boolean(jobId),
    select: (data) => data.job,
    errorMessage: "Failed to load the publishing job",
  });

export const usePublishingJobs = (params) =>
  useApiQuery(queryKeys.publishing.jobs(params), () => getPublishingJobs(params), {
    errorMessage: "Failed to load publishing jobs",
    refetchInterval: (query) => (query.state.data?.jobs?.some((j) => isActiveStatus(j.status)) ? ACTIVE_POLL_MS : false),
  });

export const useUdemyOverview = (courseId) =>
  useApiQuery(queryKeys.publishing.udemy(courseId), () => getUdemyOverview(courseId), {
    enabled: Boolean(courseId),
    errorMessage: "Failed to load the Udemy export overview",
  });

/**
 * Latest socket summary per job id. Layered over the fetched rows so a progress
 * bar moves the instant a chunk lands, without waiting for a refetch.
 */
export function useLiveJobs() {
  const [live, setLive] = useState({});
  useEffect(() => {
    connect();
    return onPublishingJobUpdated((payload) => {
      if (payload?.jobId) setLive((prev) => ({ ...prev, [payload.jobId]: payload }));
    });
  }, []);
  return live;
}

/**
 * Tracks which actions are in flight (so each button shows its own spinner
 * and cannot be double-clicked) and turns failures into one toast with the
 * server's own explanation.
 */
export function useBusy() {
  const [busy, setBusy] = useState(() => new Set());
  const run = useCallback(async (key, action, { success, onError } = {}) => {
    setBusy((prev) => new Set(prev).add(key));
    try {
      const result = await action();
      if (success) toast.success(typeof success === "function" ? success(result) : success);
      return result;
    } catch (err) {
      toast.error(err?.friendlyMessage || err?.message || "Something went wrong");
      onError?.(err);
      return undefined;
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, []);
  return { isBusy: (key) => busy.has(key), run };
}
