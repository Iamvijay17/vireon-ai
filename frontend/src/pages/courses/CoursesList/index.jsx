import { useMemo, useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { PageHeader, EmptyState, ErrorState } from "../../../components";
import FilterBar from "../../../components/FilterBar";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Select";
import { SearchInput } from "../../../components/ui/SearchInput";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { Pagination } from "../../../components/ui/Pagination";
import { SkeletonCard } from "../../../components/ui/Skeleton";
import { toast } from "../../../components/ui/toastBus";
import { useApiQuery, useInvalidate } from "../../../lib/useApiQuery";
import { queryKeys } from "../../../lib/queryClient";
import { useDebouncedValue, SEARCH_DEBOUNCE_MS } from "../../../lib/useDebouncedValue";
import { confirmDialog } from "../../../components/ui/confirmBus";
import { getCourses, deleteCourse } from "../../../services/api";
import { CATEGORY_OPTIONS, STATUS_OPTIONS } from "./constants";
import { CourseCard } from "./CourseCard";
import { CourseFormModal } from "./CourseFormModal";

// Stable empty reference so consumers of `courses` do not see a new array
// identity on every render before the first load resolves.
const EMPTY_COURSES = [];
const PAGE_LIMIT = 20;

const STATUS_TABS = [{ value: "", label: "All" }, ...STATUS_OPTIONS];
const CATEGORY_FILTER = [{ value: "", label: "All categories" }, ...CATEGORY_OPTIONS];

/**
 * Courses: multi-lesson video courses. Search, status and category are all
 * applied by the server, so they cover every course, not just the page shown.
 */
const CoursesList = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  // `key` changes on every open so the form remounts fresh for each course.
  const [modal, setModal] = useState({ open: false, course: null, key: 0 });

  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const filters = useMemo(
    () => ({ search: debouncedSearch || undefined, status: status || undefined, category: category || undefined }),
    [debouncedSearch, status, category]
  );

  const { data, loading, refreshing, error, refetch } = useApiQuery(
    queryKeys.courses.list(page, filters),
    () => getCourses(page, PAGE_LIMIT, filters),
    { errorMessage: "Failed to load courses" }
  );
  const invalidate = useInvalidate();

  const courses = data?.courses ?? EMPTY_COURSES;
  const pagination = data?.pagination ?? { page, limit: PAGE_LIMIT, total: 0, pages: 0 };
  const filtersActive = Boolean(debouncedSearch || status || category);

  // Narrowing the filters returns to page 1 - a filter applied on page 3
  // would otherwise land on an empty page.
  const reset = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const openModal = (course = null) => setModal((prev) => ({ open: true, course, key: prev.key + 1 }));
  const closeModal = () => setModal((prev) => ({ ...prev, open: false }));

  const handleDelete = async (course) => {
    const ok = await confirmDialog({
      title: `Delete “${course.title}”?`,
      content: "The course and all of its lessons, with their generated files, will be deleted. This can't be undone.",
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

  return (
    <div>
      <PageHeader
        title="Courses"
        description={`Turn a curriculum into a series of lesson videos.${!loading && !error ? ` ${pagination.total} course${pagination.total === 1 ? "" : "s"}${filtersActive ? " match" : ""}.` : ""}`}
        extra={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openModal()}>
            Create course
          </Button>
        }
      />

      <FilterBar
        search={<SearchInput value={search} onChange={reset(setSearch)} placeholder="Search courses" />}
        onRefresh={refetch}
        refreshing={refreshing}
        refreshLabel="Refresh courses"
      >
        <SegmentedControl aria-label="Filter by status" value={status} onChange={reset(setStatus)} options={STATUS_TABS} />
        <Select aria-label="Filter by category" className="w-48" value={category} onChange={reset(setCategory)} options={CATEGORY_FILTER} />
      </FilterBar>

      {error && courses.length === 0 ? (
        <ErrorState message="Could not load courses" description={error.friendlyMessage || error.message} onRetry={refetch} />
      ) : loading && courses.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={filtersActive ? "No courses match" : "No courses yet"}
          description={filtersActive ? "Try another status, category or search." : "Create a course, generate its curriculum, then produce each lesson as a video."}
          actionLabel={filtersActive ? "Clear filters" : "Create your first course"}
          actionIcon={filtersActive ? undefined : <Plus className="size-4" />}
          onAction={
            filtersActive
              ? () => {
                  setSearch("");
                  setStatus("");
                  setCategory("");
                  setPage(1);
                }
              : () => openModal()
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {courses.map((course) => (
              <CourseCard key={course._id} course={course} onEdit={openModal} onDelete={handleDelete} />
            ))}
          </div>
          <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface empty:hidden">
            <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} onChange={setPage} className="flex items-center justify-between gap-2 px-4 py-2.5" />
          </div>
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
