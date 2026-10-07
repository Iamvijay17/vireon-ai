import { RotateCcw } from "lucide-react";
import { AccordionItem } from "../ui/Accordion";
import { Select } from "../ui/Select";
import { Textarea, Label, FieldHint } from "../ui/Input";
import { Badge } from "../ui/Badge";
import { cn } from "../ui/cn";
import { DEFAULT_DIRECTION, isDirectionCustomised } from "../../shared/ttsPreview";

const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const toOptions = (values, autoLabel) => [
  { value: "", label: autoLabel },
  ...(values || []).map((v) => ({ value: v, label: titleCase(v) })),
];

const Slider = ({ label, value, min, max, step, format, onChange, onReset, disabled }) => {
  const changed = Number(value) !== (label === "Speed" ? 1 : 0);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <Label className="mb-0">{label}</Label>
        <div className="flex items-center gap-1.5">
          <span className="text-xs tabular-nums text-text-secondary">{format(Number(value))}</span>
          {changed && (
            <button
              type="button"
              onClick={onReset}
              aria-label={`Reset ${label.toLowerCase()}`}
              className="cursor-pointer text-text-tertiary hover:text-text-primary"
            >
              <RotateCcw className="size-3" />
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
};

/**
 * The narration controls of Voice Studio: presets, style, emotion, speed,
 * pitch and pronunciation. Collapsed by default - everything is "Auto" until
 * touched, so the server's Voice Director picks a natural delivery and most
 * people never need to open it.
 *
 * `options` is the GET /api/tts/voices payload ({ profiles, styles, emotions,
 * limits }); ranges come from the server so the UI cannot drift from what it
 * enforces.
 */
export const VoiceDirection = ({ options, direction, setDirection, onPickPreset, activePreset, disabled = false }) => {
  const limits = options?.limits || { speedMin: 0.85, speedMax: 1.2, pitchMin: -2, pitchMax: 2 };
  const patch = (changes) => setDirection((prev) => ({ ...prev, ...changes }));
  const customised = isDirectionCustomised(direction);

  return (
    <AccordionItem
      title="Voice direction"
      extra={<Badge variant={customised ? "accent" : "neutral"}>{customised ? "Customised" : "Auto"}</Badge>}
    >
      {options?.profiles?.length > 0 && (
        <div className="mb-4">
          <Label>Presets</Label>
          <div className="flex flex-wrap gap-2">
            {options.profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                title={profile.description}
                disabled={disabled}
                onClick={() => onPickPreset?.(profile)}
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  activePreset === profile.id
                    ? "border-accent bg-accent-subtle text-accent"
                    : "border-border bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                )}
              >
                {profile.name}
              </button>
            ))}
          </div>
          <FieldHint>A preset picks a voice and a matching delivery style in one click.</FieldHint>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>Style</Label>
          <Select
            value={direction.style}
            onChange={(style) => patch({ style })}
            options={toOptions(options?.styles, "Auto")}
            disabled={disabled}
          />
        </div>
        <div>
          <Label>Emotion</Label>
          <Select
            value={direction.emotion}
            onChange={(emotion) => patch({ emotion })}
            options={toOptions(options?.emotions, "Auto")}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Slider
          label="Speed"
          value={direction.speed}
          min={limits.speedMin}
          max={limits.speedMax}
          step={0.01}
          format={(v) => `${v.toFixed(2)}x`}
          onChange={(speed) => patch({ speed })}
          onReset={() => patch({ speed: DEFAULT_DIRECTION.speed })}
          disabled={disabled}
        />
        <Slider
          label="Pitch"
          value={direction.pitch}
          min={limits.pitchMin}
          max={limits.pitchMax}
          step={0.5}
          format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} st`}
          onChange={(pitch) => patch({ pitch })}
          onReset={() => patch({ pitch: DEFAULT_DIRECTION.pitch })}
          disabled={disabled}
        />
      </div>
      <FieldHint>
        Speed and pitch are applied as audio processing after the voice is generated. Large changes can sound less natural.
      </FieldHint>

      <div className="mt-4">
        <Label>Pronunciation</Label>
        <Textarea
          rows={3}
          value={direction.pronunciations}
          disabled={disabled}
          onChange={(e) => patch({ pronunciations: e.target.value })}
          placeholder={"Vireon = Veer ee on\nNginx = engine X"}
        />
        <FieldHint>
          One per line: the word, an equals sign, then how it should sound. Common tech terms (Node.js, MongoDB, API...)
          are already handled; the text on screen and in captions is never changed.
        </FieldHint>
      </div>
    </AccordionItem>
  );
};

export default VoiceDirection;
