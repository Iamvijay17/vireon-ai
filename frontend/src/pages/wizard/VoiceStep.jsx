import { Select } from "../../components/ui/Select";
import { Label, FieldHint } from "../../components/ui/Input";
import { ChoiceGroup } from "../../components/ui/ChoiceGroup";
import { CAPTION_STYLES, FONT_PAIRINGS } from "./constants";
import { AudioSection } from "./AudioSection";
import { Section } from "./Section";

/** Step 2: who narrates, and how the captions and type look. */
export function VoiceStep({ values, setValues, setField, errors, voiceOptions, voiceStyles, isFavorite, toggleFavorite }) {
  const isPodcast = values.type === "podcast";

  return (
    <div className="space-y-4">
      <Section
        title={isPodcast ? "Host & guest voices" : "Narration"}
        description={isPodcast ? "Two speakers take turns; each has their own voice and name." : "The voice that reads the script aloud."}
      >
        <AudioSection
          values={values}
          setValues={setValues}
          setField={setField}
          errors={errors}
          voiceOptions={voiceOptions}
          voiceStyles={voiceStyles}
          isFavorite={isFavorite}
          toggleFavorite={toggleFavorite}
        />
      </Section>

      <Section title="Captions" description="How the narration appears on screen.">
        <Label htmlFor="video-captions">Caption animation</Label>
        <Select
          id="video-captions"
          options={CAPTION_STYLES}
          value={values.captionAnimation}
          onChange={(v) => setField("captionAnimation", v)}
          disabled={isPodcast}
        />
        <FieldHint>
          {isPodcast
            ? "Podcast dialogue always uses its own highlight style."
            : "Captions animate word by word, in time with the narration."}
        </FieldHint>
      </Section>

      <Section title="Typography" description="The font pair used for titles and body text across every scene.">
        <ChoiceGroup
          aria-label="Font pairing"
          value={values.fontPairing}
          onChange={(v) => setField("fontPairing", v)}
          columns="sm:grid-cols-2 xl:grid-cols-3"
          options={FONT_PAIRINGS.map((f) => ({ value: f.value, label: f.label, hint: f.sample }))}
        />
      </Section>
    </div>
  );
}
