import { Plus, Trash2, Sparkles, RotateCw, CheckCircle2, ExternalLink } from "lucide-react";
import { Modal } from "../../../components/ui/Modal";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Select } from "../../../components/ui/Select";
import { Switch } from "../../../components/ui/Switch";
import { VoiceSelect } from "../../../components/ui/VoiceSelect";
import { Input, Textarea, Label, FieldHint } from "../../../components/ui/Input";
import { DURATION_OPTIONS, STYLE_OPTIONS, RESOLUTION_OPTIONS } from "./constants";

export const CurriculumModal = ({
  open,
  onClose,
  step,
  setStep,
  form,
  setForm,
  error,
  previewLoading,
  onPreview,
  onRegenerate,
  lessons,
  onUpdateLesson,
  onRemoveLesson,
  onAddLesson,
  subtitle,
  onSubtitleChange,
  promo,
  onUpdatePromoField,
  creating,
  onCreateVideos,
  voiceOptions,
  isFavorite,
  toggleFavorite,
  courseId,
  navigate,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    title={step === "form" ? "Generate Udemy Course Structure" : "Review Lesson Structure"}
    description={
      step === "form"
        ? "AI generates a full lesson outline. Scripts, audio, and video are not generated yet - you choose when to generate them, individually or in bulk."
        : "Review and edit the generated lessons before creating them. Nothing is saved until you click Create Videos."
    }
    width="xl"
    footer={
      step === "form" ? (
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Sparkles className="size-4" />} loading={previewLoading} onClick={onPreview}>
            Preview Structure
          </Button>
        </>
      ) : (
        <>
          <Button variant="secondary" onClick={() => setStep("form")}>
            Back
          </Button>
          <Button variant="secondary" icon={<RotateCw className="size-4" />} loading={previewLoading} onClick={onRegenerate}>
            Regenerate
          </Button>
          <Button variant="primary" icon={<CheckCircle2 className="size-4" />} loading={creating} onClick={onCreateVideos}>
            Create {lessons.length} Video{lessons.length === 1 ? "" : "s"}
            {promo.topic.trim() ? " + Trailer" : ""}
          </Button>
        </>
      )
    }
  >
    {step === "form" ? (
      <div className="space-y-4">
        <div>
          <Label required>Course Title</Label>
          <Input
            placeholder="e.g., Complete React Developer Course"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            error={Boolean(error) && !form.title.trim()}
          />
        </div>
        <div>
          <Label required>Topic</Label>
          <Textarea
            rows={2}
            placeholder="e.g., React"
            value={form.topic}
            onChange={(e) => setForm((prev) => ({ ...prev, topic: e.target.value }))}
            error={Boolean(error) && !form.topic.trim()}
          />
          <FieldHint>
            Pre-filled from the course description. Edit it to steer the AI - it designs 12-20 lessons covering
            this topic, from introduction through a practical summary.
          </FieldHint>
        </div>
        {error && <p className="text-xs text-danger-500">{error}</p>}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label>Duration per lesson</Label>
            <Select options={DURATION_OPTIONS} value={form.duration} onChange={(v) => setForm((prev) => ({ ...prev, duration: v }))} />
          </div>
          <div>
            <Label>Voice</Label>
            <VoiceSelect
              options={voiceOptions}
              value={form.voice}
              onChange={(v) => setForm((prev) => ({ ...prev, voice: v }))}
              isFavorite={isFavorite}
              onToggleFavorite={toggleFavorite}
            />
          </div>
          <div>
            <Label>Style</Label>
            <Select options={STYLE_OPTIONS} value={form.style} onChange={(v) => setForm((prev) => ({ ...prev, style: v }))} />
          </div>
          <div>
            <Label>Resolution</Label>
            <Select options={RESOLUTION_OPTIONS} value={form.resolution} onChange={(v) => setForm((prev) => ({ ...prev, resolution: v }))} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border-light px-3 py-2.5">
          <div>
            <Label className="mb-0.5">Fast Audio (0.6B)</Label>
            <FieldHint>Smaller, faster TTS model for every lesson - quicker narration, lower quality</FieldHint>
          </div>
          <Switch checked={form.fastAudio} onChange={(v) => setForm((prev) => ({ ...prev, fastAudio: v }))} />
        </div>
      </div>
    ) : (
      <div className="space-y-3">
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs font-medium text-accent-600 hover:underline"
          onClick={() => {
            onClose();
            navigate(`/courses/${courseId}/curriculum`);
          }}
        >
          <ExternalLink className="size-3.5" /> View full structure on its own page
        </button>
        <div>
          <Label>Course Subtitle</Label>
          <Input
            placeholder="A short, catchy course tagline"
            value={subtitle}
            onChange={(e) => onSubtitleChange(e.target.value)}
          />
          <FieldHint>Course-level tagline, not tied to any single lesson.</FieldHint>
        </div>
        <div className="rounded-lg border border-border-light p-3">
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="accent">Promo</Badge>
            <span className="text-xs text-text-tertiary">
              Course-level trailer video, separate from the numbered lessons below.
            </span>
          </div>
          <div className="space-y-2">
            <Input
              placeholder="Trailer title"
              value={promo.title}
              onChange={(e) => onUpdatePromoField("title", e.target.value)}
            />
            <Textarea
              rows={2}
              placeholder="What the trailer should pitch (leave blank to skip the trailer video)"
              value={promo.topic}
              onChange={(e) => onUpdatePromoField("topic", e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2.5">
          {lessons.map((lesson, index) => (
            <div key={index} className="rounded-lg border border-border-light p-3">
              <div className="flex items-start gap-2">
                <Badge variant="neutral" className="mt-2 shrink-0">
                  {index + 1}
                </Badge>
                <div className="min-w-0 flex-1 space-y-2">
                  <Input
                    placeholder="Lesson title"
                    value={lesson.title}
                    onChange={(e) => onUpdateLesson(index, "title", e.target.value)}
                    error={lessons.length > 0 && !lesson.title.trim()}
                  />
                  <Textarea
                    rows={2}
                    placeholder="What this lesson's video should teach"
                    value={lesson.topic}
                    onChange={(e) => onUpdateLesson(index, "topic", e.target.value)}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={`Remove ${lesson.title || "lesson"}`}
                  onClick={() => onRemoveLesson(index)}
                  icon={<Trash2 className="size-4 text-danger-500" />}
                />
              </div>
            </div>
          ))}
          {lessons.length === 0 && (
            <p className="py-6 text-center text-sm text-text-tertiary">No lessons - add one below or regenerate.</p>
          )}
        </div>
        <Button variant="secondary" size="sm" icon={<Plus className="size-3.5" />} onClick={onAddLesson}>
          Add Lesson
        </Button>
      </div>
    )}
  </Modal>
);
