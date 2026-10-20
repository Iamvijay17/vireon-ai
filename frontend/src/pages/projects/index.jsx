import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, ExternalLink, FolderKanban, LayoutGrid, List, Pencil, Plus, Trash2 } from "lucide-react";
import { deleteVideoJob, deleteCourse } from "../../services/api";
import { PageHeader, EmptyState, ErrorState } from "../../components";
import ProjectGrid from "../../components/ProjectCard/ProjectGrid";
import FilterBar from "../../components/FilterBar";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { SearchInput } from "../../components/ui/SearchInput";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";
import { useInvalidate } from "../../lib/useApiQuery";
import { queryKeys } from "../../lib/queryClient";
import { useDebouncedValue, SEARCH_DEBOUNCE_MS } from "../../lib/useDebouncedValue";
import { useProjects } from "../../lib/useProjects";
import { STATUS_FILTERS, SORTS, filterProjects, sortProjects, countByStatus } from "../../lib/projectModel";

const PAGE_STEP = 100;
const VIEW_KEY = "vireon-projects-view";

const KIND_OPTIONS = [
  { value: "", label: "All projects" },
  { value: "video", label: "Videos" },
  { value: "course", label: "Courses" },
];

const readView = () => {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
};

/**
 * Everything you are working on - single videos and courses - in one place,
 * with search, status filters, sorting and a grid/list switch. Search runs on
 * the server (so it finds projects beyond the loaded page); the rest narrows
 * what is loaded, and the page says plainly when more exist than are shown.
 */
const Projects = () => {
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("updated");
  const [view, setViewState] = useState(readView);
  const [limit, setLimit] = useState(PAGE_STEP);

  const setView = (next) => {
    setViewState(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Private mode / blocked storage: the choice just won't be remembered.
    }
  };

  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const { projects, totals, truncated, loading, refreshing, error, failed, refetch } = useProjects({
    search: debouncedSearch,
    limit,
  });

  const visible = useMemo(
    () => sortProjects(filterProjects(projects, { kind, status }), sort),
    [projects, kind, status, sort]
  );
  const counts = useMemo(() => countByStatus(projects, { kind }), [projects, kind]);

  const handleDelete = async (project) => {
    const isCourse = project.kind === "course";
    const ok = await confirmDialog({
      title: `Delete “${project.title}”?`,
      content: isCourse
        ? "The course, all of its lessons and their generated files will be removed. This can't be undone."
        : "The video job and its generated files will be removed. This can't be undone.",
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await (isCourse ? deleteCourse(project.id) : deleteVideoJob(project.id));
      toast.success(`Deleted “${project.title}”`);
      invalidate(queryKeys.videos.all, queryKeys.jobs.all, queryKeys.courses.all, queryKeys.assets.all);
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to delete the project");
    }
  };

  const actionsFor = (project) => [
    { label: "Open", icon: <ExternalLink />, onSelect: (p) => navigate(p.route) },
    ...(project.editRoute ? [{ label: "Open editor", icon: <Pencil />, onSelect: (p) => navigate(p.editRoute) }] : []),
    { divider: true },
    { label: "Delete…", icon: <Trash2 />, danger: true, onSelect: handleDelete },
  ];

  const filtersActive = Boolean(debouncedSearch || kind || status !== "all");
  const clearFilters = () => {
    setSearch("");
    setKind("");
    setStatus("all");
  };

  const everythingFailed = error && projects.length === 0;
  const noProjectsAtAll = !loading && !error && projects.length === 0 && !debouncedSearch;

  return (
    <div>
      <PageHeader
        title="My Projects"
        description="Videos and courses in one place. Open a project to follow its progress, edit its scenes or download the result."
        extra={
          <Button variant="secondary" icon={<BookOpen className="size-4" />} onClick={() => navigate("/courses")}>
            Courses
          </Button>
        }
      />

      <FilterBar
        search={<SearchInput value={search} onChange={setSearch} placeholder="Search projects" />}
        onRefresh={refetch}
        refreshing={refreshing}
        refreshLabel="Refresh projects"
        trailing={
          <SegmentedControl
            aria-label="Layout"
            value={view}
            onChange={setView}
            options={[
              { value: "grid", label: <LayoutGrid className="size-4" aria-label="Grid" />, title: "Grid view" },
              { value: "list", label: <List className="size-4" aria-label="List" />, title: "List view" },
            ]}
          />
        }
      >
        <SegmentedControl
          aria-label="Filter by status"
          value={status}
          onChange={setStatus}
          options={STATUS_FILTERS.map((f) => ({ ...f, count: loading ? undefined : counts[f.value] }))}
        />
        <Select aria-label="Filter by type" className="w-36" value={kind} onChange={setKind} options={KIND_OPTIONS} />
        <Select aria-label="Sort by" className="w-44" value={sort} onChange={setSort} options={SORTS} />
      </FilterBar>

      {error && !everythingFailed && (
        <ErrorState
          className="mb-4"
          message={failed.videos ? "Videos could not be loaded" : "Courses could not be loaded"}
          description="The other list is shown, but this page is incomplete until it loads."
          onRetry={refetch}
        />
      )}

      {everythingFailed ? (
        <ErrorState message="Could not load projects" description={error.friendlyMessage || error.message} onRetry={refetch} />
      ) : loading ? (
        <ProjectGrid loading view={view} />
      ) : noProjectsAtAll ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create your first video and it will appear here, with its progress and result."
          actionLabel="Create Video"
          actionIcon={<Plus className="size-4" />}
          onAction={() => navigate("/wizard")}
          secondaryLabel="Start a course"
          onSecondary={() => navigate("/courses")}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects match"
          description={debouncedSearch ? `Nothing found for “${debouncedSearch}” with these filters.` : "No project has this status or type."}
          actionLabel={filtersActive ? "Clear filters" : undefined}
          onAction={filtersActive ? clearFilters : undefined}
        />
      ) : (
        <>
          <p aria-live="polite" className="mb-3 text-xs text-text-tertiary">
            {visible.length} project{visible.length === 1 ? "" : "s"}
            {truncated && ` · ${projects.length} of ${totals.videos + totals.courses} loaded, newest first`}
          </p>
          <ProjectGrid projects={visible} view={view} actions={actionsFor} />
          {truncated && (
            <div className="mt-5 flex justify-center">
              <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE_STEP)}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Projects;
