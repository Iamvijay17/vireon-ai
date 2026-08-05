import { useState, useEffect, useMemo } from "react";
import {
  FolderKanban,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Plus,
  Eye,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Search,
  Video,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getVideoJobs, deleteVideoJob } from "../../services/api";
import { connect, onJobCreated, onJobCompleted, onJobFailed } from "../../services/socket";
import { LoadingState, EmptyState, StatusTag } from "../../components";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Progress } from "../../components/ui/Progress";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";
import { classifyStatus } from "../../lib/statusTone";
import { timeAgo } from "../../lib/timeAgo";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "processing", label: "Processing" },
  { value: "success", label: "Completed" },
  { value: "error", label: "Failed" },
];

const toneCls = {
  accent: "bg-gradient-to-br from-accent-500/20 to-accent-500/5 text-accent",
  warning: "bg-gradient-to-br from-warning-500/20 to-warning-500/5 text-warning-600 dark:text-warning-500",
  success: "bg-gradient-to-br from-success-500/20 to-success-500/5 text-success-600 dark:text-success-500",
  danger: "bg-gradient-to-br from-danger-500/20 to-danger-500/5 text-danger-600 dark:text-danger-500",
  neutral: "bg-surface-hover text-text-tertiary",
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 0 });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchJobs = async (page = 1) => {
    try {
      setLoading(true);
      const res = await getVideoJobs(page);
      setJobs(res.data.jobs);
      setPagination(res.data.pagination);
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to fetch jobs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    connect();
  }, []);

  // Real-time updates via Socket.IO
  useEffect(() => {
    const unsubCreated = onJobCreated((data) => {
      setJobs((prev) => [{ ...data, status: data.status || "QUEUED", progress: 0 }, ...prev]);
    });

    const unsubCompleted = onJobCompleted((data) => {
      setJobs((prev) =>
        prev.map((j) => (j._id === data.jobId ? { ...j, status: "COMPLETED", progress: 100, videoUrl: data.videoUrl } : j))
      );
    });

    const unsubFailed = onJobFailed((data) => {
      setJobs((prev) => prev.map((j) => (j._id === data.jobId ? { ...j, status: "FAILED", error: data.error } : j)));
    });

    return () => {
      unsubCreated();
      unsubCompleted();
      unsubFailed();
    };
  }, []);

  const handleDelete = async (job) => {
    if (!(await confirmDialog({ title: `Delete "${job.topic}"?`, content: "This can't be undone.", danger: true, confirmText: "Delete" }))) {
      return;
    }
    try {
      await deleteVideoJob(job._id);
      toast.success("Job deleted");
      setJobs((prev) => prev.filter((j) => j._id !== job._id));
    } catch {
      toast.error("Failed to delete job");
    }
  };

  const stats = [
    { title: "Total Jobs", value: pagination.total, icon: FolderKanban, tone: "accent" },
    {
      title: "Processing",
      value: jobs.filter((j) => !["COMPLETED", "FAILED", "QUEUED"].includes(j.status)).length,
      icon: RefreshCw,
      tone: "warning",
    },
    { title: "Completed", value: jobs.filter((j) => j.status === "COMPLETED").length, icon: CheckCircle2, tone: "success" },
    { title: "Failed", value: jobs.filter((j) => j.status === "FAILED").length, icon: XCircle, tone: "danger" },
  ];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((j) => {
      if (statusFilter !== "all" && classifyStatus(j.status) !== statusFilter) return false;
      if (!q) return true;
      return j.topic?.toLowerCase().includes(q) || j.type?.toLowerCase().includes(q);
    });
  }, [jobs, query, statusFilter]);

  const pageSize = 20;
  const totalPages = pagination.pages || Math.ceil(pagination.total / pageSize) || 1;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">Video Dashboard</h1>
          <p className="mt-1 text-sm text-text-secondary">Track every render job from script to finished video.</p>
        </div>
        <Button variant="primary" size="lg" icon={<Plus className="size-4" />} onClick={() => navigate("/wizard")}>
          Create Video
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s, i) => (
          <Card key={s.title} hoverable className="animate-slide-up overflow-hidden p-5" style={{ "--stagger-index": i }}>
            <div className={`mb-3 flex size-10 items-center justify-center rounded-[10px] ${toneCls[s.tone]}`}>
              <s.icon className="size-[19px]" />
            </div>
            <p className="text-xs font-medium text-text-tertiary">{s.title}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Job List */}
      <Card className="mt-6 animate-slide-up overflow-hidden" style={{ "--stagger-index": 4 }}>
        <div className="flex flex-wrap items-center gap-3 border-b border-border-light px-5 py-4">
          <div>
            <h3 className="text-[15px] font-semibold text-text-primary">Recent Jobs</h3>
            <p className="mt-0.5 text-xs text-text-tertiary">{pagination.total} total</p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-full border border-border bg-surface-hover/50 p-1">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setStatusFilter(f.value)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    statusFilter === f.value
                      ? "bg-surface text-text-primary shadow-sm"
                      : "text-text-tertiary hover:text-text-secondary"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <Input
              icon={<Search className="size-4" />}
              placeholder="Search jobs..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-48"
            />
            <Button
              variant="secondary"
              size="sm"
              iconOnly
              aria-label="Refresh jobs"
              loading={loading}
              icon={<RefreshCw className="size-4" />}
              onClick={() => fetchJobs(pagination.page)}
            />
          </div>
        </div>

        {loading && jobs.length === 0 ? (
          <LoadingState label="Loading jobs..." />
        ) : filtered.length === 0 ? (
          jobs.length === 0 ? (
            <EmptyState
              description="No jobs yet. Create your first video!"
              actionLabel="Create Video"
              actionIcon={<Plus className="size-4" />}
              onAction={() => navigate("/wizard")}
            />
          ) : (
            <EmptyState description="No jobs match your search or filter." />
          )
        ) : (
          <>
            <div className="divide-y divide-border-light">
              {filtered.map((job) => {
                const tone = classifyStatus(job.status);
                const isActive = tone === "processing";
                const iconTone =
                  tone === "success" ? "success" : tone === "error" ? "danger" : tone === "processing" ? "accent" : "neutral";
                return (
                  <div key={job._id} className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-hover">
                    <div className={`flex size-9 shrink-0 items-center justify-center rounded-[10px] ${toneCls[iconTone]}`}>
                      {isActive ? <Sparkles className="size-4" /> : <Video className="size-4" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <button
                        onClick={() => navigate(`/render?id=${job._id}`)}
                        className="max-w-full truncate text-left text-[13.5px] font-medium text-text-primary hover:text-accent"
                      >
                        {job.topic}
                      </button>
                      <p className="mt-0.5 truncate text-xs text-text-tertiary">
                        {job.type} · {timeAgo(job.createdAt)}
                      </p>
                    </div>

                    {isActive && (
                      <div className="hidden w-32 shrink-0 sm:block">
                        <Progress percent={job.progress || 0} size="sm" status="active" />
                      </div>
                    )}

                    <div className="shrink-0">
                      <StatusTag status={job.status} />
                    </div>

                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        iconOnly
                        aria-label={`View progress for ${job.topic}`}
                        onClick={() => navigate(`/render?id=${job._id}`)}
                        icon={<Eye className="size-4" />}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        iconOnly
                        aria-label={`Delete ${job.topic}`}
                        onClick={() => handleDelete(job)}
                        icon={<Trash2 className="size-4 text-danger-500" />}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-end gap-2 border-t border-border-light px-5 py-3">
                <span className="mr-2 text-xs text-text-tertiary">
                  Page {pagination.page} of {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  iconOnly
                  disabled={pagination.page <= 1}
                  onClick={() => fetchJobs(pagination.page - 1)}
                  icon={<ChevronLeft className="size-4" />}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  iconOnly
                  disabled={pagination.page >= totalPages}
                  onClick={() => fetchJobs(pagination.page + 1)}
                  icon={<ChevronRight className="size-4" />}
                />
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
};

export default Dashboard;
