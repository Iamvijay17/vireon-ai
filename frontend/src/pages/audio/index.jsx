import { useState, useEffect } from "react";
import { AudioLines, Mic2 } from "lucide-react";
import { generateAudio, generateDialogueAudio, getVoices, getTtsVoices } from "../../services/api";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Tabs } from "../../components/ui/Tabs";
import { VoiceLibrary } from "../../components/ui/VoiceLibrary";
import { useFavoriteVoices } from "../../shared/useFavoriteVoices";
import { toast } from "../../components/ui/toastBus";
import { loadSettings } from "../../shared/settingsStorage";
import { DEFAULT_DIRECTION, buildPreviewRequest } from "../../shared/ttsPreview";
import { useTtsPreview } from "../../shared/useTtsPreview";
import { SingleVoicePanel } from "./SingleVoicePanel";
import { DialoguePanel } from "./DialoguePanel";
import { HistoryPanel } from "./HistoryPanel";
import { useAudioHistory } from "./useAudioHistory";

const FALLBACK_VOICES = [
  { value: "female-1", label: "Female Voice 1" },
  { value: "male-1", label: "Male Voice 1" },
];

const DEFAULT_SPEAKERS = [
  { name: "Host", voice: "" },
  { name: "Guest", voice: "" },
];

const AudioPage = () => {
  const [mode, setMode] = useState("single");

  // Single-voice mode
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("");
  const [emotion, setEmotion] = useState("");

  // Voice direction (style / emotion / speed / pitch / pronunciation) - used by
  // Preview, which runs the narration pipeline. All "Auto" until touched.
  const [direction, setDirection] = useState(DEFAULT_DIRECTION);
  const [ttsOptions, setTtsOptions] = useState(null);
  const preview = useTtsPreview();

  // Dialogue mode
  const [speakers, setSpeakers] = useState(DEFAULT_SPEAKERS);
  const [script, setScript] = useState("");

  // Shared across both modes: use the smaller/faster Qwen3-TTS 0.6B model
  // instead of the default 1.7B - trades some quality for speed. Defaults
  // to the Settings page's "Fast Audio Generation" preference.
  const [fastMode, setFastMode] = useState(() => loadSettings().fastAudioGeneration);

  const [voiceCatalog, setVoiceCatalog] = useState({ custom: [], clone: [] });
  const [generating, setGenerating] = useState(false);
  const { history, historyLoading, historyError, fetchHistory, deletingId, handleDelete, runTracked } = useAudioHistory();
  const { isFavorite, toggleFavorite } = useFavoriteVoices();

  // Voice Library modal - `target` is "single" or a speaker index (number),
  // so the same browser feeds either the single-voice field or one dialogue
  // speaker's voice depending on which "Browse voices" affordance opened it.
  const [libraryTarget, setLibraryTarget] = useState(null);

  const voiceOptions = [
    ...voiceCatalog.custom.map((v) => ({
      value: v.id,
      label: v.label,
      description: "Custom",
      previewUrl: v.previewUrl,
      tags: v.tags,
      gender: v.gender,
    })),
    ...voiceCatalog.clone.map((v) => ({
      value: v.id,
      label: v.label,
      description: "Clone",
      previewUrl: v.previewUrl,
      tags: v.tags,
      gender: v.gender,
    })),
  ];
  if (voiceOptions.length === 0) voiceOptions.push(...FALLBACK_VOICES);

  useEffect(() => {
    let cancelled = false;
    getVoices()
      .then((res) => {
        if (cancelled) return;
        const catalog = res.data || { custom: [], clone: [] };
        setVoiceCatalog(catalog);
        const first = catalog.custom?.[0]?.id || catalog.clone?.[0]?.id;
        const second = catalog.custom?.[1]?.id || catalog.clone?.[1]?.id || first;
        if (first) setVoice((prev) => prev || first);
        setSpeakers((prev) =>
          prev.map((s, i) => (s.voice ? s : { ...s, voice: i === 0 ? first : second }))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // The Voice Studio options are an enhancement - if the endpoint is
  // unavailable the page works exactly as before, just without those controls.
  useEffect(() => {
    let cancelled = false;
    getTtsVoices()
      .then((res) => { if (!cancelled) setTtsOptions(res.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handlePickPreset = (profile) => {
    setVoice(profile.voice);
    setDirection((prev) => ({ ...prev, style: profile.defaultStyle }));
  };

  // A preset reads as selected only while its voice and style are still in effect.
  const activePreset = ttsOptions?.profiles?.find((p) => p.voice === voice && p.defaultStyle === direction.style)?.id ?? null;

  const handlePreview = () => {
    if (!text.trim() || !voice || voice.trim() === "design:") {
      toast.error("Enter some text and select a voice to preview");
      return;
    }
    preview.generate(
      buildPreviewRequest({
        text,
        voice,
        direction,
        fastMode,
        maxChars: ttsOptions?.limits?.previewMaxChars,
      })
    );
  };

  // Shared by both modes: validation happens in the caller, this owns the
  // generating flag and the result toasts.
  const runGeneration = async (start, successMessage, errorMessage) => {
    try {
      setGenerating(true);
      await runTracked(start);
      toast.success(successMessage);
    } catch (err) {
      toast.error(err.friendlyMessage || errorMessage);
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerate = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      toast.error("Enter some text to generate");
      return;
    }
    if (!voice || voice.trim() === "design:") {
      toast.error("Select a voice");
      return;
    }
    runGeneration(
      () => generateAudio({ text: trimmed, voice, emotion: emotion.trim(), fastMode }),
      "Audio generated",
      "Failed to generate audio"
    );
  };

  const handleGenerateDialogue = () => {
    const trimmedScript = script.trim();
    if (!trimmedScript) {
      toast.error("Enter a script to generate");
      return;
    }
    const cleanSpeakers = speakers.map((s) => ({ name: s.name.trim(), voice: s.voice.trim() }));
    if (cleanSpeakers.some((s) => !s.name || !s.voice || s.voice === "design:")) {
      toast.error("Every speaker needs a name and a voice");
      return;
    }
    runGeneration(
      () => generateDialogueAudio({ script: trimmedScript, speakers: cleanSpeakers, fastMode }),
      "Dialogue generated",
      "Failed to generate dialogue audio"
    );
  };

  const updateSpeaker = (index, patch) => {
    setSpeakers((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const addSpeaker = () => {
    if (speakers.length >= 6) return;
    setSpeakers((prev) => [...prev, { name: "", voice: voiceOptions[0]?.value || "" }]);
  };

  const removeSpeaker = (index) => {
    if (speakers.length <= 2) return;
    setSpeakers((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLibrarySelect = (voiceId) => {
    if (libraryTarget === "single") setVoice(voiceId);
    else if (typeof libraryTarget === "number") updateSpeaker(libraryTarget, { voice: voiceId });
  };

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">Audio Studio</h1>
        <Badge variant="accent" icon={<AudioLines className="size-3" />}>
          Text to Speech
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="animate-slide-up">
          <Tabs
            className="px-6 pt-1"
            active={mode}
            onChange={setMode}
            items={[
              { key: "single", label: "Single Voice", icon: <AudioLines className="size-3.5" /> },
              { key: "dialogue", label: "Multi-Speaker", icon: <Mic2 className="size-3.5" /> },
            ]}
          />

          <div className="p-4 sm:p-6">
            {mode === "single" ? (
              <SingleVoicePanel
                text={text}
                setText={setText}
                voice={voice}
                setVoice={setVoice}
                emotion={emotion}
                setEmotion={setEmotion}
                voiceOptions={voiceOptions}
                isFavorite={isFavorite}
                toggleFavorite={toggleFavorite}
                onBrowseVoices={() => setLibraryTarget("single")}
                generating={generating}
                onGenerate={handleGenerate}
                fastMode={fastMode}
                setFastMode={setFastMode}
                ttsOptions={ttsOptions}
                direction={direction}
                setDirection={setDirection}
                activePreset={activePreset}
                onPickPreset={handlePickPreset}
                preview={preview}
                onPreview={ttsOptions ? handlePreview : undefined}
              />
            ) : (
              <DialoguePanel
                speakers={speakers}
                updateSpeaker={updateSpeaker}
                addSpeaker={addSpeaker}
                removeSpeaker={removeSpeaker}
                script={script}
                setScript={setScript}
                voiceOptions={voiceOptions}
                isFavorite={isFavorite}
                toggleFavorite={toggleFavorite}
                onBrowseVoices={(index) => setLibraryTarget(index)}
                generating={generating}
                onGenerate={handleGenerateDialogue}
                fastMode={fastMode}
                setFastMode={setFastMode}
              />
            )}
          </div>
        </Card>

        <HistoryPanel
          history={history}
          historyLoading={historyLoading}
          historyError={historyError}
          fetchHistory={fetchHistory}
          deletingId={deletingId}
          onDelete={handleDelete}
        />
      </div>

      <VoiceLibrary
        open={libraryTarget !== null}
        onClose={() => setLibraryTarget(null)}
        options={voiceOptions}
        value={libraryTarget === "single" ? voice : typeof libraryTarget === "number" ? speakers[libraryTarget]?.voice : null}
        onSelect={handleLibrarySelect}
        isFavorite={isFavorite}
        onToggleFavorite={toggleFavorite}
      />
    </div>
  );
};

export default AudioPage;
