import { SlidersHorizontal } from "lucide-react";
import { Select } from "../../components/ui/Select";
import { Label, FieldHint } from "../../components/ui/Input";
import { Switch } from "../../components/ui/Switch";
import { RESOLUTIONS, VERTICAL_RESOLUTIONS, QUALITY_PRESETS, CAPTION_STYLES } from "./constants";
import { Section } from "./Section";

/** Resolution, render quality, caption style and the two speed switches. */
export function OutputSection({ values, setField }) {
  return (
    <Section icon={SlidersHorizontal} title="Choose output quality">
      <div className="mb-6">
        <Label>Resolution</Label>
        <Select
          options={values.type === "youtube_shorts" ? VERTICAL_RESOLUTIONS : RESOLUTIONS}
          value={values.resolution}
          onChange={(v) => setField("resolution", v)}
        />
        <FieldHint>
          {values.type === "youtube_shorts"
            ? "YouTube Shorts are vertical-only."
            : "Aspect ratio is determined automatically by the resolution you pick."}
        </FieldHint>
      </div>

      <div className="mb-6">
        <Label>Render Quality</Label>
        <Select
          options={QUALITY_PRESETS}
          value={values.quality}
          onChange={(v) => setField("quality", v)}
        />
        <FieldHint>Draft renders faster for quick previews; HD takes longer but produces the cleanest result.</FieldHint>
      </div>

      <div className="mb-6">
        <Label>Caption Style</Label>
        <Select
          options={CAPTION_STYLES}
          value={values.captionAnimation}
          onChange={(v) => setField("captionAnimation", v)}
        />
        <FieldHint>How narration captions animate word-by-word. Podcast dialogue always uses its own highlight style regardless of this setting.</FieldHint>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4">
        <div>
          <Label className="mb-1">Fast Generation</Label>
          <p className="text-xs text-text-secondary">
            {values.fastGeneration
              ? "On: after you approve the script, audio, images, and the final video generate automatically."
              : "Off: you'll manually trigger each step — approve the script, then generate audio, then generate the video — reviewing in between, like course videos."}
          </p>
        </div>
        <Switch checked={values.fastGeneration} onChange={(v) => setField("fastGeneration", v)} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4">
        <div>
          <Label className="mb-1">Fast Audio (0.6B)</Label>
          <p className="text-xs text-text-secondary">
            Uses the smaller, faster Qwen3-TTS 0.6B model for narration instead of the default 1.7B - quicker, lower quality.
          </p>
        </div>
        <Switch checked={values.fastAudio} onChange={(v) => setField("fastAudio", v)} />
      </div>
    </Section>
  );
}
