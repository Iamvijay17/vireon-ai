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
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../../components";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Badge } from "../../components/ui/Badge";
import { Table } from "../../components/ui/Table";
import { Tooltip } from "../../components/ui/Tooltip";
import { Modal } from "../../components/ui/Modal";
import { Label, Textarea } from "../../components/ui/Input";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";
import { getCourses, createCourse, updateCourse, deleteCourse } from "../../services/api";

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
        toast.error(err.response?.data?.error || "Failed to load courses");
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
      toast.error(err.response?.data?.error || "Failed to delete course");
    }
  };

  const columns = [
    {
      key: "title",
      title: "Title",
      render: (r) => (
        <button onClick={() => navigate(`/courses/${r._id}`)} className="text-left text-[13px] font-semibold text-text-primary hover:text-accent">
          {r.title}
        </button>
      ),
    },
    {
      key: "status",
      title: "Status",
      render: (r) => {
        const Icon = STATUS_ICON[r.status] || BookOpen;
        return (
          <Badge variant={STATUS_VARIANT[r.status] || "neutral"} icon={<Icon className="size-3" />}>
            {r.status}
          </Badge>
        );
      },
    },
    { key: "category", title: "Category", render: (r) => r.category },
    { key: "difficulty", title: "Difficulty", render: (r) => r.difficulty },
    {
      key: "videos",
      title: "Videos",
      render: (r) => `${r.completedVideoCount || 0} / ${r.videoCount || 0}`,
    },
    {
      key: "updatedAt",
      title: "Updated",
      render: (r) => new Date(r.updatedAt).toLocaleDateString(),
    },
    {
      key: "actions",
      title: "",
      align: "right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Tooltip content="Edit">
            <Button variant="ghost" size="sm" iconOnly aria-label={`Edit ${r.title}`} onClick={() => showEditModal(r)} icon={<Pencil className="size-4" />} />
          </Tooltip>
          <Tooltip content="Delete">
            <Button variant="ghost" size="sm" iconOnly aria-label={`Delete ${r.title}`} onClick={() => handleDelete(r)} icon={<Trash2 className="size-4 text-danger-500" />} />
          </Tooltip>
        </div>
      ),
    },
  ];

  const stats = [
    { title: "Total Courses", value: pagination.total, icon: BookOpen, tone: "accent" },
    { title: "In Progress", value: courses.filter((c) => c.status === "In Progress").length, icon: PlayCircle, tone: "info" },
    { title: "Completed", value: courses.filter((c) => c.status === "Completed").length, icon: CheckCircle2, tone: "success" },
    { title: "Draft", value: courses.filter((c) => c.status === "Draft").length, icon: BookOpen, tone: "neutral" },
  ];

  const toneCls = {
    accent: "bg-accent-subtle text-accent",
    info: "bg-info-500/10 text-info-600 dark:text-info-500",
    success: "bg-success-500/10 text-success-600 dark:text-success-500",
    neutral: "bg-surface-hover text-text-secondary",
  };

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

      {/* Filters */}
      <Card className="mb-4 p-4">
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

      {/* Stats */}
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.title} className="p-5">
            <div className={`mb-3 flex size-10 items-center justify-center rounded-[10px] ${toneCls[s.tone]}`}>
              <s.icon className="size-[18px]" />
            </div>
            <p className="text-xs font-medium text-text-tertiary">{s.title}</p>
            <p className="mt-1 text-2xl font-semibold text-text-primary">{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card>
        <div className="p-2">
          {!loading && courses.length === 0 ? (
            <EmptyState description="No courses yet" actionLabel="Create Your First Course" onAction={showCreateModal} />
          ) : (
            <>
              <Table columns={columns} data={courses} rowKey="_id" loading={loading} />
              {totalPages > 1 && (
                <div className="flex items-center justify-end gap-2 border-t border-border-light px-3 py-3">
                  <span className="mr-2 text-xs text-text-tertiary">
                    Page {pagination.page} of {totalPages}
                  </span>
                  <Button variant="secondary" size="sm" iconOnly disabled={pagination.page <= 1} onClick={() => fetchCourses(pagination.page - 1)} icon={<ChevronLeft className="size-4" />} />
                  <Button variant="secondary" size="sm" iconOnly disabled={pagination.page >= totalPages} onClick={() => fetchCourses(pagination.page + 1)} icon={<ChevronRight className="size-4" />} />
                </div>
              )}
            </>
          )}
        </div>
      </Card>

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
