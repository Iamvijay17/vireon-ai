import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, ExternalLink, Film, Pencil, Plus } from "lucide-react";
import { getVideoJobs, resolveMediaUrl } from "../../services/api";
import { PageHeader, EmptyState, ErrorState } from "../../components";
import ProjectGrid from "../../components/ProjectCard/ProjectGrid";
import FilterBar from "../../components/FilterBar";
import { Select } from "../../components/ui/Select";
import { SearchInput } from "../../components/ui/SearchInput";
import { Pagination } from "../../components/ui/Pagination";
import { useApiQuery } from "../../lib/useApiQuery";
import { queryKeys } from "../../lib/queryClient";
import { useDebouncedValue, SEARCH_DEBOUNCE_MS } from "../../lib/useDebouncedValue";
import { videoToProject } from "../../lib/projectModel";

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "educational", label: "Educational" },
  { value: "marketing", label: "Marketing" },
  { value: "story", label: "Story" },
  { value: "youtube_shorts", label: "YouTube Shorts" },
  { value: "podcast", label: "Podcast" },
  { value: "motivational", label: "Motivational" },
  { value: "business", label: "Business" },
];

const PAGE_SIZE = 12;
const EMPTY = [];

/** Finished videos only: browse, open, edit or download them. Search and type are applied by the server. */
const CompletedVideos = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");

  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const filters = useMemo(
    () => ({ status: "COMPLETED", type: type || undefined, search: debouncedSearch || undefined }),
    [type, debouncedSearch]
  );

  const { data, loading, refreshing, error, refetch } = useApiQuery(
    queryKeys.videos.list(page, { limit: PAGE_SIZE, ...filters }),
    () => getVideoJobs(page, PAGE_SIZE, filters),
    { errorMessage: "Failed to fetch completed videos" }
  );
  const jobs = data?.jobs ?? EMPTY;
  const pagination = data?.pagination ?? { page, total: 0, pages: 0 };
  const projects = useMemo(() => jobs.map(videoToProject), [jobs]);
  const filtersActive = Boolean(type || debouncedSearch);

  const actionsFor = (project) => [
    { label: "Open", icon: <ExternalLink />, onSelect: (p) => navigate(p.route) },
    ...(project.editRoute ? [{ label: "Open editor", icon: <Pencil />, onSelect: (p) => navigate(p.editRoute) }] : []),
    ...(project.raw.videoUrl ? [{ label: "Download", icon: <Download />, onSelect: (p) => window.open(resolveMediaUrl(p.raw.videoUrl), "_blank", "noopener") }] : []),
  ];

  const reset = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        title="Completed Videos"
        description={`Finished renders, ready to watch or download.${!loading && !error ? ` ${pagination.total} video${pagination.total === 1 ? "" : "s"}${filtersActive ? " match" : ""}.` : ""}`}
      />

      <FilterBar
        search={<SearchInput value={search} onChange={reset(setSearch)} placeholder="Search by topic" />}
        onRefresh={refetch}
        refreshing={refreshing}
        refreshLabel="Refresh"
      >
        <Select aria-label="Filter by type" className="w-44" value={type} onChange={reset(setType)} options={TYPE_OPTIONS} />
      </FilterBar>

      {error && jobs.length === 0 ? (
        <ErrorState message="Could not load completed videos" description={error.friendlyMessage || error.message} onRetry={refetch} />
      ) : loading && jobs.length === 0 ? (
        <ProjectGrid loading />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={Film}
          title={filtersActive ? "No videos match" : "No completed videos yet"}
          description={filtersActive ? "Try another type or search." : "Finished renders show up here."}
          actionLabel={filtersActive ? "Clear filters" : "Create Video"}
          actionIcon={filtersActive ? undefined : <Plus className="size-4" />}
          onAction={
            filtersActive
              ? () => {
                  setSearch("");
                  setType("");
                  setPage(1);
                }
              : () => navigate("/wizard")
          }
        />
      ) : (
        <>
          <ProjectGrid projects={projects} actions={actionsFor} />
          <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface empty:hidden">
            <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} onChange={setPage} className="flex items-center justify-between gap-2 px-4 py-2.5" />
          </div>
        </>
      )}
    </div>
  );
};

export default CompletedVideos;
