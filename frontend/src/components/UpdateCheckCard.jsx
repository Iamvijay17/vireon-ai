import { useState } from "react";
import { Download, RefreshCw, Rocket } from "lucide-react";
import { Card, CardHeader, CardBody } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { APP_COMMIT, appVersionTitle, appVersionLabel } from "../lib/appVersion";
import { compareBuild, fetchLatestBuild } from "../lib/checkForUpdate";

const STATUS = {
  current: { variant: "success", label: "Up to date", hint: "You are running the latest version." },
  outdated: { variant: "warning", label: "Update available", hint: "A newer version has been deployed. Reload to use it." },
  dev: { variant: "neutral", label: "Dev build", hint: "Local development build - update checks only apply to deployed builds." },
  unknown: { variant: "neutral", label: "Unknown", hint: "The server did not report a version." },
  error: { variant: "danger", label: "Check failed", hint: "Could not reach the server. Try again in a moment." },
};

// Settings card: on-demand "is a newer deploy live?". The sidebar banner
// already nags automatically; this is the manual button for users who want
// certainty (or dismissed the banner with "Later").
export default function UpdateCheckCard() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null); // { status, latest, at }

  const check = async () => {
    setChecking(true);
    try {
      const latest = await fetchLatestBuild();
      setResult({ status: compareBuild(APP_COMMIT, latest), latest, at: new Date() });
    } catch {
      setResult({ status: "error", latest: null, at: new Date() });
    } finally {
      setChecking(false);
    }
  };

  const status = result ? STATUS[result.status] : null;

  return (
    <Card>
      <CardHeader
        title="Software Update"
        subtitle="Check whether a newer version of Vireon AI has been deployed"
        extra={
          <Button variant="secondary" size="sm" loading={checking} icon={<RefreshCw className="size-3.5" />} onClick={check}>
            Check for updates
          </Button>
        }
      />
      <CardBody>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border-light px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent">
              <Rocket className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">Installed: {appVersionLabel}</p>
              <p className="truncate text-xs text-text-tertiary" title={appVersionTitle}>
                {status
                  ? `${status.hint}${result.status === "outdated" && result.latest?.version ? ` (latest v${result.latest.version})` : ""} · checked ${result.at.toLocaleTimeString()}`
                  : appVersionTitle}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {status && (
              <Badge variant={status.variant} dot>
                {status.label}
              </Badge>
            )}
            {result?.status === "outdated" && (
              <Button variant="primary" size="sm" icon={<Download className="size-3.5" />} onClick={() => window.location.reload()}>
                Update now
              </Button>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
