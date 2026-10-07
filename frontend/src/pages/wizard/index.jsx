import { useState, useEffect } from "react";
import { Send, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createVideoJob, getVoices, getTtsVoices } from "../../services/api";
import { useFavoriteVoices } from "../../shared/useFavoriteVoices";
import { LoadingState } from "../../components";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { Textarea, Label, FieldHint } from "../../components/ui/Input";
import { toast } from "../../components/ui/toastBus";
import {
  VIDEO_TYPES, VERTICAL_RESOLUTIONS, FALLBACK_VOICES, LANGUAGES, DURATIONS, SHORTS_DURATIONS, DEFAULT_VALUES,
  isVerticalResolution, buildInitialValues,
} from "./constants";
import { Section } from "./Section";
import { AudioSection } from "./AudioSection";
import { OutputSection } from "./OutputSection";
import { JobCreated } from "./JobCreated";

/**
 * Create Video: topic and type, voice, and output settings on one page.
 * Owns the form values and validation; each card is its own component.
 */
const Wizard = () => {
  const navigate = useNavigate();
  const [values, setValues] = useState(buildInitialValues);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [voiceCatalog, setVoiceCatalog] = useState({ custom: [], clone: [] });
  const [voiceStyles, setVoiceStyles] = useState([]);
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

  // Narration styles come from the server; without them the Style picker simply isn't shown.
  useEffect(() => {
    let cancelled = false;
    getTtsVoices()
      .then((res) => { if (!cancelled) setVoiceStyles(res.data?.styles || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const voiceOptions = [
    ...voiceCatalog.custom.map((v) => ({ value: v.id, label: v.label, description: "Custom", previewUrl: v.previewUrl })),
    ...voiceCatalog.clone.map((v) => ({ value: v.id, label: v.label, description: "Clone", previewUrl: v.previewUrl })),
  ];
  if (voiceOptions.length === 0) voiceOptions.push(...FALLBACK_VOICES);

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

  const validateAll = () => {
    const next = {};
    if (!values.topic || values.topic.trim().length < 3) next.topic = "At least 3 characters";
    if (!values.type) next.type = "Please select a type";
    if (!values.duration) next.duration = "Please select a duration";
    if (values.type === "podcast") {
      if (!values.hostVoice) next.hostVoice = "Please select a host voice";
      if (!values.guestVoice) next.guestVoice = "Please select a guest voice";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateAll()) return;
    try {
      setLoading(true);
      // "Auto" is sent as nothing at all, so the server derives the style.
      const payload = { ...values };
      if (!payload.voiceStyle) delete payload.voiceStyle;
      const res = await createVideoJob(payload);
      setResult(res.data);
      toast.success("Video job created! Processing started.");
    } catch (err) {
      const errMsg =
        err.friendlyMessage || "Failed to create job";
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold tracking-tight text-text-primary">Create Video</h1>
        <Card className="min-h-105 p-8">
          <LoadingState label="Creating your video job..." />
        </Card>
      </div>
    );
  }

  if (result) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold tracking-tight text-text-primary">Create Video</h1>
        <JobCreated
          result={result}
          onViewProgress={() => navigate(`/render?id=${result.jobId}`)}
          onCreateAnother={() => {
            setResult(null);
            setValues(buildInitialValues());
          }}
          onHome={() => navigate("/")}
        />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-text-primary">Create Video</h1>
      <p className="mt-1 mb-8 text-sm text-text-secondary">Fill in the details below, then create your video.</p>

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Topic & Type ──────────────────────────────────────────────── */}
        <Section icon={Sparkles} title="What do you want to create?" className="lg:col-span-2">
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

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
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

            <div>
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
          </div>

          <div className="mt-5">
            <Label>Language</Label>
            <Select options={LANGUAGES} value={values.language} onChange={(v) => setField("language", v)} />
          </div>
        </Section>

        <AudioSection
          values={values}
          setValues={setValues}
          setField={setField}
          errors={errors}
          voiceOptions={voiceOptions}
          voiceStyles={voiceStyles}
          isFavorite={isFavorite}
          toggleFavorite={toggleFavorite}
        />

        <OutputSection values={values} setField={setField} />

        <div className="flex justify-end pb-2 lg:col-span-2">
          <Button variant="primary" size="lg" icon={<Send className="size-4" />} loading={loading} onClick={handleSubmit}>
            Create Video
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Wizard;
