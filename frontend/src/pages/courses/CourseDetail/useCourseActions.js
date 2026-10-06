import { useState } from "react";
import { updateCourse, deleteCourse } from "../../../services/api";
import { toast } from "../../../components/ui/toastBus";
import { confirmDialog } from "../../../components/ui/confirmBus";
import { COURSE_EDIT_EMPTY_FORM } from "./constants";

/** The Edit Course modal and Delete Course. */
export function useCourseActions({ id, course, navigate, fetchCourse }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(COURSE_EDIT_EMPTY_FORM);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const showCourseEditModal = () => {
    setForm({ ...COURSE_EDIT_EMPTY_FORM, ...course });
    setError("");
    setOpen(true);
  };

  const handleSaveCourseEdit = async () => {
    if (!form.title.trim()) return setError("Please enter a course name");
    try {
      setSubmitting(true);
      await updateCourse(id, form);
      toast.success("Course updated successfully");
      setOpen(false);
      fetchCourse();
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to update course");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCourse = async () => {
    const ok = await confirmDialog({
      title: "Delete Course",
      content: `Are you sure you want to delete "${course?.title}"? All videos will be deleted.`,
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteCourse(id);
      toast.success("Course deleted");
      navigate("/courses");
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to delete course");
    }
  };

  return {
    showCourseEditModal,
    handleDeleteCourse,
    editModalProps: { open, onClose: () => setOpen(false), form, setForm, error, submitting, onSubmit: handleSaveCourseEdit },
  };
}
