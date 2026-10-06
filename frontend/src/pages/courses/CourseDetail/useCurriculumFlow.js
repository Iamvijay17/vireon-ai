import { useState } from "react";
import { generateCourseCurriculum, createCourseVideosFromCurriculum, clearCourseCurriculumDraft } from "../../../services/api";
import { loadSettings } from "../../../shared/settingsStorage";
import { toast } from "../../../components/ui/toastBus";
import { confirmDialog } from "../../../components/ui/confirmBus";
import { EMPTY_FORM, EMPTY_PROMO } from "./constants";
import { useCurriculumDraft } from "./useCurriculumDraft";

/**
 * The "Generate Udemy Course Structure" modal: generate a lesson list,
 * review and edit it, then create every lesson as a video. The draft itself
 * (and its autosave) lives in useCurriculumDraft; this owns the modal and the
 * actions on top of it. Returns props ready to spread onto CurriculumModal.
 */
export function useCurriculumFlow({ id, course, pickDefaultVoice, fetchVideos, fetchCourse }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const curriculum = useCurriculumDraft(course, id);

  const showCurriculumModal = () => {
    // A previously generated (LLM-call-expensive) preview is still sitting
    // in state - reopen straight back into it instead of discarding it and
    // forcing a full regeneration. Only start a blank form when there's
    // nothing to resume.
    if (curriculum.lessons.length > 0) {
      setOpen(true);
      return;
    }
    const prefs = loadSettings();
    curriculum.setForm({
      ...EMPTY_FORM,
      title: course?.title || "",
      // The course's own description already says what it's about - reuse
      // it as the default topic instead of asking the user to retype it.
      topic: course?.description || "",
      voice: pickDefaultVoice(prefs.defaultVoice),
      style: prefs.defaultCourseStyle || EMPTY_FORM.style,
      duration: prefs.defaultCourseDuration || EMPTY_FORM.duration,
      fastAudio: prefs.fastAudioGeneration ?? EMPTY_FORM.fastAudio,
    });
    setError("");
    curriculum.setStep("form");
    setOpen(true);
  };

  // Just hides the modal - deliberately keeps curriculum step/lessons
  // intact so closing (X, backdrop, Escape, Cancel) doesn't throw away an
  // already-generated structure. Full reset only happens once videos are
  // actually created (see handleCreateCurriculumVideos).
  const closeCurriculumModal = () => {
    setOpen(false);
  };

  const handlePreviewCurriculum = async () => {
    if (!curriculum.form.title.trim()) return setError("Please enter a course title");
    if (!curriculum.form.topic.trim()) return setError("Please enter a topic");
    try {
      setPreviewLoading(true);
      const res = await generateCourseCurriculum(id, curriculum.form);
      curriculum.setLessons(
        (res.data.lessons || []).map((l) => ({ title: l.title || "", topic: l.topic || "", description: l.description || "" }))
      );
      curriculum.setSubtitle(res.data.subtitle || "");
      curriculum.setPromo(res.data.promo ? { ...EMPTY_PROMO, ...res.data.promo } : EMPTY_PROMO);
      curriculum.setStep("preview");
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to generate curriculum");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleRegenerateCurriculum = async () => {
    const ok = await confirmDialog({
      title: "Regenerate Structure",
      content: "This will replace the current lesson list, discarding any edits you've made. Are you sure?",
    });
    if (!ok) return;
    await handlePreviewCurriculum();
  };

  const updateLessonField = (index, field, value) => {
    curriculum.setLessons((prev) => prev.map((lesson, i) => (i === index ? { ...lesson, [field]: value } : lesson)));
  };

  const removeLessonRow = (index) => {
    curriculum.setLessons((prev) => prev.filter((_, i) => i !== index));
  };

  const addLessonRow = () => {
    curriculum.setLessons((prev) => [...prev, { title: "", topic: "", description: "" }]);
  };

  const updatePromoField = (field, value) => {
    curriculum.setPromo((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateCurriculumVideos = async () => {
    if (curriculum.lessons.length === 0) return toast.error("Add at least one lesson before creating videos");
    if (curriculum.lessons.some((l) => !l.title.trim())) return toast.error("Every lesson needs a title");
    try {
      setCreating(true);
      const res = await createCourseVideosFromCurriculum(id, {
        lessons: curriculum.lessons,
        promo: curriculum.promo.topic.trim() ? curriculum.promo : undefined,
        ...curriculum.form,
      });
      const createdCount = res.data.videos?.length || 0;
      const promoCreated = Boolean(res.data.promoVideo);
      toast.success(`Created ${createdCount} lesson${createdCount === 1 ? "" : "s"}${promoCreated ? " + 1 promo video" : ""}`);
      // Videos are created now, so the preview is consumed - fully reset
      // (unlike closeCurriculumModal, which preserves it for resuming).
      setOpen(false);
      curriculum.setStep("form");
      curriculum.setLessons([]);
      curriculum.setSubtitle("");
      curriculum.setPromo(EMPTY_PROMO);
      clearTimeout(curriculum.draftSaveTimeoutRef.current);
      clearCourseCurriculumDraft(id).catch(() => {});
      // The backend also emits courseVideoCreated (which triggers a
      // refetch), but refresh directly too in case the socket missed it.
      fetchVideos();
      fetchCourse();
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to create videos");
    } finally {
      setCreating(false);
    }
  };

  return {
    showCurriculumModal,
    modalProps: {
      open,
      onClose: closeCurriculumModal,
      step: curriculum.step,
      setStep: curriculum.setStep,
      form: curriculum.form,
      setForm: curriculum.setForm,
      error,
      previewLoading,
      onPreview: handlePreviewCurriculum,
      onRegenerate: handleRegenerateCurriculum,
      lessons: curriculum.lessons,
      onUpdateLesson: updateLessonField,
      onRemoveLesson: removeLessonRow,
      onAddLesson: addLessonRow,
      subtitle: curriculum.subtitle,
      onSubtitleChange: curriculum.setSubtitle,
      promo: curriculum.promo,
      onUpdatePromoField: updatePromoField,
      creating,
      onCreateVideos: handleCreateCurriculumVideos,
    },
  };
}
