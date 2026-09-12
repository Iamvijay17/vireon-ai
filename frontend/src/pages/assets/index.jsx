import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, RefreshCw, Trash2, ExternalLink, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { getAssets, deleteAsset } from "../../services/api";
import { PageHeader, LoadingState, EmptyState } from "../../components";
import { Card } from "../../components/ui/Card";
import { Table } from "../../components/ui/Table";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Badge } from "../../components/ui/Badge";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";

const OWNER_TYPE_OPTIONS = [
  { value: "", label: "All owners" },
  { value: "video", label: "Video jobs" },
  { value: "course-video", label: "Course videos" },
  { value: "audio-studio", label: "Audio Studio" },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "All categories" },
  { value: "audio", label: "Audio" },
  { value: "avatar", label: "Avatar" },
  { value: "render", label: "Render" },
  { value: "audio-studio", label: "Audio Studio" },
];

const OWNER_BADGE = {
  video: { variant: "info", label: "Video" },
  "course-video": { variant: "warning", label: "Course Video" },
  "audio-studio": { variant: "accent", label: "Audio Studio" },
  unknown: { variant: "neutral", label: "Unknown" },
};

const OWNER_ROUTE = {
  video: (id) => `/render?id=${id}`,
  "audio-studio": () => `/audio`,
};

const PAGE_SIZE = 20;

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Cross-cutting browser over the Asset registry (backend/src/models/Asset.js) -
 * every file uploaded to MinIO across video jobs, course videos, and Audio
 * Studio, in one searchable list, with orphan detection (an asset whose
 * owner doc no longer exists - see AssetService.list). Deleting here only
 * removes the file + its registry entry, not the owning job/lesson/generation;
 * for that, use each domain's own delete flow (Job Management, course detail,
 * Audio Studio history).
 */
const AssetsPage = () => {
  const navigate = useNavigate();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 0 });
  const [ownerType, setOwnerType] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [orphanedOnly, setOrphanedOnly] = useState(false);
  const [rowActionId, setRowActionId] = useState(null);

  const fetchAssets = async (page = 1) => {
    try {
      setLoading(true);
      const res = await getAssets(page, PAGE_SIZE, {
        ownerType: ownerType || undefined,
        category: category || undefined,
        search: search || undefined,
        orphanedOnly: orphanedOnly || undefined,
      });
      setAssets(res.data.data || []);
      setPagination(res.data.pagination || { page, total: 0, pages: 0 });
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to load assets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerType, category, search, orphanedOnly]);

  const handleDelete = async (asset) => {
    const ok = await confirmDialog({
      title: `Delete "${asset.fileName}"?`,
      content: asset.orphaned
        ? "This asset's owner no longer exists - deleting it just reclaims storage."
        : "This removes the file from storage. This can't be undone.",
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    setRowActionId(asset._id);
    try {
      await deleteAsset(asset._id);
      toast.success(`Deleted "${asset.fileName}"`);
      fetchAssets(pagination.page);
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to delete asset");
    } finally {
      setRowActionId(null);
    }
  };

  const totalPages = pagination.pages || 1;

  const columns = [
    {
      key: "ownerType",
      title: "Owner",
      width: 140,
      render: (asset) => <Badge variant={OWNER_BADGE[asset.ownerType].variant}>{OWNER_BADGE[asset.ownerType].label}</Badge>,
    },
    {
      key: "category",
      title: "Category",
      width: 110,
      render: (asset) => <span className="text-xs text-text-tertiary">{asset.category}</span>,
    },
    {
      key: "fileName",
      title: "File",
      render: (asset) => (
        <div className="flex items-center gap-2">
          <span className="block max-w-xs truncate text-[13px] font-medium text-text-primary">{asset.fileName}</span>
          {asset.orphaned && (
            <span className="inline-flex items-center gap-1 text-xs text-warning-600 dark:text-warning-500">
              <AlertTriangle className="size-3.5" /> orphaned
            </span>
          )}
        </div>
      ),
    },
    {
      key: "size",
      title: "Size",
      width: 90,
      render: (asset) => <span className="text-xs text-text-tertiary">{formatBytes(asset.size)}</span>,
    },
    {
      key: "createdAt",
      title: "Created",
      width: 150,
      render: (asset) => <span className="text-xs text-text-tertiary">{asset.createdAt ? new Date(asset.createdAt).toLocaleString() : "—"}</span>,
    },
    {
      key: "actions",
      title: "",
      align: "right",
      width: 90,
      render: (asset) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" iconOnly icon={<ExternalLink className="size-4" />} aria-label="Open file" onClick={() => window.open(asset.url, "_blank", "noopener")} />
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            loading={rowActionId === asset._id}
            icon={<Trash2 className="size-4 text-danger-500" />}
            aria-label={`Delete ${asset.fileName}`}
            onClick={() => handleDelete(asset)}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Assets"
        description="Every file uploaded to storage across video jobs, course videos, and Audio Studio - searchable, with orphan detection."
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            icon={<Search className="size-4" />}
            placeholder="Search by file name..."
            className="min-w-56 flex-1"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={ownerType} onChange={setOwnerType} options={OWNER_TYPE_OPTIONS} className="w-44" />
          <Select value={category} onChange={setCategory} options={CATEGORY_OPTIONS} className="w-44" />
          <button
            type="button"
            onClick={() => setOrphanedOnly((v) => !v)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              orphanedOnly
                ? "border-warning-500/40 bg-warning-500/10 text-warning-600 dark:text-warning-500"
                : "border-border bg-surface-hover/50 text-text-tertiary hover:text-text-secondary"
            }`}
          >
            Orphaned only
          </button>
          <Button
            variant="secondary"
            size="sm"
            iconOnly
            aria-label="Refresh assets"
            loading={loading}
            icon={<RefreshCw className="size-4" />}
            onClick={() => fetchAssets(pagination.page)}
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        {assets.length > 0 && (
          <div className="flex items-center gap-3 border-b border-border-light px-4 py-2.5">
            <span className="text-xs text-text-tertiary">{pagination.total} total</span>
          </div>
        )}

        {loading && assets.length === 0 ? (
          <LoadingState label="Loading assets..." />
        ) : assets.length === 0 ? (
          <EmptyState description="No assets match your filters." />
        ) : (
          <Table
            columns={columns}
            data={assets}
            rowKey="_id"
            onRowClick={(asset) => {
              const route = OWNER_ROUTE[asset.ownerType];
              if (route) navigate(route(asset.ownerId));
            }}
          />
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 border-t border-border-light px-4 py-3">
            <span className="mr-2 text-xs text-text-tertiary">
              Page {pagination.page} of {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              iconOnly
              disabled={pagination.page <= 1}
              onClick={() => fetchAssets(pagination.page - 1)}
              icon={<ChevronLeft className="size-4" />}
            />
            <Button
              variant="secondary"
              size="sm"
              iconOnly
              disabled={pagination.page >= totalPages}
              onClick={() => fetchAssets(pagination.page + 1)}
              icon={<ChevronRight className="size-4" />}
            />
          </div>
        )}
      </Card>
    </div>
  );
};

export default AssetsPage;
