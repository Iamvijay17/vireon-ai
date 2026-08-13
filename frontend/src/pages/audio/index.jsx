import { useState, useEffect, useCallback, useRef } from "react";
import { AudioLines, Mic2 } from "lucide-react";
import {
  generateAudio,
  generateDialogueAudio,
  getAudioGenerations,
  deleteAudioGeneration,
  getVoices,
} from "../../services/api";
import {
  connect,
  joinJobRoom,
  leaveJobRoom,
  onAudioStudioTurnReady,
  onAudioStudioChunkReady,
  onAudioStudioCompleted,
  onAudioStudioFailed,
} from "../../services/socket";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Tabs } from "../../components/ui/Tabs";
import { VoiceLibrary } from "../../components/ui/VoiceLibrary";
import { useFavoriteVoices } from "../../shared/useFavoriteVoices";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";
import { loadSettings } from "../../shared/settingsStorage";
import { SingleVoicePanel } from "./SingleVoicePanel";
import { DialoguePanel } from "./DialoguePanel";
import { HistoryPanel } from "./HistoryPanel";

const FALLBACK_VOICES = [
  { value: "female-1", label: "Female Voice 1" },
  { value: "male-1", label: "Male Voice 1" },
];

const DEFAULT_SPEAKERS = [
  { name: "Host", voice: "" },
  { name: "Guest", voice: "" },
];

// Fallback poll while a generation is in flight, purely as a safety net in
// case a socket event gets dropped (tab backgrounded, brief reconnect) -
// the socket events below are the primary progress mechanism, this is not.
const SAFETY_POLL_MS = 15000;

const AudioPage = () => {
  const [mode, setMode] = useState("single");

  // Single-voice mode
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("");
  const [emotion, setEmotion] = useState("");

  // Dialogue mode
  const [speakers, setSpeakers] = useState(DEFAULT_SPEAKERS);
  const [script, setScript] = useState("");

  // Shared across both modes: use the smaller/faster Qwen3-TTS 0.6B model
  // instead of the default 1.7B - trades some quality for speed. Defaults
  // to the Settings page's "Fast Audio Generation" preference.
  const [fastMode, setFastMode] = useState(() => loadSettings().fastAudioGeneration);

  const [voiceCatalog, setVoiceCatalog] = useState({ custom: [], clone: [] });
  const [generating, setGenerating] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const { isFavorite, toggleFavorite } = useFavoriteVoices();

  // Voice Library modal - `target` is "single" or a speaker index (number),
  // so the same browser feeds either the single-voice field or one dialogue
  // speaker's voice depending on which "Browse voices" affordance opened it.
  const [libraryTarget, setLibraryTarget] = useState(null);

  // Id of the AudioGeneration record currently streaming progress over the
  // socket - only one generation can be in flight at a time (the Generate
  // button is disabled while `generating`), so a single ref is enough.
  const trackedIdRef = useRef(null);

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

  const fetchHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const res = await getAudioGenerations(1, 50);
      const items = res.data?.items || [];
      setHistory(items);
      setHistoryError(null);
      return items;
    } catch (err) {
      // Deliberately don't clear `history` here - a transient failure (the
      // backend restarting, a network blip) would otherwise render exactly
      // like "no generations yet" and make already-generated audio look
      // like it vanished, when it's still safely in the DB. Show an
      // explicit retry instead of silently looking empty.
      setHistoryError(err.friendlyMessage || "Failed to load audio history");
      return null;
    } finally {
      setHistoryLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Live progress: join the in-flight generation's own room (any entity id
  // works here, not just video jobs - see SocketService.emitToJob) and patch
  // that one history item's turns/chunks in place as they arrive, instead of
  // waiting for the whole (possibly multi-minute) request to resolve.
  useEffect(() => {
    connect();

    const patchPieces = (id, key, index, piece) => {
      if (id !== trackedIdRef.current) return;
      setHistory((prev) =>
        prev.map((h) => {
          if (h._id !== id) return h;
          const pieces = [...(h[key] || [])];
          pieces[index] = piece;
          return { ...h, [key]: pieces };
        })
      );
    };

    const unsubTurn = onAudioStudioTurnReady(({ id, turnIndex, turn }) => patchPieces(id, "turns", turnIndex, turn));
    const unsubChunk = onAudioStudioChunkReady(({ id, chunkIndex, chunk }) => patchPieces(id, "chunks", chunkIndex, chunk));
    const unsubCompleted = onAudioStudioCompleted(({ id, audio }) => {
      if (id !== trackedIdRef.current) return;
      setHistory((prev) => [audio, ...prev.filter((h) => h._id !== id)]);
    });
    const unsubFailed = onAudioStudioFailed(({ id, error }) => {
      if (id !== trackedIdRef.current) return;
      setHistory((prev) => prev.map((h) => (h._id === id ? { ...h, status: "FAILED", error } : h)));
    });

    return () => {
      unsubTurn();
      unsubChunk();
      unsubCompleted();
      unsubFailed();
    };
  }, []);

  // Kicks off tracking for a new generation once its record shows up in
  // history: the create-then-generate request is one long synchronous call,
  // so the client only learns the record's id via this side-channel refetch
  // (the same 700ms delay the old polling-only version used to first surface
  // "Pending"), not from the request itself, which doesn't resolve until
  // everything is done.
  const trackNewGeneration = (previousIds) => {
    const timer = setTimeout(async () => {
      const items = await fetchHistory();
      const created = items?.find((h) => !previousIds.has(h._id) && h.status === "PENDING");
      if (created) {
        trackedIdRef.current = created._id;
        joinJobRoom(created._id);
      }
    }, 700);
    return () => clearTimeout(timer);
  };

  const stopTracking = () => {
    if (trackedIdRef.current) {
      leaveJobRoom(trackedIdRef.current);
      trackedIdRef.current = null;
    }
  };

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
    const previousIds = new Set(history.map((h) => h._id));
    let cancelDiscovery = () => {};
    try {
      setGenerating(true);
      const genPromise = generateAudio({ text: trimmed, voice, emotion: emotion.trim(), fastMode });
      cancelDiscovery = trackNewGeneration(previousIds);
      // Slow safety-net poll in case a socket event is dropped.
      const safetyPoll = setInterval(() => fetchHistory(), SAFETY_POLL_MS);
      const res = await genPromise.finally(() => clearInterval(safetyPoll));
      setHistory((prev) => [res.data.audio, ...prev.filter((h) => h._id !== res.data.audio._id)]);
      setHistoryError(null);
      toast.success("Audio generated");
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to generate audio");
    } finally {
      cancelDiscovery();
      stopTracking();
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
    const previousIds = new Set(history.map((h) => h._id));
    let cancelDiscovery = () => {};
    try {
      setGenerating(true);
      const genPromise = generateDialogueAudio({ script: trimmedScript, speakers: cleanSpeakers, fastMode });
      cancelDiscovery = trackNewGeneration(previousIds);
      const safetyPoll = setInterval(() => fetchHistory(), SAFETY_POLL_MS);
      const res = await genPromise.finally(() => clearInterval(safetyPoll));
      setHistory((prev) => [res.data.audio, ...prev.filter((h) => h._id !== res.data.audio._id)]);
      setHistoryError(null);
      toast.success("Dialogue generated");
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to generate dialogue audio");
    } finally {
      cancelDiscovery();
      stopTracking();
      setGenerating(false);
    }
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

          <div className="p-6">
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
