import { useState, useEffect } from "react";
import {
  CheckCircle2,
  Rocket,
  ArrowLeft,
  ArrowRight,
  Send,
  Copy,
  Check,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createVideoJob, getVoices } from "../../services/api";
import { useFavoriteVoices } from "../../shared/useFavoriteVoices";
import { loadSettings } from "../../shared/settingsStorage";
import { LoadingState } from "../../components";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Steps } from "../../components/ui/Steps";
import { Select } from "../../components/ui/Select";
import { VoiceSelect } from "../../components/ui/VoiceSelect";
import { Input, Textarea, Label, FieldHint } from "../../components/ui/Input";
import { Badge } from "../../components/ui/Badge";
import { Switch } from "../../components/ui/Switch";
import { toast } from "../../components/ui/toastBus";
import { cn } from "../../components/ui/cn";

const VIDEO_TYPES = [
  { value: "educational", label: "Educational" },
  { value: "marketing", label: "Marketing" },
  { value: "story", label: "Story" },
  { value: "youtube_shorts", label: "YouTube Shorts" },
  { value: "podcast", label: "Podcast" },
  { value: "motivational", label: "Motivational" },
  { value: "business", label: "Business" },
];

const RESOLUTIONS = [
  { value: "1920x1080", label: "1080p (1920x1080)" },
  { value: "1080x1920", label: "1080p Vertical (1080x1920)" },
  { value: "1280x720", label: "720p (1280x720)" },
  { value: "720x1280", label: "720p Vertical (720x1280)" },
  { value: "3840x2160", label: "4K (3840x2160)" },
  { value: "2160x3840", label: "4K Vertical (2160x3840)" },
];

// YouTube Shorts must be vertical - backend rejects anything else for this
// type (see createVideoSchema's superRefine).
const VERTICAL_RESOLUTIONS = RESOLUTIONS.filter((r) => {
  const [width, height] = r.value.split("x").map(Number);
  return height > width;
});

// Shown while the real voice catalog is loading (or if it fails to load).
const FALLBACK_VOICES = [
  { value: "female-1", label: "Female Voice 1" },
  { value: "male-1", label: "Male Voice 1" },
];

const LANGUAGES = [{ value: "english", label: "English" }];

// Curated host/guest voice pairs, picked for clear contrast (gender, tone,
// or accent) so the two speakers are always easy to tell apart - a plain
// "pick any two voices" UI lets people land on two similar-sounding voices,
// which is what prompted this. Each pair is filtered against the loaded
// voice catalog before being shown, since these reference specific clone
// files that may not exist in every backend/voices/ directory.
const PODCAST_VOICE_PAIRS = [
  {
    label: "Radio Host & Conversational",
    hostVoice: "clone:matt-dramatic-radio-podcast-host.mp3",
    guestVoice: "clone:eliza-conversational-podcast-host.mp3",
    hostName: "Matt",
    guestName: "Eliza",
  },
  {
    label: "Deep & Energetic",
    hostVoice: "clone:morgan-deep-powerful-and-confident.mp3",
    guestVoice: "clone:hope-vibrant-warm-and-innocent.mp3",
    hostName: "Morgan",
    guestName: "Hope",
  },
  {
    label: "Warm & Professional",
    hostVoice: "clone:chris-charismatic-warm-confident.mp3",
    guestVoice: "clone:victoria-warm-trustworthy-and-relatable.mp3",
    hostName: "Chris",
    guestName: "Victoria",
  },
  {
    label: "British Duo",
    hostVoice: "clone:nathaniel-engaging-british-and-calm.mp3",
    guestVoice: "clone:tamsin-engaging-british-storyteller-and-narrator.mp3",
    hostName: "Nathaniel",
    guestName: "Tamsin",
  },
  {
    label: "Storyteller & Mystery",
    hostVoice: "clone:william-deep-engaging-storyteller.mp3",
    guestVoice: "clone:valory-mysterious-calm-and-natural.mp3",
    hostName: "William",
    guestName: "Valory",
  },
];

// Best-effort first name from a voice's catalog label - custom presets are
// already a bare first name (e.g. "Aiden"), clone voices are titleized from
// a "name-descriptive-words.ext" filename (e.g. "Matt Dramatic Radio
// Podcast Host") so the first word is the name. Used to pre-fill the
// Host/Guest name fields when a voice is picked without a Quick Pair.
const deriveNameFromVoiceLabel = (label) => (label || "").trim().split(/\s+/)[0] || "";

const DURATIONS = [
  { value: 5, label: "5 minutes" },
  { value: 8, label: "8 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 20, label: "20 minutes" },
  { value: 25, label: "25 minutes" },
  { value: 30, label: "30 minutes" },
];

// YouTube Shorts have their own duration scale (YouTube caps Shorts at 3
// minutes) - backend rejects anything else for this type.
const SHORTS_DURATIONS = [
  { value: 1, label: "1 minute" },
  { value: 2, label: "2 minutes" },
  { value: 3, label: "3 minutes" },
];

const STEPS = [
  { title: "Topic & Type" },
  { title: "Voice & Language" },
  { title: "Resolution" },
  { title: "Done" },
];

const DEFAULT_VALUES = {
  topic: "",
  type: undefined,
  duration: 5,
  language: "english",
  voice: "female-1",
  hostVoice: "",
  guestVoice: "",
  hostName: "",
  guestName: "",
  resolution: "1920x1080",
  fastGeneration: false,
};

const isVerticalResolution = (value) => VERTICAL_RESOLUTIONS.some((r) => r.value === value);

// Applies the user's saved preferences (Settings page) on top of the base
// defaults above - e.g. leaving `type` unselected still forces a choice.
const buildInitialValues = () => {
  const prefs = loadSettings();
  const type = VIDEO_TYPES.some((t) => t.value === prefs.defaultVideoType) ? prefs.defaultVideoType : DEFAULT_VALUES.type;
  const resolution = prefs.defaultResolution || DEFAULT_VALUES.resolution;
  const isShorts = type === "youtube_shorts";
  return {
    ...DEFAULT_VALUES,
    type,
    language: LANGUAGES.some((l) => l.value === prefs.defaultLanguage) ? prefs.defaultLanguage : DEFAULT_VALUES.language,
    voice: prefs.defaultVoice || DEFAULT_VALUES.voice,
    // A saved default resolution/duration might not be valid for Shorts
    // (e.g. a landscape default resolution) - fall back to a Shorts-valid
    // default rather than starting the wizard in an invalid state.
    duration: isShorts ? SHORTS_DURATIONS[0].value : DEFAULT_VALUES.duration,
    resolution: isShorts && !isVerticalResolution(resolution) ? VERTICAL_RESOLUTIONS[0].value : resolution,
  };
};

const Wizard = () => {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [values, setValues] = useState(buildInitialValues);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [voiceCatalog, setVoiceCatalog] = useState({ custom: [], clone: [] });
  const { isFavorite, toggleFavorite } = useFavoriteVoices();

  useEffect(() => {
    let cancelled = false;
    getVoices()
      .then((res) => {
        if (cancelled) return;
        const catalog = res.data || { custom: [], clone: [] };
        setVoiceCatalog(catalog);

        // The default value ("female-1") is a legacy key not present in the
        // fetched catalog - swap it for a real option once one is available.
        const allIds = [...(catalog.custom || []), ...(catalog.clone || [])].map((v) => v.id);
        setValues((prev) => (allIds.includes(prev.voice) ? prev : { ...prev, voice: allIds[0] || prev.voice }));
      })
      .catch(() => {
        // Keep FALLBACK_VOICES if the catalog can't be loaded.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const voiceOptions = [
    ...voiceCatalog.custom.map((v) => ({ value: v.id, label: v.label, description: "Custom", previewUrl: v.previewUrl })),
    ...voiceCatalog.clone.map((v) => ({ value: v.id, label: v.label, description: "Clone", previewUrl: v.previewUrl })),
  ];
  if (voiceOptions.length === 0) voiceOptions.push(...FALLBACK_VOICES);

  const voiceIds = new Set(voiceOptions.map((o) => o.value));
  const availableVoicePairs = PODCAST_VOICE_PAIRS.filter(
    (p) => voiceIds.has(p.hostVoice) && voiceIds.has(p.guestVoice)
  );

  const setField = (name, value) => setValues((prev) => ({ ...prev, [name]: value }));

  // Duration and resolution are each constrained to a different set of
  // valid options depending on video type (YouTube Shorts: 1-3 minutes,
  // vertical only; everything else: 5-30 minutes, any resolution) - keep
  // whichever of those two fields is still valid for the new type, and
  // snap the other to a sensible default instead of leaving it pointed at
  // an option that's no longer offered (and that the backend would reject).
  const handleTypeChange = (type) => {
    setValues((prev) => {
      const next = { ...prev, type };
      if (type === "youtube_shorts") {
        if (!SHORTS_DURATIONS.some((d) => d.value === prev.duration)) next.duration = SHORTS_DURATIONS[0].value;
        if (!isVerticalResolution(prev.resolution)) next.resolution = VERTICAL_RESOLUTIONS[0].value;
      } else if (SHORTS_DURATIONS.some((d) => d.value === prev.duration)) {
        next.duration = DEFAULT_VALUES.duration;
      }
      return next;
    });
  };

  const validateStep = (step) => {
    const next = {};
    if (step === 0) {
      if (!values.topic || values.topic.trim().length < 3) next.topic = "At least 3 characters";
      if (!values.type) next.type = "Please select a type";
      if (!values.duration) next.duration = "Please select a duration";
    }
    if (step === 1 && values.type === "podcast") {
      if (!values.hostVoice) next.hostVoice = "Please select a host voice";
      if (!values.guestVoice) next.guestVoice = "Please select a guest voice";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleNext = () => {
    if (!validateStep(current)) return;
    setCurrent((prev) => prev + 1);
  };

  const handleBack = () => setCurrent((prev) => prev - 1);

  const handleSubmit = async () => {
    if (!validateStep(0)) {
      setCurrent(0);
      return;
    }
    try {
      setLoading(true);
      const res = await createVideoJob(values);
      setResult(res.data);
      toast.success("Video job created! Processing started.");
      setCurrent(3);
    } catch (err) {
      const errMsg =
        err.friendlyMessage || "Failed to create job";
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const copyJobId = async () => {
    if (!result?.jobId) return;
    await navigator.clipboard.writeText(result.jobId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold tracking-tight text-text-primary">Create Video</h1>

      <Steps items={STEPS} current={current} className="mb-10 max-w-2xl" />

      <Card className="min-h-105 p-8">
        {current < 3 && (
          <>
            {/* ── Step 1: Topic & Type ──────────────────────────────────────── */}
            {current === 0 && (
              <div className="mx-auto max-w-lg animate-slide-up">
                <h2 className="mb-6 text-base font-semibold text-text-primary">What do you want to create?</h2>

                <div className="mb-5">
                  <Label required>Video Topic</Label>
                  <Textarea
                    rows={3}
                    placeholder="e.g., Introduction to Quantum Computing, The Future of AI, How to Start a Business..."
                    value={values.topic}
                    onChange={(e) => setField("topic", e.target.value)}
                    error={Boolean(errors.topic)}
                  />
                  <FieldHint error={Boolean(errors.topic)}>{errors.topic}</FieldHint>
                </div>

                <div className="mb-5">
                  <Label required>Video Type</Label>
                  <Select
                    placeholder="Select video type"
                    options={VIDEO_TYPES}
                    value={values.type}
                    onChange={handleTypeChange}
                    error={Boolean(errors.type)}
                  />
                  <FieldHint error={Boolean(errors.type)}>{errors.type}</FieldHint>
                </div>

                <div className="mb-5">
                  <Label required>Duration</Label>
                  <Select
                    placeholder="Select duration"
                    options={values.type === "youtube_shorts" ? SHORTS_DURATIONS : DURATIONS}
                    value={values.duration}
                    onChange={(v) => setField("duration", v)}
                    error={Boolean(errors.duration)}
                  />
                  <FieldHint error={Boolean(errors.duration)}>
                    {errors.duration || (values.type === "youtube_shorts" ? "YouTube Shorts are capped at 3 minutes." : undefined)}
                  </FieldHint>
                </div>

                <div className="mb-5">
                  <Label>Language</Label>
                  <Select options={LANGUAGES} value={values.language} onChange={(v) => setField("language", v)} />
                </div>

                <div className="mt-8 flex justify-end">
                  <Button variant="primary" onClick={handleNext} icon={<ArrowRight className="size-4" />}>
                    Next
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step 2: Voice & Language ──────────────────────────────────── */}
            {current === 1 && (
              <div className="mx-auto max-w-lg animate-slide-up">
                <h2 className="mb-6 text-base font-semibold text-text-primary">Configure audio settings</h2>

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
                                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
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
                        <Input
                          placeholder="e.g. Alex"
                          maxLength={80}
                          value={values.hostName}
                          onChange={(e) => setField("hostName", e.target.value)}
                        />
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
                        <Input
                          placeholder="e.g. Jordan"
                          maxLength={80}
                          value={values.guestName}
                          onChange={(e) => setField("guestName", e.target.value)}
                        />
                      </div>
                    </div>
                    <FieldHint>
                      The host and guest take turns in the conversation, each with their own voice - and now their own name, shown on screen and used in the dialogue.
                    </FieldHint>
                  </>
                ) : (
                  <div className="mb-5">
                    <Label>Voice</Label>
                    <VoiceSelect
                      options={voiceOptions}
                      value={values.voice}
                      onChange={(v) => setField("voice", v)}
                      isFavorite={isFavorite}
                      onToggleFavorite={toggleFavorite}
                    />
                    <FieldHint>Custom voices are built-in presets; Clone voices are generated from your reference .wav files in backend/voices/. Click the play button to hear a sample.</FieldHint>
                  </div>
                )}

                <div className="mt-8 flex justify-between">
                  <Button variant="secondary" onClick={handleBack} icon={<ArrowLeft className="size-4" />}>
                    Back
                  </Button>
                  <Button variant="primary" onClick={handleNext} icon={<ArrowRight className="size-4" />}>
                    Next
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step 3: Resolution ─────────────────────────────────────────── */}
            {current === 2 && (
              <div className="mx-auto max-w-lg animate-slide-up">
                <h2 className="mb-6 text-base font-semibold text-text-primary">Choose output quality</h2>

                <div className="mb-6">
                  <Label>Resolution</Label>
                  <Select
                    options={values.type === "youtube_shorts" ? VERTICAL_RESOLUTIONS : RESOLUTIONS}
                    value={values.resolution}
                    onChange={(v) => setField("resolution", v)}
                  />
                  <FieldHint>
                    {values.type === "youtube_shorts"
                      ? "YouTube Shorts are vertical-only."
                      : "Aspect ratio is determined automatically by the resolution you pick."}
                  </FieldHint>
                </div>

                <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4">
                  <div>
                    <Label className="mb-1">Fast Generation</Label>
                    <p className="text-xs text-text-secondary">
                      {values.fastGeneration
                        ? "On: after you approve the script, audio, images, and the final video generate automatically."
                        : "Off: you'll manually trigger each step — approve the script, then generate audio, then generate the video — reviewing in between, like course videos."}
                    </p>
                  </div>
                  <Switch checked={values.fastGeneration} onChange={(v) => setField("fastGeneration", v)} />
                </div>

                <div className="mt-8 flex justify-between">
                  <Button variant="secondary" onClick={handleBack} icon={<ArrowLeft className="size-4" />}>
                    Back
                  </Button>
                  <Button variant="primary" size="lg" icon={<Send className="size-4" />} loading={loading} onClick={handleSubmit}>
                    Create Video
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Step 4: Result ─────────────────────────────────────────────────── */}
        {current === 3 && result && (
          <div className="mx-auto flex max-w-md flex-col items-center py-6 text-center animate-scale-in">
            <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-success-500/10 text-success-500">
              <CheckCircle2 className="size-7" />
            </div>
            <h2 className="text-lg font-semibold text-text-primary">Video Job Created!</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Your video has been queued for processing. You can monitor its progress in real-time.
            </p>

            <div className="mt-6 w-full rounded-xl border border-border bg-bg p-4 text-left">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-text-tertiary">Job ID</span>
                <button
                  onClick={copyJobId}
                  className="flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-accent"
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-1 truncate font-mono text-[13px] text-text-primary">{result.jobId}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs font-medium text-text-tertiary">Status</span>
                <Badge variant="accent" icon={<Rocket className="size-3" />}>
                  {result.status}
                </Badge>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => navigate(`/render?id=${result.jobId}`)}>
                View Progress
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setResult(null);
                  setCurrent(0);
                  setValues(buildInitialValues());
                }}
              >
                Create Another
              </Button>
              <Button variant="ghost" onClick={() => navigate("/")}>
                Back to Dashboard
              </Button>
            </div>
          </div>
        )}

        {current === 3 && !result && <LoadingState label="Creating your video job..." />}
      </Card>
    </div>
  );
};

export default Wizard;
