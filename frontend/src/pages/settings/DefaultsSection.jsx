import { RotateCcw } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { Switch } from "../../components/ui/Switch";
import { VoiceSelect } from "../../components/ui/VoiceSelect";
import { SettingsSection, SettingsRow } from "../../components/SettingsSection";
import { VIDEO_TYPES, RESOLUTIONS, QUALITY_PRESETS, CAPTION_STYLES, FONT_PAIRINGS, LANGUAGES } from "../wizard/constants";

const COURSE_STYLE_OPTIONS = VIDEO_TYPES.filter((t) => ["educational", "story", "motivational", "business"].includes(t.value));

const COURSE_DURATION_OPTIONS = [
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 15, label: "15 minutes" },
];

const asOptions = (list) => list.map(({ value, label }) => ({ value, label }));

/**
 * Defaults pre-filled into Create Video and the course forms. They live in this
 * browser only (localStorage) - nothing here is sent to the server.
 */
export function DefaultsSection({ settings, update, onReset, voiceOptions, isFavorite, toggleFavorite }) {
  return (
    <SettingsSection
      id="defaults"
      title="Video defaults"
      description="Pre-filled in Create Video and the course forms. Stored in this browser."
      action={
        <Button variant="ghost" size="sm" icon={<RotateCcw className="size-3.5" />} onClick={onReset}>
          Reset to defaults
        </Button>
      }
    >
      <SettingsRow label="Voice" hint="Used by Create Video and course videos">
        <VoiceSelect
          options={voiceOptions}
          value={settings.defaultVoice}
          onChange={(v) => update("defaultVoice", v)}
          placeholder="No preference"
          isFavorite={isFavorite}
          onToggleFavorite={toggleFavorite}
        />
      </SettingsRow>
      <SettingsRow label="Language">
        <Select aria-label="Default language" options={LANGUAGES} value={settings.defaultLanguage} onChange={(v) => update("defaultLanguage", v)} />
      </SettingsRow>
      <SettingsRow label="Video type" hint="Preselected in step 1 of Create Video">
        <Select aria-label="Default video type" options={asOptions(VIDEO_TYPES)} value={settings.defaultVideoType} onChange={(v) => update("defaultVideoType", v)} />
      </SettingsRow>
      <SettingsRow label="Resolution" hint="The aspect ratio follows from it">
        <Select aria-label="Default resolution" options={RESOLUTIONS} value={settings.defaultResolution} onChange={(v) => update("defaultResolution", v)} />
      </SettingsRow>
      <SettingsRow label="Render quality">
        <Select aria-label="Default render quality" options={asOptions(QUALITY_PRESETS)} value={settings.defaultQuality} onChange={(v) => update("defaultQuality", v)} />
      </SettingsRow>
      <SettingsRow label="Caption style" hint="Podcast dialogue always uses its own highlight style">
        <Select aria-label="Default caption style" options={CAPTION_STYLES} value={settings.defaultCaptionStyle} onChange={(v) => update("defaultCaptionStyle", v)} />
      </SettingsRow>
      <SettingsRow label="Font pairing">
        <Select aria-label="Default font pairing" options={FONT_PAIRINGS.map((f) => ({ value: f.value, label: f.label, description: f.sample }))} value={settings.defaultFontPairing} onChange={(v) => update("defaultFontPairing", v)} />
      </SettingsRow>
      <SettingsRow label="Course style" hint="Preselected when creating a course video">
        <Select aria-label="Default course style" options={asOptions(COURSE_STYLE_OPTIONS)} value={settings.defaultCourseStyle} onChange={(v) => update("defaultCourseStyle", v)} />
      </SettingsRow>
      <SettingsRow label="Course lesson length">
        <Select aria-label="Default course lesson length" options={COURSE_DURATION_OPTIONS} value={settings.defaultCourseDuration} onChange={(v) => update("defaultCourseDuration", v)} />
      </SettingsRow>
      <SettingsRow label="Fast generation" hint="Audio, images and render run on their own after you approve the script. Off: you trigger each step.">
        <div className="flex justify-end">
          <Switch
            aria-label="Fast generation"
            checked={settings.defaultFastGeneration}
            onChange={(v) => {
              update("defaultFastGeneration", v);
              if (!v) update("defaultAutoApprove", false);
            }}
          />
        </div>
      </SettingsRow>
      <SettingsRow label="Auto-approve script" hint="With fast generation: skip the script review too. You cannot edit the script or voice first.">
        <div className="flex justify-end">
          <Switch
            aria-label="Auto-approve script"
            checked={settings.defaultFastGeneration && settings.defaultAutoApprove}
            disabled={!settings.defaultFastGeneration}
            onChange={(v) => update("defaultAutoApprove", v)}
          />
        </div>
      </SettingsRow>
      <SettingsRow label="Fast narration model" hint="Uses the smaller 0.6B text-to-speech model by default in Voice Studio and Create Video.">
        <div className="flex justify-end">
          <Switch aria-label="Fast narration model" checked={settings.fastAudioGeneration} onChange={(v) => update("fastAudioGeneration", v)} />
        </div>
      </SettingsRow>
    </SettingsSection>
  );
}
