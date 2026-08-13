import { Wand2, Loader2, Plus, X, Library, Zap } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Textarea, Label, FieldHint, Input } from "../../components/ui/Input";
import { VoiceSelect } from "../../components/ui/VoiceSelect";
import { Switch } from "../../components/ui/Switch";

const MAX_SCRIPT_CHARS = 20000;
const MAX_SPEAKERS = 6;

const DIALOGUE_PLACEHOLDER = `Host: Welcome back to the show! Today we're talking about something really interesting.
Guest (a little nervous, half-laughing): Thanks for having me, I'm excited to dig into this.
Host (warm and curious): So let's start from the beginning...`;

// Multi-speaker tab of Audio Studio - extracted from pages/audio/index.jsx,
// see SingleVoicePanel for why.
export const DialoguePanel = ({
  speakers,
  updateSpeaker,
  addSpeaker,
  removeSpeaker,
  script,
  setScript,
  voiceOptions,
  isFavorite,
  toggleFavorite,
  onBrowseVoices,
  generating,
  onGenerate,
  fastMode,
  setFastMode,
}) => {
  const disabled = generating || !script.trim();

  // The Qwen3-TTS voice-clone endpoint has no delivery/style-instruction
  // parameter at all (unlike the preset "custom" voices) - so "(laughing)"
  // style notes in the script are parsed fine but have nowhere to go and are
  // silently ignored for cloned speakers. Surface that up front instead of
  // letting it look broken.
  const hasCloneSpeaker = speakers.some((s) => s.voice.startsWith("clone:"));
  const scriptHasEmotionNotes = /\([^)]+\):/.test(script);

  return (
    <>
      <div>
        <Label required>Speakers</Label>
        <div className="flex flex-col gap-2">
          {speakers.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                className="w-32 shrink-0"
                value={s.name}
                maxLength={40}
                onChange={(e) => updateSpeaker(i, { name: e.target.value })}
                placeholder={`Speaker ${i + 1}`}
              />
              <VoiceSelect
                className="min-w-0 flex-1"
                options={voiceOptions}
                value={s.voice}
                onChange={(v) => updateSpeaker(i, { voice: v })}
                placeholder="Select a voice..."
                isFavorite={isFavorite}
                onToggleFavorite={toggleFavorite}
              />
              <button
                type="button"
                onClick={() => onBrowseVoices(i)}
                aria-label={`Browse voices for speaker ${i + 1}`}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-hover hover:text-accent"
              >
                <Library className="size-3.5" />
              </button>
              {speakers.length > 2 && (
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={`Remove speaker ${i + 1}`}
                  icon={<X className="size-3.5" />}
                  onClick={() => removeSpeaker(i)}
                />
              )}
            </div>
          ))}
        </div>
        {speakers.length < MAX_SPEAKERS && (
          <Button
            className="mt-2"
            variant="ghost"
            size="sm"
            icon={<Plus className="size-3.5" />}
            onClick={addSpeaker}
          >
            Add speaker
          </Button>
        )}
      </div>

      <div className="mt-4">
        <Label required>Script</Label>
        <Textarea
          rows={10}
          value={script}
          maxLength={MAX_SCRIPT_CHARS}
          onChange={(e) => setScript(e.target.value)}
          placeholder={DIALOGUE_PLACEHOLDER}
        />
        <FieldHint>
          One line per turn: "Name: line", or add a delivery note in parentheses - "Name (emotion): line" -
          e.g. "Guest (nervous, half-laughing): ...". Lines with no "Name:" prefix continue the previous
          speaker's turn. {script.length}/{MAX_SCRIPT_CHARS} characters
        </FieldHint>
        {hasCloneSpeaker && scriptHasEmotionNotes && (
          <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
            Cloned voices don't support delivery notes - the TTS engine has no style-instruction input for
            clone mode, so "(...)" notes will be ignored for {speakers.filter((s) => s.voice.startsWith("clone:")).map((s) => s.name).join(", ")}.
            Use a preset voice for that speaker if emotion matters here.
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-lg border border-border-light px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Zap className="size-3.5 text-text-tertiary" />
          <div>
            <p className="text-sm font-medium text-text-primary">Fast generation</p>
            <p className="text-xs text-text-tertiary">Uses the 0.6B model for quicker results, lower quality</p>
          </div>
        </div>
        <Switch checked={fastMode} onChange={setFastMode} />
      </div>

      <Button
        className="mt-5 w-full"
        variant="primary"
        size="lg"
        icon={generating ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
        disabled={disabled}
        onClick={onGenerate}
      >
        {generating ? "Generating..." : "Generate Dialogue"}
      </Button>
      {generating && (
        <p className="mt-2 text-center text-xs text-text-tertiary">
          Each turn is synthesized in order - you can start listening to earlier turns while later ones are
          still generating.
        </p>
      )}
    </>
  );
};

export default DialoguePanel;
