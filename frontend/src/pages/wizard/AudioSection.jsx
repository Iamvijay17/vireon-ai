import { Mic2 } from "lucide-react";
import { VoiceSelect } from "../../components/ui/VoiceSelect";
import { Select } from "../../components/ui/Select";
import { Label, FieldHint } from "../../components/ui/Input";
import { cn } from "../../components/ui/cn";
import { PODCAST_VOICE_PAIRS, deriveNameFromVoiceLabel } from "./constants";
import { NameSelect } from "./NameSelect";
import { Section } from "./Section";

/**
 * Voice settings: one narrator voice, or for a podcast a host and a guest
 * (each with a name), plus one-click Quick Pairs of contrasting voices.
 */
export function AudioSection({ values, setValues, setField, errors, voiceOptions, voiceStyles = [], isFavorite, toggleFavorite }) {
  const voiceIds = new Set(voiceOptions.map((o) => o.value));
  const availableVoicePairs = PODCAST_VOICE_PAIRS.filter(
    (p) => voiceIds.has(p.hostVoice) && voiceIds.has(p.guestVoice)
  );

  return (
    <Section icon={Mic2} title="Configure audio settings" className={values.type === "podcast" ? "lg:col-span-2" : undefined}>
      {values.type === "podcast" ? (
        <>
          {availableVoicePairs.length > 0 && (
            <div className="mb-5">
              <Label>Quick Pair</Label>
              <div className="flex flex-wrap gap-2">
                {availableVoicePairs.map((pair) => {
                  const active =
                    values.hostVoice === pair.hostVoice && values.guestVoice === pair.guestVoice;
                  return (
                    <button
                      key={pair.label}
                      type="button"
                      onClick={() => {
                        setValues((prev) => ({
                          ...prev,
                          hostVoice: pair.hostVoice,
                          guestVoice: pair.guestVoice,
                          hostName: pair.hostName,
                          guestName: pair.guestName,
                        }));
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                        active
                          ? "border-accent bg-accent-subtle text-accent"
                          : "border-border bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                      )}
                    >
                      {pair.label}
                    </button>
                  );
                })}
              </div>
              <FieldHint>
                Picks two clearly distinct voices for host and guest in one click - or choose your own below.
              </FieldHint>
            </div>
          )}

          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div>
              <Label required>Host Voice</Label>
              <VoiceSelect
                placeholder="Select host voice"
                options={voiceOptions}
                value={values.hostVoice}
                onChange={(v) => {
                  setValues((prev) => ({
                    ...prev,
                    hostVoice: v,
                    // Only auto-fill if the user hasn't typed their own name yet.
                    hostName: prev.hostName ? prev.hostName : deriveNameFromVoiceLabel(voiceOptions.find((o) => o.value === v)?.label),
                  }));
                }}
                error={Boolean(errors.hostVoice)}
                isFavorite={isFavorite}
                onToggleFavorite={toggleFavorite}
              />
              <FieldHint error={Boolean(errors.hostVoice)}>{errors.hostVoice}</FieldHint>
            </div>
            <div>
              <Label>Host Name</Label>
              <NameSelect value={values.hostName} onChange={(v) => setField("hostName", v)} />
            </div>
          </div>

          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div>
              <Label required>Guest Voice</Label>
              <VoiceSelect
                placeholder="Select guest voice"
                options={voiceOptions}
                value={values.guestVoice}
                onChange={(v) => {
                  setValues((prev) => ({
                    ...prev,
                    guestVoice: v,
                    guestName: prev.guestName ? prev.guestName : deriveNameFromVoiceLabel(voiceOptions.find((o) => o.value === v)?.label),
                  }));
                }}
                error={Boolean(errors.guestVoice)}
                isFavorite={isFavorite}
                onToggleFavorite={toggleFavorite}
              />
              <FieldHint error={Boolean(errors.guestVoice)}>{errors.guestVoice}</FieldHint>
            </div>
            <div>
              <Label>Guest Name</Label>
              <NameSelect value={values.guestName} onChange={(v) => setField("guestName", v)} />
            </div>
          </div>
          <FieldHint>
            The host and guest take turns in the conversation, each with their own voice - and now their own name, shown on screen and used in the dialogue.
          </FieldHint>
        </>
      ) : (
        <div>
          <Label>Voice</Label>
          <VoiceSelect
            options={voiceOptions}
            value={values.voice}
            onChange={(v) => setField("voice", v)}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
          />
          <FieldHint>Custom voices are built-in presets; Clone voices are generated from your reference .wav files in backend/voices/. Click the play button to hear a sample.</FieldHint>

          {voiceStyles.length > 0 && (
            <div className="mt-4">
              <Label>Narration style</Label>
              <Select
                value={values.voiceStyle || ""}
                onChange={(v) => setField("voiceStyle", v)}
                options={[
                  { value: "", label: "Auto", description: "chosen from the video type" },
                  ...voiceStyles.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })),
                ]}
              />
              <FieldHint>How the narrator delivers the script. Auto picks a natural style for the video type; the Audio Studio can preview any style.</FieldHint>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
