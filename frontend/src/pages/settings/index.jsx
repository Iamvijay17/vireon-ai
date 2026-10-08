import { useContext, useEffect, useState } from "react";
import { Sun, Moon, Mic2, RefreshCw, Server, Cpu, RotateCcw } from "lucide-react";
import { PageHeader } from "../../components";
import { Card, CardHeader, CardBody } from "../../components/ui/Card";
import { Switch } from "../../components/ui/Switch";
import { Select } from "../../components/ui/Select";
import { VoiceSelect } from "../../components/ui/VoiceSelect";
import { Label, FieldHint } from "../../components/ui/Input";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { toast } from "../../components/ui/toastBus";
import { ThemeContext } from "../../shared/themeContextValue";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../../shared/settingsStorage";
import { getHealth, getCourseWorkerStatus } from "../../services/api";
import { connect, onCourseWorkerStatus } from "../../services/socket";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryClient";
import { useFavoriteVoices } from "../../shared/useFavoriteVoices";
import { useVoiceOptions } from "../../shared/useVoiceOptions";

const FALLBACK_VOICE_OPTIONS = [
  { value: "female-1", label: "Female Voice 1" },
  { value: "male-1", label: "Male Voice 1" },
];

const LANGUAGE_OPTIONS = [
  { value: "english", label: "English" },
  { value: "hindi", label: "Hindi" },
  { value: "spanish", label: "Spanish" },
  { value: "french", label: "French" },
  { value: "german", label: "German" },
  { value: "japanese", label: "Japanese" },
  { value: "korean", label: "Korean" },
];

const VIDEO_TYPE_OPTIONS = [
  { value: "educational", label: "Educational" },
  { value: "marketing", label: "Marketing" },
  { value: "story", label: "Story" },
  { value: "youtube_shorts", label: "YouTube Shorts" },
  { value: "podcast", label: "Podcast" },
  { value: "motivational", label: "Motivational" },
  { value: "business", label: "Business" },
];

const RESOLUTION_OPTIONS = [
  { value: "1920x1080", label: "1080p (1920x1080)" },
  { value: "1080x1920", label: "1080p Vertical (1080x1920)" },
  { value: "1080x1350", label: "Instagram 4:5 (1080x1350)" },
  { value: "1280x720", label: "720p (1280x720)" },
  { value: "720x1280", label: "720p Vertical (720x1280)" },
  { value: "3840x2160", label: "4K (3840x2160)" },
];

// Mirrors the backend's QUALITY_PRESETS enum (backend/src/constants/index.js).
const QUALITY_OPTIONS = [
  { value: "draft", label: "Draft (fast, lower quality)" },
  { value: "standard", label: "Standard" },
  { value: "hd", label: "HD (best quality, slower render)" },
];

const CAPTION_STYLE_OPTIONS = [
  { value: "fadeInUp", label: "Fade Up" },
  { value: "popScale", label: "Pop" },
  { value: "slideLeft", label: "Slide Left" },
  { value: "slideRight", label: "Slide Right" },
  { value: "bounce", label: "Bounce" },
  { value: "typewriter", label: "Typewriter" },
  { value: "glowActive", label: "Glow" },
  { value: "zoom", label: "Zoom" },
  { value: "blurToSharp", label: "Blur to Sharp" },
];

const COURSE_STYLE_OPTIONS = [
  { value: "educational", label: "Educational" },
  { value: "story", label: "Story" },
  { value: "motivational", label: "Motivational" },
  { value: "business", label: "Business" },
];

const COURSE_DURATION_OPTIONS = [
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 15, label: "15 minutes" },
];

const SettingsRow = ({ label, hint, children }) => (
  <div className="grid grid-cols-1 items-start gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-2 sm:items-center sm:gap-4">
    <div>
      <Label>{label}</Label>
      {hint && <FieldHint>{hint}</FieldHint>}
    </div>
    <div className="sm:justify-self-end sm:w-64">{children}</div>
  </div>
);

const SettingsPage = () => {
  const { theme, toggleTheme } = useContext(ThemeContext);

  const [settings, setSettings] = useState(loadSettings);
  const { isFavorite, toggleFavorite } = useFavoriteVoices();

  const queryClient = useQueryClient();
  // No retry: a failed health check *is* the answer ("Offline"), and
  // retrying only delays showing it.
  const healthQuery = useQuery({
    queryKey: queryKeys.system.health,
    queryFn: async () => (await getHealth()).data,
    retry: false,
  });
  const workerQuery = useQuery({
    queryKey: queryKeys.system.courseWorker,
    queryFn: () => getCourseWorkerStatus().then((res) => res.data.running).catch(() => false),
  });
  const health = healthQuery.data ?? null;
  const healthError = Boolean(healthQuery.error);
  const workerRunning = workerQuery.data ?? null;
  const statusLoading = healthQuery.isFetching || workerQuery.isFetching;

  const { voiceCatalog, voiceOptions } = useVoiceOptions(FALLBACK_VOICE_OPTIONS);

  const updateSetting = (key, value) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    toast.success("Preferences reset to defaults");
  };

  const fetchStatus = () => {
    healthQuery.refetch();
    workerQuery.refetch();
  };

  // After the initial fetch, keep the worker indicator live via the socket
  // push instead of re-polling on a timer.
  useEffect(() => {
    connect();
    return onCourseWorkerStatus((data) => queryClient.setQueryData(queryKeys.system.courseWorker, data.running));
  }, [queryClient]);

  return (
    <div>
      <PageHeader title="Settings" description="Preferences and generation defaults for this browser, plus a live look at backend health." />

      <div className="space-y-6">
        {/* Appearance */}
        <Card>
          <CardHeader title="Appearance" subtitle="Personalize how Vireon AI looks on this device" />
          <CardBody>
            <SettingsRow label="Theme" hint="Switch between light and dark mode">
              <div className="flex items-center justify-end gap-3">
                <Sun className="size-4 text-text-tertiary" />
                <Switch checked={theme === "dark"} onChange={toggleTheme} />
                <Moon className="size-4 text-text-tertiary" />
              </div>
            </SettingsRow>
            <SettingsRow label="Time Format" hint="Used for timestamps on the Live Logs page">
              <div className="flex items-center justify-end gap-4">
                <label className="flex items-center gap-1.5 text-sm text-text-primary">
                  <input
                    type="radio"
                    name="time-format"
                    checked={settings.timeFormat === "12h"}
                    onChange={() => updateSetting("timeFormat", "12h")}
                    className="size-3.5 accent-accent"
                  />
                  12-hour
                </label>
                <label className="flex items-center gap-1.5 text-sm text-text-primary">
                  <input
                    type="radio"
                    name="time-format"
                    checked={settings.timeFormat === "24h"}
                    onChange={() => updateSetting("timeFormat", "24h")}
                    className="size-3.5 accent-accent"
                  />
                  24-hour
                </label>
              </div>
            </SettingsRow>
          </CardBody>
        </Card>

        {/* Generation Defaults */}
        <Card>
          <CardHeader
            title="Generation Defaults"
            subtitle="Pre-fill the Wizard and Course creation forms with your preferred options"
            extra={
              <Button variant="ghost" size="sm" icon={<RotateCcw className="size-3.5" />} onClick={resetSettings}>
                Reset
              </Button>
            }
          />
          <CardBody className="divide-y divide-border-light">
            <SettingsRow label="Default Voice" hint="Used across both the Wizard and Course video creation">
              <VoiceSelect
                options={voiceOptions}
                value={settings.defaultVoice}
                onChange={(v) => updateSetting("defaultVoice", v)}
                placeholder="No preference"
                isFavorite={isFavorite}
                onToggleFavorite={toggleFavorite}
              />
            </SettingsRow>
            <SettingsRow label="Default Language" hint="Used when creating course videos">
              <Select options={LANGUAGE_OPTIONS} value={settings.defaultLanguage} onChange={(v) => updateSetting("defaultLanguage", v)} />
            </SettingsRow>
            <SettingsRow label="Default Video Type" hint="Preselected in step 1 of the Wizard">
              <Select options={VIDEO_TYPE_OPTIONS} value={settings.defaultVideoType} onChange={(v) => updateSetting("defaultVideoType", v)} />
            </SettingsRow>
            <SettingsRow label="Default Resolution" hint="Used by the Wizard's resolution step - aspect ratio follows automatically">
              <Select options={RESOLUTION_OPTIONS} value={settings.defaultResolution} onChange={(v) => updateSetting("defaultResolution", v)} />
            </SettingsRow>
            <SettingsRow label="Default Render Quality" hint="Preselected in the Wizard's output step - controls the render's encode CRF">
              <Select options={QUALITY_OPTIONS} value={settings.defaultQuality} onChange={(v) => updateSetting("defaultQuality", v)} />
            </SettingsRow>
            <SettingsRow label="Default Caption Style" hint="Preselected in the Wizard's output step - podcast dialogue always uses its own highlight style">
              <Select options={CAPTION_STYLE_OPTIONS} value={settings.defaultCaptionStyle} onChange={(v) => updateSetting("defaultCaptionStyle", v)} />
            </SettingsRow>
            <SettingsRow label="Default Course Style" hint="Preselected when creating a course video">
              <Select options={COURSE_STYLE_OPTIONS} value={settings.defaultCourseStyle} onChange={(v) => updateSetting("defaultCourseStyle", v)} />
            </SettingsRow>
            <SettingsRow label="Default Course Duration" hint="Preselected when creating a course video">
              <Select options={COURSE_DURATION_OPTIONS} value={settings.defaultCourseDuration} onChange={(v) => updateSetting("defaultCourseDuration", v)} />
            </SettingsRow>
            <SettingsRow label="Fast Generation" hint="Wizard videos run audio, images and render on their own after you approve the script. Off = you trigger each step, so you can change the voice in between">
              <div className="flex justify-end">
                <Switch
                  checked={settings.defaultFastGeneration}
                  onChange={(v) => {
                    updateSetting("defaultFastGeneration", v);
                    if (!v) updateSetting("defaultAutoApprove", false);
                  }}
                />
              </div>
            </SettingsRow>
            <SettingsRow label="Auto-approve Script" hint="With Fast Generation: skip the script review too - the video goes from topic to finished with no clicks. You can't edit the script or voice first">
              <div className="flex justify-end">
                <Switch
                  checked={settings.defaultFastGeneration && settings.defaultAutoApprove}
                  disabled={!settings.defaultFastGeneration}
                  onChange={(v) => updateSetting("defaultAutoApprove", v)}
                />
              </div>
            </SettingsRow>
            <SettingsRow label="Fast Audio Generation" hint="Uses the smaller 0.6B TTS model by default in Audio Studio - quicker, lower quality">
              <div className="flex justify-end">
                <Switch checked={settings.fastAudioGeneration} onChange={(v) => updateSetting("fastAudioGeneration", v)} />
              </div>
            </SettingsRow>
          </CardBody>
        </Card>

        {/* System Status */}
        <Card>
          <CardHeader
            title="System Status"
            subtitle="Live health of the backend API and the course video worker"
            extra={
              <Button variant="secondary" size="sm" loading={statusLoading} icon={<RefreshCw className="size-3.5" />} onClick={fetchStatus}>
                Refresh
              </Button>
            }
          />
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border-light px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-accent-subtle text-accent">
                  <Server className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">Backend API</p>
                  <p className="text-xs text-text-tertiary">
                    {health ? `Node ${health.nodeVersion} · ${health.platform} · up ${health.uptime}` : healthError ? "Could not reach the API" : "Checking..."}
                  </p>
                </div>
              </div>
              <Badge variant={healthError ? "danger" : health ? "success" : "neutral"} dot>
                {healthError ? "Offline" : health ? "Healthy" : "Checking"}
              </Badge>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border-light px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-accent-subtle text-accent">
                  <Cpu className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">Course Video Worker</p>
                  <p className="text-xs text-text-tertiary">
                    {workerRunning
                      ? "Listening for script, audio and render jobs"
                      : "Start it with: npm run course-worker"}
                  </p>
                </div>
              </div>
              <Badge variant={workerRunning ? "success" : workerRunning === false ? "danger" : "neutral"} dot>
                {workerRunning === null ? "Checking" : workerRunning ? "Running" : "Offline"}
              </Badge>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border-light px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-accent-subtle text-accent">
                  <Mic2 className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">Voice Catalog</p>
                  <p className="text-xs text-text-tertiary">
                    {voiceCatalog.custom.length + voiceCatalog.clone.length} voice{voiceCatalog.custom.length + voiceCatalog.clone.length === 1 ? "" : "s"} available
                    ({voiceCatalog.custom.length} custom, {voiceCatalog.clone.length} cloned)
                  </p>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default SettingsPage;
