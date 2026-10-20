import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Rocket } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createVideoJob, getVoices, getTtsVoices } from "../../services/api";
import { useFavoriteVoices } from "../../shared/useFavoriteVoices";
import { PageHeader } from "../../components";
import { Button } from "../../components/ui/Button";
import { toast } from "../../components/ui/toastBus";
import {
  VERTICAL_RESOLUTIONS, FALLBACK_VOICES, SHORTS_DURATIONS, DEFAULT_VALUES, isVerticalResolution, buildInitialValues,
} from "./constants";
import { STEPS, validateStep, validateAll, stepOfField } from "./summary";
import { useCreationReadiness } from "./useCreationReadiness";
import { StepNav } from "./StepNav";
import { BriefStep } from "./BriefStep";
import { VoiceStep } from "./VoiceStep";
import { OutputStep } from "./OutputStep";
import { ReviewStep } from "./ReviewStep";
import { SummaryPanel } from "./SummaryPanel";
import { JobCreated } from "./JobCreated";
import { DraftPreview } from "./DraftPreview";

const LAST_STEP = STEPS.length - 1;

/**
 * Create Video: a four-step flow (brief -> voice & style -> output -> review).
 * Owns the form values, per-step validation and submission; each step is its
 * own component and a live summary stays beside them on wide screens.
 */
const Wizard = () => {
  const navigate = useNavigate();
  const [values, setValues] = useState(buildInitialValues);
  const [errors, setErrors] = useState({});
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [voiceCatalog, setVoiceCatalog] = useState({ custom: [], clone: [] });
  const [voiceStyles, setVoiceStyles] = useState([]);
  const { isFavorite, toggleFavorite } = useFavoriteVoices();
  const readiness = useCreationReadiness();

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

  // Closing or reloading the tab mid-form would silently throw the brief away.
  useEffect(() => {
    if (!dirty || result) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, result]);

  const voiceOptions = [
    ...voiceCatalog.custom.map((v) => ({ value: v.id, label: v.label, description: "Custom", previewUrl: v.previewUrl })),
    ...voiceCatalog.clone.map((v) => ({ value: v.id, label: v.label, description: "Clone", previewUrl: v.previewUrl })),
  ];
  if (voiceOptions.length === 0) voiceOptions.push(...FALLBACK_VOICES);

  const update = (updater) => {
    setDirty(true);
    setValues(updater);
  };
  const setField = (name, value) => {
    update((prev) => ({ ...prev, [name]: value }));
    // A field the user is fixing should not keep complaining while they type.
    setErrors((prev) => (name in prev ? { ...prev, [name]: undefined } : prev));
  };

  // Duration and resolution are each constrained to a different set of
  // valid options depending on video type (YouTube Shorts: 1-3 minutes,
  // vertical only; everything else: 5-30 minutes, any resolution) - keep
  // whichever of those two fields is still valid for the new type, and
  // snap the other to a sensible default instead of leaving it pointed at
  // an option that's no longer offered (and that the backend would reject).
  const handleTypeChange = (type) => {
    update((prev) => {
      const next = { ...prev, type };
      if (type === "youtube_shorts") {
        if (!SHORTS_DURATIONS.some((d) => d.value === prev.duration)) next.duration = SHORTS_DURATIONS[0].value;
        if (!isVerticalResolution(prev.resolution)) next.resolution = VERTICAL_RESOLUTIONS[0].value;
      } else if (SHORTS_DURATIONS.some((d) => d.value === prev.duration)) {
        next.duration = DEFAULT_VALUES.duration;
      }
      return next;
    });
    setErrors((prev) => ({ ...prev, type: undefined, duration: undefined }));
  };

  const goTo = (index) => {
    setStep(index);
    window.scrollTo({ top: 0 });
  };

  const handleNext = () => {
    const found = validateStep(STEPS[step].key, values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error("Fix the highlighted fields to continue");
      return;
    }
    const next = Math.min(step + 1, LAST_STEP);
    setReached((r) => Math.max(r, next));
    goTo(next);
  };

  const handleSubmit = async () => {
    const found = validateAll(values);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      goTo(stepOfField(Object.keys(found)[0]));
      toast.error("Some settings need attention before the video can be created");
      return;
    }
    try {
      setSubmitting(true);
      // "Auto" is sent as nothing at all, so the server derives the style.
      const payload = { ...values, topic: values.topic.trim() };
      if (!payload.voiceStyle) delete payload.voiceStyle;
      const res = await createVideoJob(payload);
      setResult(res.data);
      toast.success("Video job created - generation has been queued");
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to create the video job");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setResult(null);
    setValues(buildInitialValues());
    setErrors({});
    setStep(0);
    setReached(0);
    setDirty(false);
  };

  if (result) {
    return (
      <div>
        <PageHeader title="Create Video" />
        <JobCreated
          result={result}
          values={values}
          onViewProgress={() => navigate(`/render?id=${result.jobId}`)}
          onCreateAnother={resetForm}
          onProjects={() => navigate("/projects")}
        />
        <DraftPreview
          jobId={result.jobId}
          onOpenStudio={() => navigate(`/studio?id=${result.jobId}`)}
          onOpenRender={() => navigate(`/render?id=${result.jobId}`)}
        />
      </div>
    );
  }

  const stepProps = { values, setField, errors };
  const isReview = step === LAST_STEP;

  return (
    <div>
      <PageHeader
        title="Create Video"
        description="Describe the video, choose how it sounds and looks, then review and start. Nothing is generated until you start it."
      />

      <div className="mb-5">
        <StepNav steps={STEPS} current={step} reached={reached} onSelect={goTo} />
      </div>

      <div className={isReview ? "mx-auto max-w-4xl" : "grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]"}>
        <div className="min-w-0">
          {step === 0 && <BriefStep {...stepProps} onTypeChange={handleTypeChange} />}
          {step === 1 && (
            <VoiceStep
              {...stepProps}
              setValues={update}
              voiceOptions={voiceOptions}
              voiceStyles={voiceStyles}
              isFavorite={isFavorite}
              toggleFavorite={toggleFavorite}
            />
          )}
          {step === 2 && <OutputStep {...stepProps} />}
          {isReview && <ReviewStep values={values} voiceOptions={voiceOptions} readiness={readiness} onEdit={goTo} />}

          <div className="mt-5 flex items-center justify-between gap-3">
            <Button variant="secondary" icon={<ArrowLeft className="size-4" />} disabled={step === 0 || submitting} onClick={() => goTo(step - 1)}>
              Back
            </Button>
            {isReview ? (
              <Button variant="primary" size="lg" icon={<Rocket className="size-4" />} loading={submitting} onClick={handleSubmit}>
                Start generation
              </Button>
            ) : (
              <Button variant="primary" onClick={handleNext}>
                Continue
                <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>

        {!isReview && (
          <SummaryPanel values={values} voiceOptions={voiceOptions} readiness={readiness} currentStep={step} onEdit={(i) => i <= reached && goTo(i)} />
        )}
      </div>
    </div>
  );
};

export default Wizard;
