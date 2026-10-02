import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "../components/ui/toastBus";

/**
 * Thin wrapper over useQuery for this app's axios calls.
 *
 * It exists because every page here repeated the same six lines: unwrap
 * `res.data`, keep a `loading` flag that must not flicker during a
 * background refetch, and toast `err.friendlyMessage` exactly once per
 * failure. Doing that in one place is what lets a page state *what* it
 * needs instead of *how* to fetch it.
 *
 * @param {Array} key            React Query key (see lib/queryClient.js)
 * @param {() => Promise} fetcher an axios call; its `res.data` is unwrapped
 * @param {object} [options]
 * @param {(data) => any} [options.select]  pick/shape the payload
 * @param {string} [options.errorMessage]   fallback toast text
 * @param {boolean} [options.enabled]
 * @param {number|false} [options.refetchInterval]
 */
export function useApiQuery(key, fetcher, options = {}) {
  const {
    select,
    errorMessage = "Failed to load",
    enabled = true,
    refetchInterval = false,
    ...rest
  } = options;

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await fetcher();
      // Unwrapped here so call sites deal in payloads, not axios responses.
      return select ? select(res.data) : res.data;
    },
    enabled,
    refetchInterval,
    ...rest,
  });

  const { error } = query;

  // Keyed on the error object, so a persistently failing query toasts once
  // per failed attempt rather than on every re-render. Toasting in an
  // effect (not during render) is what keeps this from firing repeatedly.
  useEffect(() => {
    if (error) toast.error(error.friendlyMessage || errorMessage);
  }, [error, errorMessage]);

  return {
    data: query.data,
    // `isLoading` is the first load only - a background refetch must not
    // drop the page back to a skeleton over data that is still on screen.
    loading: query.isLoading,
    refreshing: query.isFetching && !query.isLoading,
    error,
    refetch: query.refetch,
  };
}

/**
 * Invalidate one or more query-key prefixes. The replacement for calling a
 * page's `fetchX()` by hand after a mutation: every mounted view keyed
 * under that prefix updates, not just the one that ran the mutation.
 */
export function useInvalidate() {
  const queryClient = useQueryClient();
  return (...keys) => keys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
}
