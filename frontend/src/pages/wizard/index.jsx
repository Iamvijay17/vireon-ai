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
import { LoadingState } from "../../components";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Steps } from "../../components/ui/Steps";
import { Select } from "../../components/ui/Select";
import { Textarea, Label, FieldHint } from "../../components/ui/Input";
import { Badge } from "../../components/ui/Badge";
import { toast } from "../../components/ui/toastBus";

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
];

const ASPECT_RATIOS = [
  { value: "16:9", label: "16:9 (Landscape)" },
  { value: "9:16", label: "9:16 (Portrait)" },
  { value: "4:3", label: "4:3 (Standard)" },
  { value: "1:1", label: "1:1 (Square)" },
  { value: "21:9", label: "21:9 (Ultrawide)" },
];

// Shown while the real voice catalog is loading (or if it fails to load).
const FALLBACK_VOICES = [
  { value: "female-1", label: "Female Voice 1" },
  { value: "male-1", label: "Male Voice 1" },
];

const LANGUAGES = [{ value: "english", label: "English" }];

const SCENE_COUNTS = [
  { value: "5-10", label: "5 to 10 scenes" },
  { value: "10-15", label: "10 to 15 scenes" },
  { value: "15-20", label: "15 to 20 scenes" },
  { value: "20-25", label: "20 to 25 scenes" },
  { value: "25-30", label: "25 to 30 scenes" },
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
  sceneCount: "5-10",
  language: "english",
  voice: "female-1",
  hostVoice: "",
  guestVoice: "",
  resolution: "1920x1080",
  aspectRatio: "16:9",
};

// Visual aspect-ratio picker (replaces a plain text dropdown with a preview
// of each ratio's actual shape).
const AspectRatioPicker = ({ value, onChange }) => {
  const boxHeight = 40;
  return (
    <div className="flex flex-wrap gap-3">
      {ASPECT_RATIOS.map((ratio) => {
        const isActive = value === ratio.value;
        const [w, h] = ratio.value.split(":").map(Number);
        const boxWidth = Math.max(24, Math.min(64, (w / h) * boxHeight));

        return (
          <button
            key={ratio.value}
            type="button"
            onClick={() => onChange?.(ratio.value)}
            className={`flex min-w-22 flex-col items-center gap-2 rounded-[10px] border px-2.5 py-3 transition-colors ${
              isActive ? "border-accent bg-accent-subtle" : "border-border bg-surface hover:bg-surface-hover"
            }`}
          >
            <div
              className={`rounded border-2 ${isActive ? "border-accent" : "border-text-tertiary"}`}
              style={{ width: boxWidth, height: boxHeight }}
            />
            <span className={`text-xs ${isActive ? "font-semibold text-accent" : "text-text-secondary"}`}>{ratio.value}</span>
          </button>
        );
      })}
    </div>
  );
};

const Wizard = () => {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [values, setValues] = useState(DEFAULT_VALUES);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [voiceCatalog, setVoiceCatalog] = useState({ custom: [], clone: [] });

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
    ...voiceCatalog.custom.map((v) => ({ value: v.id, label: v.label, description: "Custom" })),
    ...voiceCatalog.clone.map((v) => ({ value: v.id, label: v.label, description: "Clone" })),
  ];
  if (voiceOptions.length === 0) voiceOptions.push(...FALLBACK_VOICES);

  const setField = (name, value) => setValues((prev) => ({ ...prev, [name]: value }));

  const validateStep = (step) => {
    const next = {};
    if (step === 0) {
      if (!values.topic || values.topic.trim().length < 3) next.topic = "At least 3 characters";
      if (!values.type) next.type = "Please select a type";
      if (!values.sceneCount) next.sceneCount = "Please select scene count";
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
        err?.response?.data?.error || err?.response?.data?.details?.[0]?.message || "Failed to create job";
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
                    onChange={(v) => setField("type", v)}
                    error={Boolean(errors.type)}
                  />
                  <FieldHint error={Boolean(errors.type)}>{errors.type}</FieldHint>
                </div>

                <div className="mb-5">
                  <Label required>Number of Scenes</Label>
                  <Select
                    placeholder="Select scene count"
                    options={SCENE_COUNTS}
                    value={values.sceneCount}
                    onChange={(v) => setField("sceneCount", v)}
                    error={Boolean(errors.sceneCount)}
                  />
                  <FieldHint error={Boolean(errors.sceneCount)}>{errors.sceneCount}</FieldHint>
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
                    <div className="mb-5">
                      <Label required>Host Voice</Label>
                      <Select
                        placeholder="Select host voice"
                        options={voiceOptions}
                        value={values.hostVoice}
                        onChange={(v) => setField("hostVoice", v)}
                        error={Boolean(errors.hostVoice)}
                      />
                      <FieldHint error={Boolean(errors.hostVoice)}>{errors.hostVoice}</FieldHint>
                    </div>

                    <div className="mb-5">
                      <Label required>Guest Voice</Label>
                      <Select
                        placeholder="Select guest voice"
                        options={voiceOptions}
                        value={values.guestVoice}
                        onChange={(v) => setField("guestVoice", v)}
                        error={Boolean(errors.guestVoice)}
                      />
                      <FieldHint error={Boolean(errors.guestVoice)}>
                        The host and guest take turns in the conversation, each with their own voice.
                      </FieldHint>
                    </div>
                  </>
                ) : (
                  <div className="mb-5">
                    <Label>Voice</Label>
                    <Select options={voiceOptions} value={values.voice} onChange={(v) => setField("voice", v)} />
                    <FieldHint>Custom voices are built-in presets; Clone voices are generated from your reference .wav files in backend/voices/.</FieldHint>
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

                <div className="mb-5">
                  <Label>Resolution</Label>
                  <Select options={RESOLUTIONS} value={values.resolution} onChange={(v) => setField("resolution", v)} />
                </div>

                <div className="mb-2">
                  <Label>Aspect Ratio</Label>
                  <AspectRatioPicker value={values.aspectRatio} onChange={(v) => setField("aspectRatio", v)} />
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
                  setValues(DEFAULT_VALUES);
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
