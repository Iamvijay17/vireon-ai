import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  BookOpen,
  Clock,
  CheckCircle2,
  PlayCircle,
  ChevronLeft,
  ChevronRight,
  Layers,
  Globe2,
  GraduationCap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../../components";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Badge } from "../../components/ui/Badge";
import { Progress } from "../../components/ui/Progress";
import { Modal } from "../../components/ui/Modal";
import { Label, Textarea } from "../../components/ui/Input";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";
import { getCourses, createCourse, updateCourse, deleteCourse } from "../../services/api";
import { timeAgo } from "../../lib/timeAgo";

const STATUS_VARIANT = {
  Draft: "neutral",
  "In Progress": "accent",
  Completed: "success",
  Archived: "warning",
};

const STATUS_ICON = {
  Draft: BookOpen,
  "In Progress": PlayCircle,
  Completed: CheckCircle2,
  Archived: Clock,
};

const CATEGORY_OPTIONS = [
  { value: "Web Development", label: "Web Development" },
  { value: "Mobile Development", label: "Mobile Development" },
  { value: "Data Science", label: "Data Science" },
  { value: "Machine Learning", label: "Machine Learning" },
  { value: "DevOps", label: "DevOps" },
  { value: "Design", label: "Design" },
  { value: "Business", label: "Business" },
  { value: "Marketing", label: "Marketing" },
  { value: "Other", label: "Other" },
];

const DIFFICULTY_OPTIONS = [
  { value: "Beginner", label: "Beginner" },
  { value: "Intermediate", label: "Intermediate" },
  { value: "Advanced", label: "Advanced" },
];

const LANGUAGE_OPTIONS = [
  { value: "english", label: "English" },
  { value: "hindi", label: "Hindi" },
  { value: "spanish", label: "Spanish" },
  { value: "french", label: "French" },
  { value: "german", label: "German" },
  { value: "japanese", label: "Japanese" },
  { value: "korean", label: "Korean" },
];

const STATUS_OPTIONS = [
  { value: "Draft", label: "Draft" },
  { value: "In Progress", label: "In Progress" },
  { value: "Completed", label: "Completed" },
  { value: "Archived", label: "Archived" },
];

const EMPTY_FORM = { title: "", description: "", category: "Other", difficulty: "Beginner", language: "english" };

// Deterministic category -> gradient tone, so the same category always reads
// the same color across cards without needing a fixed lookup table.
const CATEGORY_TONES = [
  "bg-gradient-to-br from-accent-500/20 to-accent-500/5 text-accent",
  "bg-gradient-to-br from-info-500/20 to-info-500/5 text-info-600 dark:text-info-500",
  "bg-gradient-to-br from-success-500/20 to-success-500/5 text-success-600 dark:text-success-500",
  "bg-gradient-to-br from-warning-500/20 to-warning-500/5 text-warning-600 dark:text-warning-500",
  "bg-gradient-to-br from-danger-500/20 to-danger-500/5 text-danger-600 dark:text-danger-500",
];
const toneForCategory = (category = "") => {
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  return CATEGORY_TONES[hash % CATEGORY_TONES.length];
};

const toneCls = {
  accent: "bg-gradient-to-br from-accent-500/20 to-accent-500/5 text-accent",
  info: "bg-gradient-to-br from-info-500/20 to-info-500/5 text-info-600 dark:text-info-500",
  success: "bg-gradient-to-br from-success-500/20 to-success-500/5 text-success-600 dark:text-success-500",
  neutral: "bg-surface-hover text-text-secondary",
};

const CourseCard = ({ course, onOpen, onEdit, onDelete }) => {
  const StatusIcon = STATUS_ICON[course.status] || BookOpen;
  const total = course.videoCount || 0;
  const completed = course.completedVideoCount || 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(course)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(course)}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between p-5 pb-3">
        <div className={`flex size-11 items-center justify-center rounded-[10px] ${toneForCategory(course.category)}`}>
          <GraduationCap className="size-5" />
        </div>
        <Badge variant={STATUS_VARIANT[course.status] || "neutral"} icon={<StatusIcon className="size-3" />}>
          {course.status}
        </Badge>
      </div>

      <div className="flex-1 px-5 pb-4">
        <h3 className="line-clamp-1 text-[15px] font-semibold text-text-primary transition-colors group-hover:text-accent">
          {course.title}
        </h3>
        <p className="mt-1 line-clamp-2 min-h-[2.25rem] text-xs leading-relaxed text-text-tertiary">
          {course.description || "No description yet."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-text-tertiary">
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-hover px-2 py-0.5">
            <Layers className="size-3" /> {course.category}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-hover px-2 py-0.5">
            {course.difficulty}
          </span>
          {course.language && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-hover px-2 py-0.5 capitalize">
              <Globe2 className="size-3" /> {course.language}
            </span>
          )}
        </div>
      </div>

      <div className="px-5 pb-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-text-tertiary">Videos</span>
          <span className="font-medium text-text-secondary">
            {completed}/{total}
          </span>
        </div>
        <Progress percent={pct} showLabel={false} size="sm" status={pct === 100 && total > 0 ? "success" : "active"} />
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-border-light px-5 py-3">
        <span className="text-[11px] text-text-tertiary">Updated {timeAgo(course.updatedAt)}</span>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={`Edit ${course.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(course);
            }}
            icon={<Pencil className="size-3.5" />}
          />
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={`Delete ${course.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(course);
            }}
            icon={<Trash2 className="size-3.5 text-danger-500" />}
          />
        </div>
      </div>
    </div>
  );
};

const CoursesList = () => {
  const navigate = useNavigate();

  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [filters, setFilters] = useState({ search: "", status: undefined, category: undefined });
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [formValues, setFormValues] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchCourses = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const res = await getCourses(page, pagination.limit, filters);
        setCourses(res.data.courses);
        setPagination(res.data.pagination);
      } catch (err) {
        toast.error(err.friendlyMessage || "Failed to load courses");
      } finally {
        setLoading(false);
      }
    },
    [filters, pagination.limit]
  );

  useEffect(() => {
    fetchCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const showCreateModal = () => {
    setEditingCourse(null);
    setFormValues(EMPTY_FORM);
    setFormError("");
    setModalVisible(true);
  };

  const showEditModal = (course) => {
    setEditingCourse(course);
    setFormValues({ ...EMPTY_FORM, ...course });
    setFormError("");
    setModalVisible(true);
  };

  const handleModalOk = async () => {
    if (!formValues.title || !formValues.title.trim()) {
      setFormError("Please enter a course name");
      return;
    }
    try {
      setSubmitting(true);
      if (editingCourse) {
        await updateCourse(editingCourse._id, formValues);
        toast.success("Course updated successfully");
      } else {
        await createCourse(formValues);
        toast.success("Course created successfully");
      }
      setModalVisible(false);
      fetchCourses(pagination.page);
    } catch (err) {
      toast.error(err.response?.data?.message || "Operation failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (course) => {
    const ok = await confirmDialog({
      title: "Delete Course",
      content: `Are you sure you want to delete "${course.title}"? All videos in this course will also be deleted.`,
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteCourse(course._id);
      toast.success("Course deleted");
      fetchCourses(pagination.page);
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to delete course");
    }
  };

  const stats = [
    { title: "Total Courses", value: pagination.total, icon: BookOpen, tone: "accent" },
    { title: "In Progress", value: courses.filter((c) => c.status === "In Progress").length, icon: PlayCircle, tone: "info" },
    { title: "Completed", value: courses.filter((c) => c.status === "Completed").length, icon: CheckCircle2, tone: "success" },
    { title: "Draft", value: courses.filter((c) => c.status === "Draft").length, icon: BookOpen, tone: "neutral" },
  ];

  const totalPages = pagination.pages || Math.ceil(pagination.total / pagination.limit) || 1;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">Courses</h1>
          <p className="mt-1 text-sm text-text-secondary">Create and manage your AI-powered video courses</p>
        </div>
        <Button variant="primary" size="lg" icon={<Plus className="size-4" />} onClick={showCreateModal}>
          Create Course
        </Button>
      </div>

      {/* Stats */}
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s, i) => (
          <Card key={s.title} hoverable className="animate-slide-up overflow-hidden p-5" style={{ "--stagger-index": i }}>
            <div className={`mb-3 flex size-10 items-center justify-center rounded-[10px] ${toneCls[s.tone]}`}>
              <s.icon className="size-[18px]" />
            </div>
            <p className="text-xs font-medium text-text-tertiary">{s.title}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="mb-6 p-4">
        <div className="flex flex-wrap gap-3">
          <Input
            placeholder="Search courses..."
            icon={<Search className="size-4" />}
            className="w-64"
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          />
          <Select
            placeholder="Filter by status"
            className="w-44"
            options={STATUS_OPTIONS}
            value={filters.status}
            onChange={(v) => setFilters((prev) => ({ ...prev, status: v }))}
          />
          <Select
            placeholder="Filter by category"
            className="w-52"
            options={CATEGORY_OPTIONS}
            value={filters.category}
            onChange={(v) => setFilters((prev) => ({ ...prev, category: v }))}
          />
        </div>
      </Card>

      {/* Grid */}
      {!loading && courses.length === 0 ? (
        <Card>
          <EmptyState description="No courses yet" actionLabel="Create Your First Course" onAction={showCreateModal} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {loading && courses.length === 0
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-64 animate-pulse rounded-2xl border border-border bg-surface-hover" />
                ))
              : courses.map((course, i) => (
                  <div key={course._id} className="animate-slide-up" style={{ "--stagger-index": Math.min(i, 8) }}>
                    <CourseCard
                      course={course}
                      onOpen={(c) => navigate(`/courses/${c._id}`)}
                      onEdit={showEditModal}
                      onDelete={handleDelete}
                    />
                  </div>
                ))}
          </div>
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-end gap-2">
              <span className="mr-2 text-xs text-text-tertiary">
                Page {pagination.page} of {totalPages}
              </span>
              <Button variant="secondary" size="sm" iconOnly disabled={pagination.page <= 1} onClick={() => fetchCourses(pagination.page - 1)} icon={<ChevronLeft className="size-4" />} />
              <Button variant="secondary" size="sm" iconOnly disabled={pagination.page >= totalPages} onClick={() => fetchCourses(pagination.page + 1)} icon={<ChevronRight className="size-4" />} />
            </div>
          )}
        </>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={modalVisible}
        onClose={() => setModalVisible(false)}
        title={editingCourse ? "Edit Course" : "Create Course"}
        width="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalVisible(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={submitting} onClick={handleModalOk}>
              {editingCourse ? "Save Changes" : "Create Course"}
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
              onChange={(e) => setFormValues((prev) => ({ ...prev, title: e.target.value }))}
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
              onChange={(e) => setFormValues((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Category</Label>
              <Select options={CATEGORY_OPTIONS} value={formValues.category} onChange={(v) => setFormValues((prev) => ({ ...prev, category: v }))} />
            </div>
            <div>
              <Label>Difficulty</Label>
              <Select options={DIFFICULTY_OPTIONS} value={formValues.difficulty} onChange={(v) => setFormValues((prev) => ({ ...prev, difficulty: v }))} />
            </div>
          </div>
          <div>
            <Label>Language</Label>
            <Select options={LANGUAGE_OPTIONS} value={formValues.language} onChange={(v) => setFormValues((prev) => ({ ...prev, language: v }))} />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CoursesList;
