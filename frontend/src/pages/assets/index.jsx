import { useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Images, LayoutGrid, List, Trash2 } from "lucide-react";
import { getAssets, deleteAsset } from "../../services/api";
import { PageHeader, EmptyState, ErrorState } from "../../components";
import DataTable from "../../components/DataTable";
import FilterBar from "../../components/FilterBar";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { SearchInput } from "../../components/ui/SearchInput";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Pagination } from "../../components/ui/Pagination";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";
import { useApiQuery, useInvalidate } from "../../lib/useApiQuery";
import { queryKeys } from "../../lib/queryClient";
import { useDebouncedValue, SEARCH_DEBOUNCE_MS } from "../../lib/useDebouncedValue";
import { formatBytes } from "../../lib/format";
import { timeAgo } from "../../lib/timeAgo";
import { useOverview } from "../dashboard/useOverview";
import { mediaKind, KIND_LABEL } from "../../components/media/mediaKind";
import { KIND_TABS, OWNER_OPTIONS, OWNER_LABEL, CATEGORY_LABEL, PAGE_SIZE } from "./mediaLibrary";
import { MediaTile } from "./MediaTile";
import { MediaDetailModal } from "./MediaDetailModal";

const EMPTY = [];
const VIEW_KEY = "vireon-media-view";

const readView = () => {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
};

/**
 * Media Library: every file the pipeline and the studios have written to
 * storage, browsable by kind, with a real preview. Files are created by jobs
 * (and the Voice and Image studios), so there is no manual upload here - the
 * actions that exist are the ones the backend supports: open, copy the link,
 * jump to the source, delete.
 */
const MediaLibrary = () => {
  const invalidate = useInvalidate();
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState("");
  const [owner, setOwner] = useState("");
  const [search, setSearch] = useState("");
  const [orphanedOnly, setOrphanedOnly] = useState(false);
  const [view, setViewState] = useState(readView);
  const [open, setOpen] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const setView = (next) => {
    setViewState(next);
    setPage(1);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Storage blocked: the choice just is not remembered.
    }
  };

  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const pageSize = PAGE_SIZE[view];
  const filters = useMemo(
    () => ({
      ownerType: owner || undefined,
      category: kind || undefined,
      search: debouncedSearch || undefined,
      orphanedOnly: orphanedOnly || undefined,
    }),
    [owner, kind, debouncedSearch, orphanedOnly]
  );

  // Errors are shown inline below (with Retry), not toasted a second time.
  const { data, loading, refreshing, error, refetch } = useApiQuery(
    queryKeys.assets.list(page, { ...filters, limit: pageSize }),
    () => getAssets(page, pageSize, filters),
    { errorMessage: "Failed to load the media library" }
  );
  const { storageByCategory, loading: storageLoading } = useOverview();

  const assets = data?.data ?? EMPTY;
  const pagination = data?.pagination ?? { page, total: 0, pages: 0 };
  const filtersActive = Boolean(kind || owner || debouncedSearch || orphanedOnly);

  // Changing a filter always lands on page 1; staying on page 4 of a narrower
  // result set would show an empty page.
  const withReset = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const clearFilters = () => {
    setKind("");
    setOwner("");
    setSearch("");
    setOrphanedOnly(false);
    setPage(1);
  };

  const handleDelete = async (asset) => {
    const ok = await confirmDialog({
      title: `Delete “${asset.fileName}”?`,
      content: asset.orphaned
        ? "Whatever produced this file no longer exists - deleting it just reclaims storage."
        : "This removes the file from storage. The project that uses it keeps its record but will be missing the file. This can't be undone.",
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteAsset(asset._id);
      toast.success(`Deleted “${asset.fileName}”`);
      setOpen(null);
      invalidate(queryKeys.assets.all, queryKeys.analytics.all);
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to delete the file");
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    {
      key: "fileName",
      title: "File",
      render: (a) => (
        <div className="min-w-0">
          <span className="block max-w-xs truncate text-[13px] font-medium text-text-primary" title={a.fileName}>
            {a.fileName}
          </span>
          {a.orphaned && (
            <span className="inline-flex items-center gap-1 text-[11px] text-warning-600 dark:text-warning-500">
              <AlertTriangle className="size-3" /> orphaned
            </span>
          )}
        </div>
      ),
    },
    { key: "kind", title: "Type", width: 110, render: (a) => <Badge variant="neutral">{CATEGORY_LABEL[a.category] || KIND_LABEL[mediaKind(a)]}</Badge> },
    { key: "ownerType", title: "Source", width: 140, render: (a) => <span className="text-xs text-text-secondary">{OWNER_LABEL[a.ownerType] || a.ownerType}</span> },
    { key: "size", title: "Size", width: 90, align: "right", render: (a) => <span className="tabular text-xs text-text-tertiary">{formatBytes(a.size)}</span> },
    { key: "createdAt", title: "Created", width: 110, align: "right", render: (a) => <span className="text-xs text-text-tertiary" title={a.createdAt ? new Date(a.createdAt).toLocaleString() : undefined}>{timeAgo(a.createdAt)}</span> },
    {
      key: "actions",
      title: "",
      width: 80,
      align: "right",
      render: (a) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" iconOnly aria-label={`Open ${a.fileName}`} icon={<ExternalLink className="size-4" />} onClick={() => window.open(a.url, "_blank", "noopener")} />
          <Button variant="ghost" size="sm" iconOnly aria-label={`Delete ${a.fileName}`} icon={<Trash2 className="size-4 text-danger-500" />} onClick={() => handleDelete(a)} />
        </div>
      ),
    },
  ];

  const totalStored = storageByCategory.reduce((sum, row) => sum + row.bytes, 0);

  return (
    <div>
      <PageHeader
        title="Media Library"
        description="Every image, narration track and rendered video stored for your projects. Files are created by jobs and the studios; open one to preview it."
        meta={!storageLoading && totalStored > 0 && <Badge variant="neutral">{formatBytes(totalStored)} stored</Badge>}
      />

      <FilterBar
        search={<SearchInput value={search} onChange={withReset(setSearch)} placeholder="Search by file name" />}
        onRefresh={refetch}
        refreshing={refreshing}
        refreshLabel="Refresh library"
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
        <SegmentedControl aria-label="File type" value={kind} onChange={withReset(setKind)} options={KIND_TABS} />
        <Select aria-label="Source" className="w-40" value={owner} onChange={withReset(setOwner)} options={OWNER_OPTIONS} />
        <Button
          variant={orphanedOnly ? "primary" : "secondary"}
          aria-pressed={orphanedOnly}
          icon={<AlertTriangle className="size-4" />}
          onClick={() => withReset(setOrphanedOnly)(!orphanedOnly)}
        >
          Orphaned only
        </Button>
      </FilterBar>

      {!loading && storageByCategory.length > 0 && !filtersActive && (
        <p className="mb-3 text-xs text-text-tertiary">
          {storageByCategory.map((row) => `${CATEGORY_LABEL[row.label] || row.label} ${formatBytes(row.bytes)}`).join(" · ")}
        </p>
      )}

      {error && assets.length === 0 ? (
        <ErrorState message="Could not load the media library" description={error.friendlyMessage || error.message} onRetry={refetch} />
      ) : view === "list" ? (
        <DataTable
          columns={columns}
          data={assets}
          rowKey="_id"
          loading={loading}
          onRowClick={setOpen}
          pagination={{ page: pagination.page, pages: pagination.pages, total: pagination.total, onChange: setPage }}
          empty={<LibraryEmpty filtersActive={filtersActive} onClear={clearFilters} />}
        />
      ) : loading && assets.length === 0 ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <LibraryEmpty filtersActive={filtersActive} onClear={clearFilters} />
      ) : (
        <>
          <p aria-live="polite" className="mb-3 text-xs text-text-tertiary">
            {pagination.total} file{pagination.total === 1 ? "" : "s"}
          </p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
            {assets.map((asset) => (
              <MediaTile key={asset._id} asset={asset} onOpen={setOpen} />
            ))}
          </div>
          <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface">
            <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} onChange={setPage} className="flex items-center justify-between gap-2 px-4 py-2.5" />
          </div>
        </>
      )}

      {open && <MediaDetailModal asset={open} onClose={() => setOpen(null)} onDelete={handleDelete} deleting={deleting} />}
    </div>
  );
};

const LibraryEmpty = ({ filtersActive, onClear }) =>
  filtersActive ? (
    <EmptyState icon={Images} title="No files match" description="Try another file type, source or search." actionLabel="Clear filters" onAction={onClear} />
  ) : (
    <EmptyState icon={Images} title="The library is empty" description="Images, narration and rendered videos are saved here as projects are generated." />
  );

export default MediaLibrary;
