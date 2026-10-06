import { useState } from "react";
import { Plus, Search, BookOpen, CheckCircle2, PlayCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../../../components";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { toast } from "../../../components/ui/toastBus";
import { useApiQuery, useInvalidate } from "../../../lib/useApiQuery";
import { queryKeys } from "../../../lib/queryClient";
import { confirmDialog } from "../../../components/ui/confirmBus";
import { getCourses, deleteCourse } from "../../../services/api";
import { CATEGORY_OPTIONS, STATUS_OPTIONS, STAT_TONES } from "./constants";
import { CourseCard } from "./CourseCard";
import { CourseFormModal } from "./CourseFormModal";

// Stable empty reference so consumers of `courses` do not see a new array
// identity on every render before the first load resolves.
const EMPTY_COURSES = [];
const PAGE_LIMIT = 20;

const CoursesList = () => {
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [filters, setFiltersState] = useState({ search: "", status: undefined, category: undefined });
  // `key` changes on every open so the form remounts fresh for each course.
  const [modal, setModal] = useState({ open: false, course: null, key: 0 });

  const { data, loading } = useApiQuery(
    queryKeys.courses.list(page, filters),
    () => getCourses(page, PAGE_LIMIT, filters),
    { errorMessage: "Failed to load courses" }
  );

  const invalidate = useInvalidate();

  const courses = data?.courses ?? EMPTY_COURSES;
  const pagination = data?.pagination ?? { page, limit: PAGE_LIMIT, total: 0, pages: 0 };

  // Narrowing the filters should return to page 1 - otherwise a filter
  // applied while on page 3 lands on an empty table.
  const setFilters = (next) => {
    setFiltersState(next);
    setPage(1);
  };

  const openModal = (course = null) => setModal((prev) => ({ open: true, course, key: prev.key + 1 }));
  const closeModal = () => setModal((prev) => ({ ...prev, open: false }));

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
      invalidate(queryKeys.courses.all);
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
        <Button variant="primary" size="lg" icon={<Plus className="size-4" />} onClick={() => openModal()}>
          Create Course
        </Button>
      </div>

      {/* Stats */}
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s, i) => (
          <Card key={s.title} hoverable className="animate-slide-up overflow-hidden p-5" style={{ "--stagger-index": i }}>
            <div className={`mb-3 flex size-10 items-center justify-center rounded-[10px] ${STAT_TONES[s.tone]}`}>
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
          <EmptyState description="No courses yet" actionLabel="Create Your First Course" onAction={() => openModal()} />
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
                      onEdit={openModal}
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
              <Button variant="secondary" size="sm" iconOnly disabled={pagination.page <= 1} onClick={() => setPage(pagination.page - 1)} icon={<ChevronLeft className="size-4" />} />
              <Button variant="secondary" size="sm" iconOnly disabled={pagination.page >= totalPages} onClick={() => setPage(pagination.page + 1)} icon={<ChevronRight className="size-4" />} />
            </div>
          )}
        </>
      )}

      <CourseFormModal
        key={modal.key}
        open={modal.open}
        course={modal.course}
        onClose={closeModal}
        onSaved={() => {
          closeModal();
          invalidate(queryKeys.courses.all);
        }}
      />
    </div>
  );
};

export default CoursesList;
