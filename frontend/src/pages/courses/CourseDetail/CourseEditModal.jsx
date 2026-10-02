import { Modal } from "../../../components/ui/Modal";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Select";
import { Input, Textarea, Label } from "../../../components/ui/Input";
import { CATEGORY_OPTIONS, DIFFICULTY_OPTIONS, LANGUAGE_OPTIONS } from "./constants";

export const CourseEditModal = ({ open, onClose, form, setForm, error, submitting, onSubmit }) => (
  <Modal
    open={open}
    onClose={onClose}
    title="Edit Course"
    width="lg"
    footer={
      <>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" loading={submitting} onClick={onSubmit}>
          Save Changes
        </Button>
      </>
    }
  >
    <div className="space-y-4">
      <div>
        <Label required>Course Name</Label>
        <Input
          placeholder="e.g., React Basics"
          value={form.title}
          onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
          error={Boolean(error)}
        />
        {error && <p className="mt-1.5 text-xs text-danger-500">{error}</p>}
      </div>
      <div>
        <Label>Description</Label>
        <Textarea
          rows={3}
          placeholder="Brief description of the course"
          value={form.description}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Category</Label>
          <Select options={CATEGORY_OPTIONS} value={form.category} onChange={(v) => setForm((prev) => ({ ...prev, category: v }))} />
        </div>
        <div>
          <Label>Difficulty</Label>
          <Select options={DIFFICULTY_OPTIONS} value={form.difficulty} onChange={(v) => setForm((prev) => ({ ...prev, difficulty: v }))} />
        </div>
      </div>
      <div>
        <Label>Language</Label>
        <Select options={LANGUAGE_OPTIONS} value={form.language} onChange={(v) => setForm((prev) => ({ ...prev, language: v }))} />
      </div>
    </div>
  </Modal>
);
