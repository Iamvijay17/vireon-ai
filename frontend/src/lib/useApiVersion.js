import { useQuery } from "@tanstack/react-query";
import api from "../services/api";

// True when the API is on a different build than the JS this tab loaded, i.e.
// a deploy happened while the tab was open. Unstamped dev builds are never
// "stale" (their version carries no meaning), and nothing is stale until the
// API has answered.
export function isStaleBuild(apiVersion, clientVersion) {
  if (!apiVersion || !clientVersion) return false;
  if (apiVersion.endsWith("-dev") || clientVersion.endsWith("-dev")) return false;
  return apiVersion !== clientVersion;
}

// GET /api/version, re-checked every minute and when the tab regains focus
// (a backgrounded tab's timers are throttled). Failures stay silent: this is
// a convenience and must never toast, and the API is briefly down mid-deploy.
export function useApiVersion() {
  return useQuery({
    queryKey: ["app-version"],
    queryFn: async () => (await api.get("/api/version")).data,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
