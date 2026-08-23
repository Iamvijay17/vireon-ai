import { useState, useEffect, useRef } from "react";
import { getCourseCurriculumHistory, saveCourseCurriculumDraft } from "../../../services/api";
import { EMPTY_FORM, EMPTY_PROMO } from "./constants";

/**
 * Owns the generated-curriculum draft's state and its two persistence
 * effects: restoring a server-saved draft (or falling back to the most
 * recent durable snapshot) once per course, and debounced-autosaving
 * every edit back to the course document so navigating away and back
 * doesn't lose an in-progress review.
 */
export function useCurriculumDraft(course, id) {
  const [step, setStep] = useState("form"); // "form" | "preview"
  const [form, setForm] = useState(EMPTY_FORM);
  const [lessons, setLessons] = useState([]);
  // Course-level tagline and promo/trailer pitch generated alongside the
  // lessons - separate from the lessons array (see backend CourseCurriculum.subtitle/promo).
  const [subtitle, setSubtitle] = useState("");
  const [promo, setPromo] = useState(EMPTY_PROMO);

  // Tracks which course id the curriculum draft has been hydrated from the
  // server for, so the autosave effect below doesn't fire (and stomp the
  // server copy with blank pre-hydration state) before hydration runs.
  const hydratedDraftIdRef = useRef(null);
  const draftSaveTimeoutRef = useRef(null);

  // Restore a server-saved curriculum draft (if any) once per course, so
  // navigating away mid-review and coming back doesn't lose the generated
  // lessons. Marks hydration done (hydratedDraftIdRef) *before* the autosave
  // effect below is allowed to run, so that effect can't fire on stale
  // pre-hydration state and overwrite the draft it's about to restore.
  //
  // The draft is only a best-effort, debounced autosave (see the effect
  // below) - it can be empty even though a curriculum was successfully
  // generated, because CourseCurriculumService.save() persists a durable
  // snapshot synchronously on every generate-curriculum call, independent
  // of the draft. So if there's no draft, fall back to the most recent
  // saved snapshot from that durable history instead of silently showing
  // nothing for a course that does have a generated structure.
  useEffect(() => {
    if (!course?._id) return;
    if (hydratedDraftIdRef.current === course._id) return;
    hydratedDraftIdRef.current = course._id;
    const draft = course.curriculumDraft;
    if (draft?.lessons?.length > 0) {
      setForm(draft.form || EMPTY_FORM);
      setLessons(draft.lessons);
      setSubtitle(draft.subtitle || "");
      setPromo(draft.promo || EMPTY_PROMO);
      // Always land on the preview of the existing structure, never the
      // blank "form" step, even if an older draft (saved before subtitle/
      // promo existed, or mid-edit with "Back" pressed) persisted step:
      // "form" alongside its lessons - a generated structure exists, so
      // reopening should show it, not ask the user to fill out the form
      // again from scratch.
      setStep("preview");

      // Older drafts predate the subtitle/promo fields and were saved with
      // them blank. The durable per-course snapshot (CourseCurriculumService,
      // saved on every generate-curriculum call) always has them when the
      // structure was AI-generated, so backfill from there rather than
      // showing an empty subtitle/promo for a structure that really has one.
      if (!draft.subtitle && !draft.promo?.topic) {
        getCourseCurriculumHistory(course._id, { page: 1, limit: 1 })
          .then((res) => {
            const latest = res.data?.curricula?.[0];
            if (!latest) return;
            if (latest.subtitle) setSubtitle(latest.subtitle);
            if (latest.promo?.topic) setPromo(latest.promo);
          })
          .catch(() => {
            // Best-effort backfill - a failure here shouldn't block the page.
          });
      }
      return;
    }

    getCourseCurriculumHistory(course._id, { page: 1, limit: 1 })
      .then((res) => {
        const latest = res.data?.curricula?.[0];
        if (!latest?.lessons?.length) return;
        setForm((prev) => ({ ...prev, title: latest.title || prev.title, topic: latest.topic || prev.topic }));
        setLessons(latest.lessons);
        setSubtitle(latest.subtitle || "");
        setPromo(latest.promo || EMPTY_PROMO);
        setStep("preview");
      })
      .catch(() => {
        // Best-effort restore - a failure here shouldn't block the page.
      });
  }, [course]);

  // Autosave the curriculum draft to the course document (debounced) so it
  // survives navigating away and coming back. Gated on hydratedDraftIdRef so
  // it never fires before the effect above has had a chance to restore any
  // existing draft first.
  useEffect(() => {
    if (!id || hydratedDraftIdRef.current !== id) return;
    clearTimeout(draftSaveTimeoutRef.current);
    if (lessons.length === 0) return undefined;
    draftSaveTimeoutRef.current = setTimeout(() => {
      saveCourseCurriculumDraft(id, { form, lessons, subtitle, promo, step }).catch(() => {
        // Best-effort autosave - a failure here shouldn't interrupt the user.
      });
    }, 600);
    return () => clearTimeout(draftSaveTimeoutRef.current);
  }, [id, form, lessons, subtitle, promo, step]);

  return {
    step,
    setStep,
    form,
    setForm,
    lessons,
    setLessons,
    subtitle,
    setSubtitle,
    promo,
    setPromo,
    draftSaveTimeoutRef,
  };
}
