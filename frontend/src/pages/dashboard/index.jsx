import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, Film, Loader2, Plus, RefreshCw, XCircle } from "lucide-react";
import { PageHeader, EmptyState, ErrorState } from "../../components";
import ProjectGrid from "../../components/ProjectCard/ProjectGrid";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { StatTile } from "../../components/ui/StatTile";
import { useProjects } from "../../lib/useProjects";
import { useActiveJobs } from "../../lib/useActiveJobs";
import { sortProjects } from "../../lib/projectModel";
import { formatBytes, formatDuration } from "../../lib/format";
import { timeAgo } from "../../lib/timeAgo";
import { useOverview } from "./useOverview";
import QuickActions from "./QuickActions";
import LiveActivity from "./LiveActivity";
import ResourcePanel from "./ResourcePanel";

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const RECENT_COUNT = 8;

/**
 * Overview: how the studio is doing right now. Totals come from persisted
 * analytics (not from the page of jobs on screen), live work from the jobs
 * feed, machine load from measured telemetry - and anything that cannot be
 * read says so instead of showing a plausible-looking zero.
 */
const Overview = () => {
  const navigate = useNavigate();
  const { summary, recentFailures, loading: summaryLoading, error: summaryError, refetch: refetchSummary } = useOverview();
  const { projects, loading: projectsLoading, error: projectsError, refetch: refetchProjects } = useProjects({ limit: RECENT_COUNT });

  const { running, queued, loading: activeLoading } = useActiveJobs();

  const recent = useMemo(() => sortProjects(projects, "updated").slice(0, RECENT_COUNT), [projects]);

  const isNewUser = !summaryLoading && !projectsLoading && !summaryError && summary && summary.totalVideoJobs === 0 && summary.totalCourses === 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${greeting()}`}
        description="Here is what the studio is doing right now."
        extra={
          <Button
            variant="secondary"
            iconOnly
            aria-label="Refresh overview"
            title="Refresh overview"
            icon={<RefreshCw className="size-4" />}
            onClick={() => {
              refetchSummary();
              refetchProjects();
            }}
          />
        }
      />

      {isNewUser ? (
        <Card>
          <EmptyState
            icon={Film}
            title="Make your first video"
            description="Give it a topic and Vireon writes the script, records the narration, builds the scenes and renders the result. Everything you make shows up here."
            actionLabel="Create Video"
            actionIcon={<Plus className="size-4" />}
            onAction={() => navigate("/wizard")}
            secondaryLabel="Browse templates"
            onSecondary={() => navigate("/templates")}
          />
        </Card>
      ) : (
        <>
          {summaryError ? (
            <ErrorState message="Totals could not be loaded" description={summaryError.friendlyMessage || summaryError.message} onRetry={refetchSummary} />
          ) : (
            <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile
                label="Videos created"
                icon={Film}
                tone="accent"
                loading={summaryLoading}
                value={summary?.totalVideoJobs}
                hint={summary && summary.totalCourseVideos ? `+ ${summary.totalCourseVideos} course lessons` : undefined}
                onClick={() => navigate("/projects")}
              />
              <StatTile
                label="In progress"
                icon={Loader2}
                tone="accent"
                loading={activeLoading}
                value={running.length + queued.length}
                hint={`${running.length} running · ${queued.length} queued`}
                onClick={() => navigate("/jobs?status=processing")}
              />
              <StatTile
                label="Completed"
                icon={CheckCircle2}
                tone="success"
                loading={summaryLoading}
                value={summary?.completedVideoJobs}
                hint={summary?.jobSuccessRate != null ? `${summary.jobSuccessRate}% success rate` : "No finished jobs yet"}
                onClick={() => navigate("/projects")}
              />
              <StatTile
                label="Failed"
                icon={XCircle}
                tone={summary?.failedVideoJobs ? "danger" : "neutral"}
                loading={summaryLoading}
                value={summary?.failedVideoJobs}
                hint={summary?.avgGenerationTimeMs != null ? `Typical run ${formatDuration(summary.avgGenerationTimeMs)}` : undefined}
                onClick={() => navigate("/jobs?status=error")}
              />
            </section>
          )}

          <QuickActions />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <LiveActivity />
            <ResourcePanel />
          </div>

          <section aria-labelledby="recent-projects">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="recent-projects" className="text-sm font-semibold text-text-primary">
                Recent projects
              </h2>
              <Link to="/projects" className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary">
                View all <ArrowRight className="size-3.5" />
              </Link>
            </div>
            {projectsError && recent.length === 0 ? (
              <ErrorState message="Recent projects could not be loaded" description={projectsError.friendlyMessage || projectsError.message} onRetry={refetchProjects} />
            ) : projectsLoading ? (
              <ProjectGrid loading />
            ) : recent.length === 0 ? (
              <Card>
                <EmptyState compact icon={Film} title="No projects yet" description="Projects you create will be listed here." />
              </Card>
            ) : (
              <ProjectGrid projects={recent} />
            )}
          </section>

          {recentFailures.length > 0 && (
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="size-4 text-danger-500" /> Needs attention
                  </span>
                }
                subtitle="Latest failures"
                extra={
                  <Link to="/jobs" className="text-xs font-medium text-text-secondary hover:text-text-primary">
                    Open Generation Jobs
                  </Link>
                }
              />
              <ul className="divide-y divide-border-light">
                {recentFailures.slice(0, 4).map((f) => (
                  <li key={`${f.source}-${f.id}`} className="flex items-start gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={f.source === "videoJob" ? `/render?id=${f.id}` : "/courses"}
                        className="block truncate text-[13px] font-medium text-text-primary hover:text-accent-fg"
                        title={f.title}
                      >
                        {f.title}
                      </Link>
                      <p className="mt-0.5 line-clamp-2 text-xs text-danger-500" title={f.message}>
                        {f.message}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-text-tertiary" title={new Date(f.occurredAt).toLocaleString()}>
                      {timeAgo(f.occurredAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {summary?.totalStorageBytes ? (
            <p className="text-xs text-text-tertiary">
              {formatBytes(summary.totalStorageBytes)} of generated media in storage ·{" "}
              <Link to="/media" className="hover:text-text-primary">
                Media Library
              </Link>
            </p>
          ) : null}
        </>
      )}
    </div>
  );
};

export default Overview;
