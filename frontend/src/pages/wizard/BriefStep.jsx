import { Select } from "../../components/ui/Select";
import { Textarea, Label, FieldHint } from "../../components/ui/Input";
import { ChoiceGroup } from "../../components/ui/ChoiceGroup";
import { VIDEO_TYPES, DURATIONS, SHORTS_DURATIONS, LANGUAGES } from "./constants";
import { TOPIC_MAX } from "./summary";
import { Section } from "./Section";

/** Step 1: what the video is about, what kind it is, and how long. */
export function BriefStep({ values, setField, onTypeChange, errors }) {
  const topicLength = (values.topic || "").length;
  const isShorts = values.type === "youtube_shorts";

  return (
    <div className="space-y-4">
      <Section title="What is the video about?" description="A topic, a question, or a rough script outline - the script is generated from it.">
        <Label htmlFor="video-topic" required>
          Topic
        </Label>
        <Textarea
          id="video-topic"
          rows={4}
          maxLength={TOPIC_MAX}
          placeholder="e.g. How transformers changed machine translation, explained for beginners"
          value={values.topic}
          onChange={(e) => setField("topic", e.target.value)}
          error={Boolean(errors.topic)}
          aria-invalid={Boolean(errors.topic) || undefined}
          aria-describedby="video-topic-hint"
        />
        <div id="video-topic-hint" className="mt-1.5 flex items-start justify-between gap-3">
          <FieldHint error={Boolean(errors.topic)}>{errors.topic || "The more specific the topic, the more focused the script."}</FieldHint>
          <span className="tabular mt-1.5 shrink-0 text-xs text-text-tertiary">
            {topicLength}/{TOPIC_MAX}
          </span>
        </div>
      </Section>

      <Section title="Video type" description="Sets the script structure and the default narration style.">
        <ChoiceGroup
          aria-label="Video type"
          value={values.type}
          onChange={onTypeChange}
          columns="sm:grid-cols-2 xl:grid-cols-3"
          options={VIDEO_TYPES.map((t) => ({ value: t.value, label: t.label, hint: t.hint }))}
        />
        <FieldHint error={Boolean(errors.type)}>{errors.type}</FieldHint>
      </Section>

      <Section title="Length & language">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="video-duration" required>
              Duration
            </Label>
            <Select
              id="video-duration"
              placeholder="Select duration"
              options={isShorts ? SHORTS_DURATIONS : DURATIONS}
              value={values.duration}
              onChange={(v) => setField("duration", v)}
              error={Boolean(errors.duration)}
            />
            <FieldHint error={Boolean(errors.duration)}>
              {errors.duration || (isShorts ? "YouTube Shorts are capped at 3 minutes." : "Target length - the script is sized to fit.")}
            </FieldHint>
          </div>
          <div>
            <Label htmlFor="video-language">Language</Label>
            <Select id="video-language" options={LANGUAGES} value={values.language} onChange={(v) => setField("language", v)} />
            <FieldHint>Only the languages the narration engine supports are listed.</FieldHint>
          </div>
        </div>
      </Section>
    </div>
  );
}
