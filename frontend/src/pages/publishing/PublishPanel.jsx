import { useMemo, useState } from "react";
import { Send, Film, Clock, Smartphone, MonitorPlay } from "lucide-react";
import { Card, CardHeader } from "../../components/ui/Card";
import { Table } from "../../components/ui/Table";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { cn } from "../../components/ui/cn";
import { EmptyState, ErrorState, LoadingState } from "../../components";
import { useInvalidate } from "../../lib/useApiQuery";
import { queryKeys } from "../../lib/queryClient";
import { createPublishingJob } from "../../services/api";
import { formatSeconds, isActiveStatus } from "./format";
import { usePublishingCourses, usePublishingLessons, usePublishingVideos, useBusy } from "./usePublishing";
import { PublishDialog } from "./PublishDialog";
import { StatusBadge, RemoteLink } from "./shared";

const SOURCES = [
  { key: "lessons", label: "Course lessons" },
  { key: "videos", label: "Standalone videos" },
];

const TYPE_LABEL = { youtube_shorts: "Short" };
const humanizeType = (t) => TYPE_LABEL[t] || String(t || "video").replace(/_/g, " ");

/**
 * Pick a course lesson or a standalone video, review, publish. Only finished,
 * rendered videos can be published, and nothing here starts an upload -
 * "Publish…" opens a draft for review.
 */
export const PublishPanel = ({ caps, accounts, onViewQueue }) => {
  const invalidate = useInvalidate();
  const { isBusy, run } = useBusy();
  const [source, setSource] = useState("lessons");
  const [courseId, setCourseId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [open, setOpen] = useState(null); // { jobId, lesson }

  const { data: coursesData, loading: loadingCourses } = usePublishingCourses();
  const { data, loading, error, refetch } = usePublishingLessons(source === "lessons" ? courseId : null);
  const { data: videosData, loading: loadingVideos, error: videosError, refetch: refetchVideos } = usePublishingVideos(source === "videos");

  const connected = useMemo(() => accounts.filter((a) => a.status === "connected"), [accounts]);
  const activeAccount = connected.find((a) => a._id === accountId) || connected[0];
  const yt = caps?.youtube;
  const ready = Boolean(yt?.configured && activeAccount);

  const courseOptions = (coursesData?.courses || []).map((c) => ({ value: c._id, label: c.title }));
  const lessons = data?.lessons || [];
  const videos = videosData?.videos || [];
  const sourceKey = source === "videos" ? "videoJobId" : "courseVideoId";

  const startDraft = async (item, { reupload = false } = {}) => {
    const res = await run(`draft:${item._id}`, () =>
      createPublishingJob({ accountId: activeAccount._id, [sourceKey]: item._id, allowReupload: reupload })
    );
    if (res) {
      invalidate(queryKeys.publishing.all);
      setOpen({ jobId: res.data.job._id, lesson: item });
    }
  };

  const titleColumn = {
    key: "title", title: source === "videos" ? "Video" : "Lesson",
    render: (l) => (
      <div className="min-w-0">
        <p className="truncate font-medium text-text-primary">{l.title}</p>
        <p className="text-xs text-text-tertiary">
          {source === "videos"
            ? `${humanizeType(l.type)}${l.resolution ? ` · ${l.resolution}` : ""}${l.createdAt ? ` · ${new Date(l.createdAt).toLocaleDateString()}` : ""}`
            : `${l.isPromo ? "Promo / trailer" : `Lesson ${l.order}`}${l.durationSeconds ? ` · ${formatSeconds(l.durationSeconds)}` : ""}`}
        </p>
      </div>
    ),
  };

  const columns = [
    titleColumn,
    {
      key: "render", title: "Video",
      render: (l) => (l.publishable ? <Badge variant="success" icon={<Film className="size-3" />}>Rendered</Badge> : <Badge variant="neutral" icon={<Clock className="size-3" />}>Not rendered</Badge>),
    },
    {
      key: "youtube", title: "On YouTube",
      render: (l) => {
        const published = l.published || [];
        if (published.length) {
          return (
            <div className="flex flex-col items-start gap-0.5">
              {published.map((p) => <RemoteLink key={p.jobId} url={p.url}>Watch{published.length > 1 ? ` (${p.videoId})` : ""}</RemoteLink>)}
            </div>
          );
        }
        return l.latestJob ? <StatusBadge status={l.latestJob.status} /> : <span className="text-xs text-text-tertiary">Not published</span>;
      },
    },
    {
      key: "actions", title: "", align: "right",
      render: (l) => {
        const latest = l.latestJob;
        if (!l.publishable) return <Button size="xs" variant="secondary" disabled>Render first</Button>;
        if (latest && isActiveStatus(latest.status)) return <Button size="xs" variant="secondary" onClick={onViewQueue}>View progress</Button>;
        if (latest?.status === "DRAFT") return <Button size="xs" variant="primary" icon={<Send className="size-3.5" />} onClick={() => setOpen({ jobId: latest._id, lesson: l })}>Review &amp; publish</Button>;
        if (latest?.status === "FAILED") return <Button size="xs" variant="secondary" onClick={() => setOpen({ jobId: latest._id, lesson: l })}>Fix &amp; retry</Button>;
        const published = (l.published || []).length > 0;
        return (
          <Button
            size="xs" variant={published ? "secondary" : "primary"} icon={<Send className="size-3.5" />}
            disabled={!ready} loading={isBusy(`draft:${l._id}`)} onClick={() => startDraft(l, { reupload: published })}
          >
            {published ? "Publish again…" : "Publish…"}
          </Button>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      {!yt?.configured && (
        <Alert type="warning" title="YouTube publishing is not set up yet">
          Add the Google OAuth settings to <code>backend/.env</code>, restart the API and the YouTube worker, then connect a channel on the Accounts tab. Step-by-step: <code>docs/publishing.md</code>.
        </Alert>
      )}
      {yt?.configured && connected.length === 0 && (
        <Alert type="info" title="No YouTube channel connected">
          Connect a channel on the Accounts tab first. Videos are only ever uploaded to a channel you connect and approve.
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Choose what to publish"
          subtitle="Only finished, rendered videos can be published. You review every upload before it starts."
          extra={
            connected.length > 1 && (
              <Select className="w-52" value={activeAccount?._id} onChange={setAccountId} options={connected.map((a) => ({ value: a._id, label: a.displayName || a.externalId }))} />
            )
          }
        />
        <div className="space-y-4 p-4 sm:p-5">
          <div role="tablist" aria-label="What to publish" className="inline-flex rounded-lg border border-border bg-surface p-0.5">
            {SOURCES.map((s) => (
              <button
                key={s.key} type="button" role="tab" aria-selected={source === s.key} onClick={() => setSource(s.key)}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                  source === s.key ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"
                )}
              >
                {s.key === "videos" ? <Smartphone className="size-3.5" /> : <MonitorPlay className="size-3.5" />}
                {s.label}
              </button>
            ))}
          </div>

          {source === "lessons" && (
            <>
              <div className="max-w-md">
                <Select value={courseId} onChange={setCourseId} options={courseOptions} placeholder={loadingCourses ? "Loading courses..." : "Select a course"} />
              </div>
              {!courseId && <EmptyState description="Select a course to see its lessons" />}
              {courseId && loading && <LoadingState label="Loading lessons..." minHeight={140} />}
              {courseId && error && <ErrorState message="Could not load lessons" onRetry={refetch} />}
              {courseId && !loading && !error && lessons.length === 0 && <EmptyState description="This course has no lessons yet" />}
              {courseId && !loading && lessons.length > 0 && <Table columns={columns} data={lessons} />}
            </>
          )}

          {source === "videos" && (
            <>
              {loadingVideos && <LoadingState label="Loading videos..." minHeight={140} />}
              {videosError && <ErrorState message="Could not load videos" onRetry={refetchVideos} />}
              {!loadingVideos && !videosError && videos.length === 0 && <EmptyState description="No finished standalone videos yet. Create one with New Video." />}
              {!loadingVideos && videos.length > 0 && <Table columns={columns} data={videos} />}
            </>
          )}
        </div>
      </Card>

      {open && (
        <PublishDialog
          jobId={open.jobId} lesson={open.lesson} accounts={accounts} caps={caps}
          onClose={() => setOpen(null)}
          onSubmitted={() => { setOpen(null); onViewQueue(); }}
        />
      )}
    </div>
  );
};

export default PublishPanel;
