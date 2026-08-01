import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, FolderKanban, Film, BookOpen, PlayCircle, CheckCircle2 } from "lucide-react";
import { getVideoJobs, getCourses } from "../../services/api";
import { PageHeader, LoadingState, EmptyState, StatusTag } from "../../components";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Badge } from "../../components/ui/Badge";
import { toast } from "../../components/ui/toastBus";

const TYPE_OPTIONS = [
  { value: "", label: "All projects" },
  { value: "video", label: "Video jobs" },
  { value: "course", label: "Courses" },
];

const FETCH_LIMIT = 50;

/**
 * Unified overview across the two kinds of work this app produces: single
 * Video Jobs (wizard/render pipeline) and multi-lesson Courses. Both already
 * have their own dedicated pages (Dashboard, Courses) - this view exists to
 * answer "what am I working on right now" across both at a glance, so it
 * intentionally reuses their existing list endpoints rather than a new model.
 */
const Projects = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [videoJobs, setVideoJobs] = useState([]);
  const [courses, setCourses] = useState([]);
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [jobsRes, coursesRes] = await Promise.all([
        getVideoJobs(1, FETCH_LIMIT),
        getCourses(1, FETCH_LIMIT),
      ]);
      setVideoJobs(jobsRes.data.jobs || []);
      setCourses(coursesRes.data.courses || []);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const projects = useMemo(() => {
    const fromJobs = videoJobs.map((j) => ({
      id: j._id,
      kind: "video",
      title: j.topic,
      status: j.status,
      thumbnail: j.thumbnailUrl,
      meta: [j.type, j.resolution].filter(Boolean).join(" · "),
      updatedAt: j.updatedAt || j.createdAt,
      route: `/render?id=${j._id}`,
    }));
    const fromCourses = courses.map((c) => ({
      id: c._id,
      kind: "course",
      title: c.title,
      status: c.status,
      thumbnail: c.thumbnail,
      meta: `${c.completedVideoCount || 0} / ${c.videoCount || 0} lessons`,
      updatedAt: c.updatedAt || c.createdAt,
      route: `/courses/${c._id}`,
    }));

    return [...fromJobs, ...fromCourses]
      .filter((p) => !type || p.kind === type)
      .filter((p) => !search || p.title?.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }, [videoJobs, courses, type, search]);

  const stats = [
    { title: "Total Projects", value: videoJobs.length + courses.length, icon: FolderKanban, tone: "accent" },
    { title: "Video Jobs", value: videoJobs.length, icon: Film, tone: "info" },
    { title: "Courses", value: courses.length, icon: BookOpen, tone: "warning" },
    {
      title: "Completed",
      value:
        videoJobs.filter((j) => j.status === "COMPLETED").length +
        courses.filter((c) => c.status === "Completed").length,
      icon: CheckCircle2,
      tone: "success",
    },
  ];

  const toneCls = {
    accent: "bg-accent-subtle text-accent",
    info: "bg-info-500/10 text-info-600 dark:text-info-500",
    warning: "bg-warning-500/10 text-warning-600 dark:text-warning-500",
    success: "bg-success-500/10 text-success-600 dark:text-success-500",
  };

  if (loading && videoJobs.length === 0 && courses.length === 0) {
    return (
      <div>
        <PageHeader title="Projects" description="Everything you're working on — video jobs and courses, in one place." />
        <Card>
          <LoadingState label="Loading projects..." />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Everything you're working on — video jobs and courses, in one place."
        extra={
          <>
            <Button variant="secondary" size="sm" onClick={() => navigate("/courses")} icon={<BookOpen className="size-4" />}>
              New Course
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate("/wizard")} icon={<Plus className="size-4" />}>
              New Video
            </Button>
          </>
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

      {/* Filters */}
      <Card className="mb-6 mt-6 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            icon={<Search className="size-4" />}
            placeholder="Search projects..."
            className="min-w-56 flex-1"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={type} onChange={setType} options={TYPE_OPTIONS} className="w-44" />
        </div>
      </Card>

      {projects.length === 0 ? (
        <Card>
          <EmptyState
            description="No projects yet. Start a video or a course to see it here."
            actionLabel="Create Video"
            actionIcon={<PlayCircle className="size-4" />}
            onAction={() => navigate("/wizard")}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p, i) => (
            <Card
              key={`${p.kind}-${p.id}`}
              hoverable
              className="animate-slide-up cursor-pointer overflow-hidden"
              style={{ "--stagger-index": i % 12 }}
              onClick={() => navigate(p.route)}
            >
              <div className="relative aspect-video w-full overflow-hidden bg-neutral-950">
                {p.thumbnail ? (
                  <img src={p.thumbnail} alt={p.title} className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-neutral-600">
                    {p.kind === "course" ? <BookOpen className="size-8" /> : <Film className="size-8" />}
                  </div>
                )}
                <Badge
                  variant={p.kind === "course" ? "warning" : "info"}
                  className="absolute left-2 top-2 backdrop-blur-sm"
                >
                  {p.kind === "course" ? "Course" : "Video"}
                </Badge>
              </div>

              <div className="p-4">
                <p className="mb-2 truncate text-sm font-medium text-text-primary">{p.title}</p>
                <div className="mb-3 flex items-center justify-between">
                  <StatusTag status={p.status} />
                </div>
                <div className="flex items-center justify-between text-xs text-text-tertiary">
                  <span className="truncate">{p.meta}</span>
                  <span className="shrink-0">{p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : "—"}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Projects;
