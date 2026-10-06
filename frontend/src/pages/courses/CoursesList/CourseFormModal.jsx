import { useState } from "react";
import { Button } from "../../../components/ui/Button";
import { Input, Label, Textarea } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { Modal } from "../../../components/ui/Modal";
import { toast } from "../../../components/ui/toastBus";
import { createCourse, updateCourse } from "../../../services/api";
import { CATEGORY_OPTIONS, DIFFICULTY_OPTIONS, LANGUAGE_OPTIONS, EMPTY_FORM } from "./constants";

/**
 * Create / edit a course. `course` null means create. The parent remounts
 * this (via `key`) each time it opens, so the form always starts from the
 * course being edited rather than whatever was typed last time.
 */
export const CourseFormModal = ({ open, course, onClose, onSaved }) => {
  const [formValues, setFormValues] = useState(() => (course ? { ...EMPTY_FORM, ...course } : EMPTY_FORM));
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const setField = (field) => (value) => setFormValues((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    if (!formValues.title || !formValues.title.trim()) {
      setFormError("Please enter a course name");
      return;
    }
    try {
      setSubmitting(true);
      if (course) {
        await updateCourse(course._id, formValues);
        toast.success("Course updated successfully");
      } else {
        await createCourse(formValues);
        toast.success("Course created successfully");
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || "Operation failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={course ? "Edit Course" : "Create Course"}
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={submitting} onClick={handleSubmit}>
            {course ? "Save Changes" : "Create Course"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label required>Course Name</Label>
          <Input
            placeholder="e.g., React Basics"
            value={formValues.title}
            onChange={(e) => setField("title")(e.target.value)}
            error={Boolean(formError)}
          />
          {formError && <p className="mt-1.5 text-xs text-danger-500">{formError}</p>}
        </div>
        <div>
          <Label>Description</Label>
          <Textarea
            rows={3}
            placeholder="Brief description of the course"
            value={formValues.description}
            onChange={(e) => setField("description")(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Category</Label>
            <Select options={CATEGORY_OPTIONS} value={formValues.category} onChange={setField("category")} />
          </div>
          <div>
            <Label>Difficulty</Label>
            <Select options={DIFFICULTY_OPTIONS} value={formValues.difficulty} onChange={setField("difficulty")} />
          </div>
        </div>
        <div>
          <Label>Language</Label>
          <Select options={LANGUAGE_OPTIONS} value={formValues.language} onChange={setField("language")} />
        </div>
      </div>
    </Modal>
  );
};
