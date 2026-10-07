import { Wand2, Loader2, Library, Zap, Sparkles, Play } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Textarea, Label, FieldHint, Input } from "../../components/ui/Input";
import { VoiceSelect } from "../../components/ui/VoiceSelect";
import { Switch } from "../../components/ui/Switch";
import { AudioPlayer } from "../../components/ui/AudioPlayer";
import { Badge } from "../../components/ui/Badge";
import { VoiceDirection } from "../../components/voice/VoiceDirection";
import { describeCache } from "../../shared/ttsPreview";

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
  ttsOptions,
  direction,
  setDirection,
  activePreset,
  onPickPreset,
  preview,
  onPreview,
}) => {
  const isDesignVoice = voice.startsWith("design:");
  const designDescription = isDesignVoice ? voice.slice("design:".length) : "";
  const disabled = generating || !text.trim() || !voice || (isDesignVoice && !designDescription.trim());

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
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setVoice(isDesignVoice ? "" : "design:")}
              className="flex cursor-pointer items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              <Sparkles className="size-3" />
              {isDesignVoice ? "Pick from voice library" : "Design a voice"}
            </button>
            {!isDesignVoice && (
              <button
                type="button"
                onClick={onBrowseVoices}
                className="flex cursor-pointer items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                <Library className="size-3" />
                Browse voices
              </button>
            )}
          </div>
        </div>
        {isDesignVoice ? (
          <>
            <Input
              value={designDescription}
              maxLength={250}
              onChange={(e) => setVoice(`design:${e.target.value}`)}
              placeholder="e.g. Young energetic male American voice, warm and confident, podcast host tone"
            />
            <FieldHint>
              Synthesizes a brand-new voice matching this description (not a real recording) - unlike cloned
              voices, it fully supports the Emotion/Delivery field below.
            </FieldHint>
          </>
        ) : (
          <VoiceSelect
            options={voiceOptions}
            value={voice}
            onChange={setVoice}
            placeholder="Select a voice..."
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
          />
        )}
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

      {ttsOptions && (
        <div className="mt-4">
          <VoiceDirection
            options={ttsOptions}
            direction={direction}
            setDirection={setDirection}
            onPickPreset={onPickPreset}
            activePreset={activePreset}
            disabled={generating}
          />
        </div>
      )}

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

      {onPreview && (
        <div className="mt-5">
          <Button
            className="w-full"
            variant="secondary"
            icon={preview?.loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            disabled={generating || preview?.loading || !text.trim() || !voice || (isDesignVoice && !designDescription.trim())}
            onClick={onPreview}
          >
            {preview?.loading ? "Generating preview..." : "Preview"}
          </Button>
          <p className="mt-1.5 text-center text-xs text-text-tertiary">
            Hears the first part of your text with the voice direction above - no video needed.
          </p>
          {preview?.error && <p className="mt-2 text-center text-xs text-danger-500">{preview.error}</p>}
          {preview?.url && (
            <div className="mt-3 space-y-2">
              <AudioPlayer src={preview.url} />
              <div className="flex flex-wrap items-center gap-1.5">
                {preview.meta?.durationMs && <Badge>{(preview.meta.durationMs / 1000).toFixed(1)}s</Badge>}
                {describeCache(preview.meta?.cache) && <Badge variant="info">{describeCache(preview.meta.cache)}</Badge>}
                {preview.meta?.style && <Badge variant="accent">{preview.meta.style}</Badge>}
              </div>
              {preview.meta?.note && <p className="text-xs text-text-tertiary">{preview.meta.note}</p>}
            </div>
          )}
        </div>
      )}

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
