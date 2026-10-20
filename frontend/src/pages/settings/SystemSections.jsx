import { Link } from "react-router-dom";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Switch } from "../../components/ui/Switch";
import { Skeleton } from "../../components/ui/Skeleton";
import { SettingsSection, SettingsRow } from "../../components/SettingsSection";
import ConnectionIndicator from "../../components/ConnectionIndicator";
import UpdateCheckCard from "../../components/UpdateCheckCard";
import { formatBytes } from "../../lib/format";
import { appVersionLabel, APP_COMMIT, APP_BUILD_DATE } from "../../lib/appVersion";
import { SERVICE_LABELS, serviceState } from "../resources/resourceFormat";
import { CATEGORY_LABEL } from "../assets/mediaLibrary";

const Status = ({ ok, up = "Up", down = "Down", unknown = "Unknown" }) => (
  <Badge variant={ok === true ? "success" : ok === false ? "danger" : "neutral"} dot>
    {ok === true ? up : ok === false ? down : unknown}
  </Badge>
);

/**
 * Which generation services this install can use, and whether each is up.
 * Read-only: the server owns this configuration (and any keys behind it) -
 * nothing sensitive is, or can be, shown here.
 */
export function ProvidersSection({ services }) {
  const { data, loading, error } = services;
  return (
    <SettingsSection
      id="providers"
      title="Generation providers"
      description="Configured on the server. Local models start on demand, so Stopped is normal."
      action={
        <Link to="/resources" className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary">
          GPU &amp; Resources <ArrowRight className="size-3.5" />
        </Link>
      }
    >
      {loading ? (
        <div className="py-4">
          <Skeleton className="h-16 w-full" />
        </div>
      ) : error ? (
        <p className="py-4 text-[13px] text-text-tertiary">Provider status is unavailable: {error.friendlyMessage || error.message}</p>
      ) : (
        ["llm", "tts", "comfyui", "remotion"].map((id) => {
          const state = serviceState(data?.services?.[id]?.status);
          return (
            <SettingsRow key={id} label={SERVICE_LABELS[id].name} hint={SERVICE_LABELS[id].detail}>
              <div className="flex justify-end">
                <Badge variant={state.variant} dot>
                  {state.label}
                </Badge>
              </div>
            </SettingsRow>
          );
        })
      )}
    </SettingsSection>
  );
}

/** Media storage health and how much is stored, by kind. Endpoints and credentials stay server-side. */
export function StorageSection({ resources, storageByCategory }) {
  const total = storageByCategory.reduce((sum, row) => sum + row.bytes, 0);
  const storageUp = resources.resources?.dependencies?.storage;

  return (
    <SettingsSection
      id="storage"
      title="Storage"
      description="Generated media is kept in the server's object storage. Its address and credentials are never sent to the browser."
      action={
        <Link to="/media" className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary">
          Media Library <ArrowRight className="size-3.5" />
        </Link>
      }
    >
      <SettingsRow label="Object storage">
        <div className="flex justify-end">
          <Status ok={resources.error ? null : storageUp} up="Reachable" down="Not reachable" />
        </div>
      </SettingsRow>
      <SettingsRow label="Stored media" hint={storageByCategory.length ? storageByCategory.map((r) => `${CATEGORY_LABEL[r.label] || r.label} ${formatBytes(r.bytes)}`).join(" · ") : "Nothing stored yet"}>
        <p className="tabular text-right text-sm font-medium text-text-primary">{total > 0 ? formatBytes(total) : "—"}</p>
      </SettingsRow>
    </SettingsSection>
  );
}

/** Notification preferences. Browser-local; desktop notifications also need the browser's permission. */
export function NotificationsSection({ settings, update, onDesktopToggle }) {
  return (
    <SettingsSection
      id="notifications"
      title="Notifications"
      description="Tell me when a video finishes or fails, wherever I am in the app."
    >
      <SettingsRow label="Video finished" hint="A message when a video completes rendering">
        <ToggleCell label="Notify when a video finishes" checked={settings.notifyOnComplete} onChange={(v) => update("notifyOnComplete", v)} />
      </SettingsRow>
      <SettingsRow label="Video failed" hint="A message, with the reason, when a job fails">
        <ToggleCell label="Notify when a video fails" checked={settings.notifyOnFail} onChange={(v) => update("notifyOnFail", v)} />
      </SettingsRow>
      <SettingsRow
        label="Desktop notifications"
        hint={
          typeof Notification === "undefined"
            ? "This browser does not support desktop notifications"
            : "Also notify when this tab is in the background. The browser will ask permission."
        }
      >
        <ToggleCell
          label="Desktop notifications"
          checked={settings.desktopNotifications}
          disabled={typeof Notification === "undefined"}
          onChange={onDesktopToggle}
        />
      </SettingsRow>
    </SettingsSection>
  );
}

const ToggleCell = ({ label, checked, onChange, disabled }) => (
  <div className="flex justify-end">
    <Switch aria-label={label} checked={checked} disabled={disabled} onChange={onChange} />
  </div>
);

/** Health of the pieces the app depends on, plus this build's version. */
export function DiagnosticsSection({ resources, workers, courseWorker, apiVersion, onRefresh, refreshing }) {
  const deps = resources.resources?.dependencies;
  const depsKnown = !resources.error && deps;
  const workerInfo = workers.data;
  const videoWorkers = workerInfo ? workerInfo.workers.filter((w) => w.queue === "video-rendering").length : null;

  return (
    <SettingsSection
      id="diagnostics"
      title="Diagnostics"
      description="Live health of the backend and what it depends on."
      action={
        <Button variant="secondary" size="sm" loading={refreshing} icon={<RefreshCw className="size-3.5" />} onClick={onRefresh}>
          Refresh
        </Button>
      }
    >
      <SettingsRow label="Live updates" hint="Real-time progress from the server">
        <div className="flex justify-end">
          <ConnectionIndicator />
        </div>
      </SettingsRow>
      <SettingsRow label="Database">
        <div className="flex justify-end">
          <Status ok={depsKnown ? deps.mongo : null} unknown={resources.error ? "Backend unreachable" : "Checking"} />
        </div>
      </SettingsRow>
      <SettingsRow label="Job queue (Redis)">
        <div className="flex justify-end">
          <Status ok={depsKnown ? deps.redis : null} unknown={resources.error ? "Backend unreachable" : "Checking"} />
        </div>
      </SettingsRow>
      <SettingsRow label="Video worker" hint={videoWorkers === 0 ? "None connected - jobs will wait. Start it with: npm run dev:worker" : undefined}>
        <div className="flex justify-end">
          <Status ok={videoWorkers === null ? null : videoWorkers > 0} up={`${videoWorkers} connected`} down="None connected" unknown={workers.error ? "Unavailable" : "Checking"} />
        </div>
      </SettingsRow>
      <SettingsRow label="Course worker" hint={courseWorker === false ? "Start it with: npm run dev:course-worker" : undefined}>
        <div className="flex justify-end">
          <Status ok={courseWorker} up="Running" down="Offline" unknown="Checking" />
        </div>
      </SettingsRow>
      {workerInfo && !workerInfo.healthy && (
        <SettingsRow label="Worker health" hint="Duplicate, unidentified or out-of-date workers were found.">
          <div className="flex justify-end">
            <Badge variant="warning">Needs attention</Badge>
          </div>
        </SettingsRow>
      )}
      <SettingsRow label="Interface build" hint={[APP_COMMIT && `commit ${APP_COMMIT}`, APP_BUILD_DATE && `built ${new Date(APP_BUILD_DATE).toLocaleString()}`].filter(Boolean).join(" · ") || undefined}>
        <p className="text-right font-mono text-xs text-text-secondary">{appVersionLabel}</p>
      </SettingsRow>
      <SettingsRow label="API build" hint={apiVersion?.commit ? `commit ${apiVersion.commit}` : undefined}>
        <p className="text-right font-mono text-xs text-text-secondary">{apiVersion?.version ? `v${apiVersion.version}` : "Unavailable"}</p>
      </SettingsRow>
      <div className="py-3">
        <UpdateCheckCard />
      </div>
    </SettingsSection>
  );
}
