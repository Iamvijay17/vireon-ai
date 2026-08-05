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
import { getVoices, getHealth, getCourseWorkerStatus } from "../../services/api";
import { useFavoriteVoices } from "../../shared/useFavoriteVoices";

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
  { value: "1280x720", label: "720p (1280x720)" },
  { value: "720x1280", label: "720p Vertical (720x1280)" },
  { value: "3840x2160", label: "4K (3840x2160)" },
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
  const [voiceCatalog, setVoiceCatalog] = useState({ custom: [], clone: [] });
  const { isFavorite, toggleFavorite } = useFavoriteVoices();

  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState(false);
  const [healthLoading, setHealthLoading] = useState(true);
  const [workerRunning, setWorkerRunning] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getVoices()
      .then((res) => {
        if (!cancelled) setVoiceCatalog(res.data || { custom: [], clone: [] });
      })
      .catch(() => {
        // Keep FALLBACK_VOICE_OPTIONS if the catalog can't be loaded.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const voiceOptions = [
    ...voiceCatalog.custom.map((v) => ({ value: v.id, label: v.label, description: "Custom", previewUrl: v.previewUrl })),
    ...voiceCatalog.clone.map((v) => ({ value: v.id, label: v.label, description: "Clone", previewUrl: v.previewUrl })),
  ];
  if (voiceOptions.length === 0) voiceOptions.push(...FALLBACK_VOICE_OPTIONS);

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
    setHealthLoading(true);
    setStatusLoading(true);
    getHealth()
      .then((res) => {
        setHealth(res.data);
        setHealthError(false);
      })
      .catch(() => setHealthError(true))
      .finally(() => setHealthLoading(false));
    getCourseWorkerStatus()
      .then((res) => setWorkerRunning(res.data.running))
      .catch(() => setWorkerRunning(false))
      .finally(() => setStatusLoading(false));
  };

  useEffect(() => {
    fetchStatus();
  }, []);

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
            <SettingsRow label="Default Course Style" hint="Preselected when creating a course video">
              <Select options={COURSE_STYLE_OPTIONS} value={settings.defaultCourseStyle} onChange={(v) => updateSetting("defaultCourseStyle", v)} />
            </SettingsRow>
            <SettingsRow label="Default Course Duration" hint="Preselected when creating a course video">
              <Select options={COURSE_DURATION_OPTIONS} value={settings.defaultCourseDuration} onChange={(v) => updateSetting("defaultCourseDuration", v)} />
            </SettingsRow>
          </CardBody>
        </Card>

        {/* System Status */}
        <Card>
          <CardHeader
            title="System Status"
            subtitle="Live health of the backend API and the course video worker"
            extra={
              <Button variant="secondary" size="sm" loading={healthLoading || statusLoading} icon={<RefreshCw className="size-3.5" />} onClick={fetchStatus}>
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
