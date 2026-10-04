import { useQuery } from "@tanstack/react-query";
import api from "../services/api";
import { appVersionLabel, appVersionTitle } from "../lib/appVersion";

// Sidebar footer: this frontend build's version. The tooltip also lists the
// API's (GET /api/version), so a half-finished deploy (new UI, old API) is
// visible. A failed lookup just leaves it out; it must never toast.
export default function VersionLabel({ className }) {
  const { data: apiVersion } = useQuery({
    queryKey: ["app-version"],
    queryFn: async () => (await api.get("/api/version")).data,
    staleTime: Infinity,
    retry: false,
  });
  const title = apiVersion?.version
    ? `${appVersionTitle}\nAPI v${apiVersion.version}${apiVersion.commit ? ` · commit ${apiVersion.commit}` : ""}`
    : appVersionTitle;

  return (
    <p title={title} className={className}>
      {appVersionLabel}
    </p>
  );
}
