import { useEffect, useState } from "react";
import { useApiQuery } from "../../lib/useApiQuery";
import { queryKeys } from "../../lib/queryClient";
import { connect, onSocialPostUpdated } from "../../services/socket";
import {
  getSocialCapabilities, getSocialOverview, getSocialAccounts, getSocialLibrary, getCampaign, getSocialPosts,
  getSocialCalendar, getSocialAnalytics,
} from "../../services/api";
import { isActiveStatus } from "./format";

export { useBusy } from "../publishing/usePublishing";

// Safety net only: sockets push changes (lib/useSocketQuerySync.js) and invalidate these queries.
// This covers a missed event while something is actually in flight.
const ACTIVE_POLL_MS = 15000;

export const useSocialCapabilities = () =>
  useApiQuery(queryKeys.social.capabilities, getSocialCapabilities, { errorMessage: "Failed to load Promotion Studio status" });

export const useSocialOverview = () =>
  useApiQuery(queryKeys.social.overview, getSocialOverview, { errorMessage: "Failed to load the overview" });

export const useSocialAccounts = () =>
  useApiQuery(queryKeys.social.accounts, getSocialAccounts, { errorMessage: "Failed to load connected accounts" });

export const useSocialLibrary = (enabled = true) =>
  useApiQuery(queryKeys.social.library, getSocialLibrary, { enabled, errorMessage: "Failed to load your videos" });

export const useCampaign = (id) =>
  useApiQuery(queryKeys.social.campaign(id), () => getCampaign(id), {
    enabled: Boolean(id),
    errorMessage: "Failed to load the promotion",
    refetchInterval: (query) => (query.state.data?.posts?.some((p) => isActiveStatus(p.status)) ? ACTIVE_POLL_MS : false),
  });

export const useSocialPosts = (params) =>
  useApiQuery(queryKeys.social.posts(params), () => getSocialPosts(params), {
    errorMessage: "Failed to load posts",
    refetchInterval: (query) => (query.state.data?.posts?.some((p) => isActiveStatus(p.status)) ? ACTIVE_POLL_MS : false),
  });

export const useSocialCalendar = (range) =>
  useApiQuery(queryKeys.social.calendar(range), () => getSocialCalendar(range), { errorMessage: "Failed to load the calendar" });

export const useSocialAnalytics = (params) =>
  useApiQuery(queryKeys.social.analytics(params), () => getSocialAnalytics(params), { errorMessage: "Failed to load analytics" });

/** Latest socket summary per post id, layered over fetched rows so a progress bar moves the instant it changes. */
export function useLivePosts() {
  const [live, setLive] = useState({});
  useEffect(() => {
    connect();
    return onSocialPostUpdated((payload) => {
      if (payload?.postId) setLive((prev) => ({ ...prev, [payload.postId]: payload }));
    });
  }, []);
  return live;
}

/** Lowest-effort debounce for a value that changes while typing. */
export function useDebounced(value, delayMs = 450) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
