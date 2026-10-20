import { useContext, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../../components";
import { SettingsSection, SettingsRow } from "../../components/SettingsSection";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { toast } from "../../components/ui/toastBus";
import { ThemeContext } from "../../shared/themeContextValue";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../../shared/settingsStorage";
import { getAiServices, getApiVersion, getCourseWorkerStatus, getSystemWorkers } from "../../services/api";
import { connect, onCourseWorkerStatus } from "../../services/socket";
import { queryKeys } from "../../lib/queryClient";
import { useSystemResources } from "../../lib/useSystemResources";
import { useFavoriteVoices } from "../../shared/useFavoriteVoices";
import { useVoiceOptions } from "../../shared/useVoiceOptions";
import { useOverview } from "../dashboard/useOverview";
import { DefaultsSection } from "./DefaultsSection";
import { ProvidersSection, StorageSection, NotificationsSection, DiagnosticsSection } from "./SystemSections";

const FALLBACK_VOICE_OPTIONS = [
  { value: "female-1", label: "Female Voice 1" },
  { value: "male-1", label: "Male Voice 1" },
];

const NAV = [
  { id: "general", label: "General" },
  { id: "defaults", label: "Video defaults" },
  { id: "providers", label: "Providers" },
  { id: "storage", label: "Storage" },
  { id: "notifications", label: "Notifications" },
  { id: "diagnostics", label: "Diagnostics" },
];

const THEME_OPTIONS = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];
const TIME_OPTIONS = [
  { value: "24h", label: "24-hour" },
  { value: "12h", label: "12-hour" },
];

/**
 * Settings: preferences that live in this browser (theme, defaults,
 * notifications) and read-only views of what the server is configured with
 * (providers, storage, health). Secrets never reach this page - the server
 * keeps keys and credentials, and reports only whether things are working.
 */
const SettingsPage = () => {
  const { theme, toggleTheme } = useContext(ThemeContext);
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState(loadSettings);
  const { isFavorite, toggleFavorite } = useFavoriteVoices();
  const { voiceOptions } = useVoiceOptions(FALLBACK_VOICE_OPTIONS);
  const resources = useSystemResources({ pollMs: 15000 });
  const { storageByCategory } = useOverview();

  const services = useQuery({ queryKey: queryKeys.system.aiServices, queryFn: async () => (await getAiServices()).data, retry: false, staleTime: 15_000 });
  const workers = useQuery({ queryKey: queryKeys.system.workers, queryFn: async () => (await getSystemWorkers()).data, retry: false, staleTime: 15_000 });
  const apiVersion = useQuery({ queryKey: queryKeys.system.version, queryFn: async () => (await getApiVersion()).data, retry: false, staleTime: 60_000 });
  const courseWorker = useQuery({
    queryKey: queryKeys.system.courseWorker,
    queryFn: () => getCourseWorkerStatus().then((res) => res.data.running).catch(() => false),
  });

  // After the first read, the course-worker indicator follows the socket push.
  useEffect(() => {
    connect();
    return onCourseWorkerStatus((data) => queryClient.setQueryData(queryKeys.system.courseWorker, data.running));
  }, [queryClient]);

  const update = (key, value) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  };

  const resetDefaults = () => {
    setSettings((prev) => {
      // Only the video defaults reset; notification and display choices stay.
      const next = {
        ...DEFAULT_SETTINGS,
        timeFormat: prev.timeFormat,
        notifyOnComplete: prev.notifyOnComplete,
        notifyOnFail: prev.notifyOnFail,
        desktopNotifications: prev.desktopNotifications,
      };
      saveSettings(next);
      return next;
    });
    toast.success("Video defaults reset");
  };

  const toggleDesktop = async (on) => {
    if (!on) return update("desktopNotifications", false);
    try {
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission === "granted") update("desktopNotifications", true);
      else toast.error("The browser blocked notifications. Allow them for this site to turn this on.");
    } catch {
      toast.error("Desktop notifications are not available in this browser");
    }
  };

  const refreshDiagnostics = () => {
    resources.refetch();
    services.refetch();
    workers.refetch();
    apiVersion.refetch();
    courseWorker.refetch();
  };

  return (
    <div>
      <PageHeader title="Settings" description="Your preferences for this browser, and the read-only state of the services behind the studio." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[11rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="lg:sticky lg:top-20 lg:self-start">
          <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {NAV.map((item) => (
              <li key={item.id} className="shrink-0">
                <a
                  href={`#${item.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="block rounded-md px-2.5 py-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-5">
          <SettingsSection id="general" title="General" description="How the interface looks. Stored in this browser.">
            <SettingsRow label="Theme" hint="Dark is the default">
              <div className="flex justify-end">
                <SegmentedControl aria-label="Theme" value={theme} onChange={(v) => v !== theme && toggleTheme()} options={THEME_OPTIONS} />
              </div>
            </SettingsRow>
            <SettingsRow label="Time format" hint="Used for timestamps on the Live Logs page">
              <div className="flex justify-end">
                <SegmentedControl aria-label="Time format" value={settings.timeFormat} onChange={(v) => update("timeFormat", v)} options={TIME_OPTIONS} />
              </div>
            </SettingsRow>
          </SettingsSection>

          <DefaultsSection settings={settings} update={update} onReset={resetDefaults} voiceOptions={voiceOptions} isFavorite={isFavorite} toggleFavorite={toggleFavorite} />

          <ProvidersSection services={{ data: services.data, loading: services.isLoading, error: services.error }} />

          <StorageSection resources={resources} storageByCategory={storageByCategory} />

          <NotificationsSection settings={settings} update={update} onDesktopToggle={toggleDesktop} />

          <DiagnosticsSection
            resources={resources}
            workers={{ data: workers.data, error: workers.error }}
            courseWorker={courseWorker.data ?? null}
            apiVersion={apiVersion.data}
            onRefresh={refreshDiagnostics}
            refreshing={resources.loading || services.isFetching || workers.isFetching}
          />
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
