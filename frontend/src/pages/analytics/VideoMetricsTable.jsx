import { useEffect, useState } from "react";
import { ListVideo, ChevronLeft, ChevronRight } from "lucide-react";
import { getVideoMetrics } from "../../services/api";
import { LoadingState, EmptyState } from "../../components";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Table } from "../../components/ui/Table";
import { toast } from "../../components/ui/toastBus";
import { formatDuration } from "./format";

// Mirrors AnalyticsService's STAGE_BUCKETS (backend/src/services/common/AnalyticsService.js)
const STAGE_COLUMNS = [
  { key: "planning", label: "Planning" },
  { key: "tts", label: "TTS" },
  { key: "sceneBuild", label: "Scene Build" },
  { key: "rendering", label: "Rendering" },
  { key: "upload", label: "Upload" },
];

const STATUS_BADGE = {
  COMPLETED: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
  RETRY_SCHEDULED: "warning",
};

const COLUMNS = [
  {
    key: "topic",
    title: "Video",
    render: (row) => (
      <div className="min-w-0 max-w-[220px]">
        <p className="truncate font-medium text-text-primary">{row.topic}</p>
        <p className="text-[11px] text-text-tertiary">{new Date(row.createdAt).toLocaleString()}</p>
      </div>
    ),
  },
  {
    key: "status",
    title: "Status",
    render: (row) => <Badge variant={STATUS_BADGE[row.status] || "info"}>{row.status}</Badge>,
  },
  ...STAGE_COLUMNS.map((stage) => ({
    key: stage.key,
    title: stage.label,
    align: "right",
    render: (row) => {
      const ms = row.stages.find((s) => s.key === stage.key)?.durationMs;
      return ms ? formatDuration(ms) : "—";
    },
  })),
  {
    key: "totalMs",
    title: "Total",
    align: "right",
    render: (row) => <span className="font-semibold text-text-primary">{formatDuration(row.totalMs)}</span>,
  },
];

/**
 * Time spent in each pipeline stage per video job, paged. Loads its own data
 * (independent of the page's date range), most recent jobs first.
 */
export function VideoMetricsTable() {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);

  const fetchPage = async (page = 1) => {
    try {
      setLoading(true);
      const res = await getVideoMetrics({ page, limit: 10 });
      setRows(res.data.rows || []);
      setPagination(res.data.pagination || { page, total: 0, totalPages: 0 });
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to load per-video metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage(1);
  }, []);

  return (
    <Card className="mt-4 animate-slide-up overflow-hidden rounded-2xl shadow-sm" style={{ "--stagger-index": 17 }}>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <ListVideo className="size-4 text-text-tertiary" /> Per-Video Metrics
          </span>
        }
        subtitle="Time spent in each pipeline stage, most recent jobs first"
      />
      {loading && rows.length === 0 ? (
        <LoadingState label="Loading per-video metrics..." />
      ) : rows.length === 0 ? (
        <EmptyState description="No video jobs yet." />
      ) : (
        <Table rowKey="id" loading={loading} data={rows} columns={COLUMNS} />
      )}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 border-t border-border-light px-4 py-3">
          <span className="mr-2 text-xs text-text-tertiary">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            iconOnly
            disabled={pagination.page <= 1}
            onClick={() => fetchPage(pagination.page - 1)}
            icon={<ChevronLeft className="size-4" />}
          />
          <Button
            variant="secondary"
            size="sm"
            iconOnly
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => fetchPage(pagination.page + 1)}
            icon={<ChevronRight className="size-4" />}
          />
        </div>
      )}
    </Card>
  );
}
