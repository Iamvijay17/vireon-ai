import { Wand2, Loader2, Library, Zap } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Textarea, Label, FieldHint, Input } from "../../components/ui/Input";
import { VoiceSelect } from "../../components/ui/VoiceSelect";
import { Switch } from "../../components/ui/Switch";

const MAX_CHARS = 5000;

// Single-voice tab of Audio Studio - extracted from pages/audio/index.jsx so
// the shell doesn't grow unbounded as the voice library / progressive
// playback features get added on top.
export const SingleVoicePanel = ({
  text,
  setText,
  voice,
  setVoice,
  emotion,
  setEmotion,
  voiceOptions,
  isFavorite,
  toggleFavorite,
  onBrowseVoices,
  generating,
  onGenerate,
  fastMode,
  setFastMode,
}) => {
  const disabled = generating || !text.trim() || !voice;

  return (
    <>
      <div>
        <Label required>Text</Label>
        <Textarea
          rows={10}
          value={text}
          maxLength={MAX_CHARS}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type or paste the text you want to turn into speech..."
        />
        <FieldHint>{text.length}/{MAX_CHARS} characters</FieldHint>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between">
          <Label required className="mb-0">Voice</Label>
          <button
            type="button"
            onClick={onBrowseVoices}
            className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            <Library className="size-3" />
            Browse voices
          </button>
        </div>
        <VoiceSelect
          options={voiceOptions}
          value={voice}
          onChange={setVoice}
          placeholder="Select a voice..."
          isFavorite={isFavorite}
          onToggleFavorite={toggleFavorite}
        />
      </div>

      <div className="mt-4">
        <Label>Emotion / Delivery (optional)</Label>
        <Input
          value={emotion}
          maxLength={200}
          onChange={(e) => setEmotion(e.target.value)}
          placeholder="e.g. cheerful and energetic, calm and slow, whispering, angry..."
        />
        <FieldHint>Describe how it should sound. Leave blank for a natural narrator delivery.</FieldHint>
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
        {generating ? "Generating..." : "Generate Audio"}
      </Button>
      {generating && (
        <p className="mt-2 text-center text-xs text-text-tertiary">
          Longer text is split into pieces you can start hearing before the whole thing finishes.
        </p>
      )}
    </>
  );
};

export default SingleVoicePanel;
