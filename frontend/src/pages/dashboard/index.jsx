import { useState, useEffect } from "react";
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
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getVideoJobs, deleteVideoJob } from "../../services/api";
import { connect, onJobCreated, onJobCompleted, onJobFailed } from "../../services/socket";
import { PageHeader, LoadingState, EmptyState, StatusTag } from "../../components";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Table } from "../../components/ui/Table";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";

const Dashboard = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 0 });

  const fetchJobs = async (page = 1) => {
    try {
      setLoading(true);
      const res = await getVideoJobs(page);
      setJobs(res.data.jobs);
      setPagination(res.data.pagination);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to fetch jobs");
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

  const toneCls = {
    accent: "bg-accent-subtle text-accent",
    warning: "bg-warning-500/10 text-warning-600 dark:text-warning-500",
    success: "bg-success-500/10 text-success-600 dark:text-success-500",
    danger: "bg-danger-500/10 text-danger-600 dark:text-danger-500",
  };

  const columns = [
    {
      key: "topic",
      title: "Topic",
      render: (r) => (
        <button
          onClick={() => navigate(`/render?id=${r._id}`)}
          className="max-w-xs truncate text-left text-[13px] font-medium text-text-primary hover:text-accent"
        >
          {r.topic}
        </button>
      ),
    },
    {
      key: "type",
      title: "Type",
      render: (r) => (
        <span className="inline-flex rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary">
          {r.type}
        </span>
      ),
    },
    { key: "status", title: "Status", render: (r) => <StatusTag status={r.status} /> },
    {
      key: "progress",
      title: "Progress",
      render: (r) => {
        const isActive = r.status !== "COMPLETED" && r.status !== "FAILED";
        return (
          <span className="flex items-center gap-1.5 text-text-primary">
            {isActive && <RefreshCw className="size-3.5 animate-spin text-accent" />}
            {r.progress}%
          </span>
        );
      },
    },
    {
      key: "createdAt",
      title: "Created",
      render: (r) => new Date(r.createdAt).toLocaleString(),
    },
    {
      key: "actions",
      title: "",
      align: "right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={`View progress for ${r.topic}`}
            onClick={() => navigate(`/render?id=${r._id}`)}
            icon={<Eye className="size-4" />}
          />
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={`Delete ${r.topic}`}
            onClick={() => handleDelete(r)}
            icon={<Trash2 className="size-4 text-danger-500" />}
          />
        </div>
      ),
    },
  ];

  const pageSize = 20;
  const totalPages = pagination.pages || Math.ceil(pagination.total / pageSize) || 1;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        extra={
          <Button variant="primary" size="lg" icon={<Plus className="size-4" />} onClick={() => navigate("/wizard")}>
            Create Video
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s, i) => (
          <Card key={s.title} hoverable className="animate-slide-up p-5" style={{ "--stagger-index": i }}>
            <div className={`mb-3 flex size-10 items-center justify-center rounded-[10px] ${toneCls[s.tone]}`}>
              <s.icon className="size-[19px]" />
            </div>
            <p className="text-xs font-medium text-text-tertiary">{s.title}</p>
            <p className="mt-1 text-2xl font-semibold text-text-primary">{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Job List */}
      <Card className="mt-6 animate-slide-up" style={{ "--stagger-index": 4 }}>
        <CardHeader
          title="Recent Jobs"
          extra={
            <Button variant="secondary" size="sm" loading={loading} onClick={() => fetchJobs(pagination.page)}>
              Refresh
            </Button>
          }
        />
        <div className="p-2">
          {loading && jobs.length === 0 ? (
            <LoadingState label="Loading jobs..." />
          ) : jobs.length === 0 ? (
            <EmptyState
              description="No jobs yet. Create your first video!"
              actionLabel="Create Video"
              actionIcon={<Plus className="size-4" />}
              onAction={() => navigate("/wizard")}
            />
          ) : (
            <>
              <Table columns={columns} data={jobs} rowKey="_id" />
              {totalPages > 1 && (
                <div className="flex items-center justify-end gap-2 border-t border-border-light px-3 py-3">
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
        </div>
      </Card>
    </div>
  );
};

export default Dashboard;
