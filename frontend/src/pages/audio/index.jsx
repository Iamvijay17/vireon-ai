import { useState, useEffect, useCallback } from "react";
import { AudioLines, Wand2, Download, Trash2, Loader2, Plus, X, Mic2, RefreshCw } from "lucide-react";
import {
  generateAudio,
  generateDialogueAudio,
  getAudioGenerations,
  deleteAudioGeneration,
  getVoices,
  resolveMediaUrl,
} from "../../services/api";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Textarea, Label, FieldHint, Input } from "../../components/ui/Input";
import { VoiceSelect } from "../../components/ui/VoiceSelect";
import { AudioPlayer } from "../../components/ui/AudioPlayer";
import { Spinner } from "../../components/ui/Spinner";
import { Tabs } from "../../components/ui/Tabs";
import { useFavoriteVoices } from "../../shared/useFavoriteVoices";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";

const MAX_CHARS = 5000;
const MAX_SCRIPT_CHARS = 20000;
const MAX_SPEAKERS = 6;

const FALLBACK_VOICES = [
  { value: "female-1", label: "Female Voice 1" },
  { value: "male-1", label: "Male Voice 1" },
];

const DEFAULT_SPEAKERS = [
  { name: "Host", voice: "" },
  { name: "Guest", voice: "" },
];

const DIALOGUE_PLACEHOLDER = `Host: Welcome back to the show! Today we're talking about something really interesting.
Guest (a little nervous, half-laughing): Thanks for having me, I'm excited to dig into this.
Host (warm and curious): So let's start from the beginning...`;

const AudioPage = () => {
  const [mode, setMode] = useState("single");

  // Single-voice mode
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("");
  const [emotion, setEmotion] = useState("");

  // Dialogue mode
  const [speakers, setSpeakers] = useState(DEFAULT_SPEAKERS);
  const [script, setScript] = useState("");

  const [voiceCatalog, setVoiceCatalog] = useState({ custom: [], clone: [] });
  const [generating, setGenerating] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const { isFavorite, toggleFavorite } = useFavoriteVoices();

  const voiceOptions = [
    ...voiceCatalog.custom.map((v) => ({ value: v.id, label: v.label, description: "Custom", previewUrl: v.previewUrl })),
    ...voiceCatalog.clone.map((v) => ({ value: v.id, label: v.label, description: "Clone", previewUrl: v.previewUrl })),
  ];
  if (voiceOptions.length === 0) voiceOptions.push(...FALLBACK_VOICES);

  const fetchHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const res = await getAudioGenerations(1, 50);
      setHistory(res.data?.items || []);
      setHistoryError(null);
    } catch (err) {
      // Deliberately don't clear `history` here - a transient failure (the
      // backend restarting, a network blip) would otherwise render exactly
      // like "no generations yet" and make already-generated audio look
      // like it vanished, when it's still safely in the DB. Show an
      // explicit retry instead of silently looking empty.
      setHistoryError(err.friendlyMessage || "Failed to load audio history");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

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

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleGenerate = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      toast.error("Enter some text to generate");
      return;
    }
    if (!voice) {
      toast.error("Select a voice");
      return;
    }
    try {
      setGenerating(true);
      const res = await generateAudio({ text: trimmed, voice, emotion: emotion.trim() });
      setHistory((prev) => [res.data.audio, ...prev]);
      setHistoryError(null);
      toast.success("Audio generated");
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to generate audio");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateDialogue = async () => {
    const trimmedScript = script.trim();
    if (!trimmedScript) {
      toast.error("Enter a script to generate");
      return;
    }
    const cleanSpeakers = speakers.map((s) => ({ name: s.name.trim(), voice: s.voice }));
    if (cleanSpeakers.some((s) => !s.name || !s.voice)) {
      toast.error("Every speaker needs a name and a voice");
      return;
    }
    try {
      setGenerating(true);
      const res = await generateDialogueAudio({ script: trimmedScript, speakers: cleanSpeakers });
      setHistory((prev) => [res.data.audio, ...prev]);
      setHistoryError(null);
      toast.success("Dialogue generated");
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to generate dialogue audio");
    } finally {
      setGenerating(false);
    }
  };

  const updateSpeaker = (index, patch) => {
    setSpeakers((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const addSpeaker = () => {
    if (speakers.length >= MAX_SPEAKERS) return;
    setSpeakers((prev) => [...prev, { name: "", voice: voiceOptions[0]?.value || "" }]);
  };

  const removeSpeaker = (index) => {
    if (speakers.length <= 2) return;
    setSpeakers((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDelete = async (item) => {
    const ok = await confirmDialog({
      title: "Delete this audio?",
      content: "This removes the generated file(s) and its history entry. This can't be undone.",
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      setDeletingId(item._id);
      await deleteAudioGeneration(item._id);
      setHistory((prev) => prev.filter((h) => h._id !== item._id));
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to delete audio");
    } finally {
      setDeletingId(null);
    }
  };

  const isSingle = mode === "single";
  const generateDisabled = isSingle ? generating || !text.trim() || !voice : generating || !script.trim();

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

          <div className="p-6">
            {isSingle ? (
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
                  <Label required>Voice</Label>
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
              </>
            ) : (
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
                </div>
              </>
            )}

            <Button
              className="mt-5 w-full"
              variant="primary"
              size="lg"
              icon={generating ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
              disabled={generateDisabled}
              onClick={isSingle ? handleGenerate : handleGenerateDialogue}
            >
              {generating ? "Generating..." : isSingle ? "Generate Audio" : "Generate Dialogue"}
            </Button>
            {generating && (
              <p className="mt-2 text-center text-xs text-text-tertiary">
                {isSingle
                  ? "This can take up to a minute for longer text."
                  : "Each turn is synthesized in order - longer scripts can take several minutes."}
              </p>
            )}
          </div>
        </Card>

        <Card className="h-fit animate-slide-up" style={{ "--stagger-index": 0.5 }}>
          <CardHeader title="History" subtitle={`${history.length} generation${history.length === 1 ? "" : "s"}`} />
          <div className="max-h-[560px] overflow-y-auto p-5">
            {historyLoading ? (
              <div className="flex justify-center py-8">
                <Spinner size="sm" />
              </div>
            ) : historyError ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <p className="text-[13px] text-danger-500">{historyError}</p>
                <p className="text-xs text-text-tertiary">
                  Your generations are safe on the server - this just couldn't load them.
                </p>
                <Button variant="secondary" size="sm" icon={<RefreshCw className="size-3.5" />} onClick={fetchHistory}>
                  Retry
                </Button>
              </div>
            ) : history.length === 0 ? (
              <p className="text-[13px] text-text-tertiary">Generated audio will appear here.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {history.map((item) => (
                  <div key={item._id} className="rounded-xl border border-border-light p-3">
                    {item.mode === "dialogue" ? (
                      <>
                        <div className="mb-2 flex flex-wrap items-center gap-1.5">
                          <Mic2 className="size-3.5 text-text-tertiary" />
                          {(item.speakers || []).map((s) => (
                            <Badge key={s.name} variant="neutral">{s.name}</Badge>
                          ))}
                        </div>
                        <div className="mb-2 flex flex-col gap-0.5">
                          {(item.turns || []).map((turn) => (
                            <p key={turn.order} className="text-[11px] text-text-tertiary">
                              <span className="font-medium">{turn.speaker}:</span> {turn.text}
                              {turn.emotion && <span className="ml-1 italic">({turn.emotion})</span>}
                            </p>
                          ))}
                        </div>
                        {item.status === "COMPLETED" && item.audioUrl ? (
                          <AudioPlayer src={resolveMediaUrl(item.audioUrl)} />
                        ) : item.status === "FAILED" ? (
                          <Badge variant="danger">Failed{item.error ? `: ${item.error}` : ""}</Badge>
                        ) : (
                          <Badge variant="neutral" icon={<Loader2 className="size-3 animate-spin" />}>Pending</Badge>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="mb-2 line-clamp-2 text-[13px] text-text-secondary">{item.text}</p>
                        {item.emotion && (
                          <p className="mb-2 text-[11px] italic text-text-tertiary">Delivery: {item.emotion}</p>
                        )}
                        {item.status === "COMPLETED" && item.audioUrl ? (
                          <AudioPlayer src={resolveMediaUrl(item.audioUrl)} />
                        ) : item.status === "FAILED" ? (
                          <Badge variant="danger">Failed{item.error ? `: ${item.error}` : ""}</Badge>
                        ) : (
                          <Badge variant="neutral" icon={<Loader2 className="size-3 animate-spin" />}>Pending</Badge>
                        )}
                      </>
                    )}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-text-tertiary">
                        {item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}
                      </span>
                      <div className="flex items-center gap-1">
                        {item.status === "COMPLETED" && item.audioUrl && (
                          <Button
                            variant="ghost"
                            size="xs"
                            iconOnly
                            aria-label="Download"
                            icon={<Download className="size-3.5" />}
                            href={resolveMediaUrl(item.audioUrl)}
                            download
                          />
                        )}
                        <Button
                          variant="ghost"
                          size="xs"
                          iconOnly
                          aria-label="Delete"
                          loading={deletingId === item._id}
                          icon={<Trash2 className="size-3.5" />}
                          onClick={() => handleDelete(item)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AudioPage;
