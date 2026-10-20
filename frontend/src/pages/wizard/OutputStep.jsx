import { Select } from "../../components/ui/Select";
import { Label, FieldHint } from "../../components/ui/Input";
import { Switch } from "../../components/ui/Switch";
import { ChoiceGroup } from "../../components/ui/ChoiceGroup";
import { cn } from "../../components/ui/cn";
import { ASPECT_RATIOS, QUALITY_PRESETS, aspectOf, resolutionsForAspect } from "./constants";
import { Section } from "./Section";

const RatioGlyph = ({ box }) => <span className={cn("block rounded-[3px] border-2 border-current text-text-tertiary", box)} />;

const SwitchRow = ({ id, title, description, checked, onChange, disabled }) => (
  <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
    <div className="min-w-0">
      <Label htmlFor={id} className="mb-0.5 text-[13px] text-text-primary">
        {title}
      </Label>
      <p className="text-xs leading-relaxed text-text-tertiary">{description}</p>
    </div>
    <Switch id={id} aria-label={title} checked={checked} disabled={disabled} onChange={onChange} />
  </div>
);

/** Step 3: format and size, render quality, and how hands-on the workflow is. */
export function OutputStep({ values, setField, errors }) {
  const isShorts = values.type === "youtube_shorts";
  const aspect = aspectOf(values.resolution);
  const sizes = resolutionsForAspect(aspect);

  // Changing the ratio picks that ratio's first size; the sizes inside it
  // are then a refinement, not a second way to change the shape.
  const pickAspect = (next) => {
    const options = resolutionsForAspect(next);
    if (options.length) setField("resolution", options[0].value);
  };

  return (
    <div className="space-y-4">
      <Section title="Format" description="The shape of the video. The size inside it sets the pixel dimensions.">
        <ChoiceGroup
          aria-label="Aspect ratio"
          value={aspect}
          onChange={pickAspect}
          columns="grid-cols-2 sm:grid-cols-4"
          options={ASPECT_RATIOS.map((a) => ({
            value: a.value,
            label: a.value,
            hint: a.hint,
            preview: <RatioGlyph box={a.box} />,
            disabled: isShorts && a.value !== "9:16",
            disabledReason: "YouTube Shorts are vertical (9:16) only",
          }))}
        />
        <div className="mt-4 max-w-sm">
          <Label htmlFor="video-resolution">Size</Label>
          <Select
            id="video-resolution"
            options={sizes}
            value={values.resolution}
            onChange={(v) => setField("resolution", v)}
            error={Boolean(errors.resolution)}
          />
          <FieldHint error={Boolean(errors.resolution)}>
            {errors.resolution || (isShorts ? "YouTube Shorts are vertical-only." : "Higher sizes take noticeably longer to render.")}
          </FieldHint>
        </div>
      </Section>

      <Section title="Render quality" description="Controls video compression at render time.">
        <ChoiceGroup
          aria-label="Render quality"
          value={values.quality}
          onChange={(v) => setField("quality", v)}
          columns="sm:grid-cols-3"
          options={QUALITY_PRESETS.map((q) => ({ value: q.value, label: q.label, hint: q.hint }))}
        />
      </Section>

      <Section title="Workflow" description="How much you want to review along the way.">
        <div className="divide-y divide-border-light">
          <SwitchRow
            id="fast-generation"
            title="Fast generation"
            description={
              values.fastGeneration
                ? "After you approve the script, audio, images and the final video generate automatically."
                : "You trigger each step yourself - approve the script, then generate audio, then the video - and can review in between."
            }
            checked={values.fastGeneration}
            onChange={(v) => {
              setField("fastGeneration", v);
              if (!v) setField("autoApprove", false);
            }}
          />
          {values.fastGeneration && (
            <SwitchRow
              id="auto-approve"
              title="Auto-approve the script"
              description={
                values.autoApprove
                  ? "The script is approved as soon as it is written - no review, and no chance to edit it or change the voice first."
                  : "You review and approve the script first, and can change the voice then."
              }
              checked={Boolean(values.autoApprove)}
              onChange={(v) => setField("autoApprove", v)}
            />
          )}
          <SwitchRow
            id="fast-audio"
            title="Fast narration model"
            description="Uses the smaller 0.6B text-to-speech model instead of the default 1.7B - quicker, with some loss of quality."
            checked={values.fastAudio}
            onChange={(v) => setField("fastAudio", v)}
          />
        </div>
      </Section>
    </div>
  );
}
