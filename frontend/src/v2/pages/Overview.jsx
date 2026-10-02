import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Film, CheckCircle2, AlertTriangle, Clock, ArrowUpRight, Wand2, Plus, Radio,
} from "lucide-react";
import {
  Panel, PanelHead, Button, StatusPill, Progress, Skeleton, Empty, Mono,
} from "../ui/primitives";
import { PipelineTrack } from "../ui/Pipeline";
import { stagesFromJob } from "../lib/pipelineStages";
import { STATE, stateOf, stageOf } from "../lib/status";
import { useApiQuery } from "../../lib/useApiQuery";
import { queryKeys } from "../../lib/queryClient";
import { getVideoJobs, getCourses } from "../../services/api";
import { timeAgo } from "../../lib/timeAgo";

const EMPTY = [];

/**
 * Overview: the answer to "what is happening right now, and what needs me".
 *
 * v1's dashboard was a stat row over a paginated table - a list view with
 * numbers on top. This inverts the priority: anything *in flight* or
 * *blocked on a person* is surfaced first and large, because those are the
 * only two things a user can act on. Finished work is recent history, shown
 * compactly below.
 */
export default function Overview() {
  const navigate = useNavigate();

  const jobsQuery = useApiQuery(
    queryKeys.videos.list(1, { limit: 50 }),
    () => getVideoJobs(1, 50),
    { errorMessage: "Could not load jobs" }
  );

  const coursesQuery = useApiQuery(
    queryKeys.courses.list(1, { limit: 50 }),
    () => getCourses(1, 50),
    { errorMessage: "Could not load courses" }
  );

  const jobs = jobsQuery.data?.jobs ?? EMPTY;
  const courses = coursesQuery.data?.courses ?? EMPTY;
  const loading = jobsQuery.loading;

  const { active, blocked, recent, counts } = useMemo(() => {
    const byState = (state) => jobs.filter((j) => stateOf(j.status) === state);
    return {
      active: byState(STATE.RUN),
      blocked: byState(STATE.WAIT),
      recent: [...jobs]
        .filter((j) => [STATE.DONE, STATE.FAIL].includes(stateOf(j.status)))
        .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
        .slice(0, 6),
      counts: {
        total: jobs.length,
        done: byState(STATE.DONE).length,
        failed: byState(STATE.FAIL).length,
        running: byState(STATE.RUN).length,
      },
    };
  }, [jobs]);

  return (
    <div className="mx-auto flex max-w-[1400px] animate-v2-rise flex-col gap-6">
      <Hero counts={counts} courses={courses.length} onCreate={() => navigate("/v2/new")} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <ActiveWork jobs={active} loading={loading} />
          <RecentWork jobs={recent} loading={loading} onOpen={(j) => navigate(`/v2/jobs/${j._id}`)} />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <NeedsYou jobs={blocked} loading={loading} onOpen={(j) => navigate(`/v2/jobs/${j._id}`)} />
          <CourseSnapshot courses={courses} loading={coursesQuery.loading} />
        </div>
      </div>
    </div>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────────── */

function Hero({ counts, courses, onCreate }) {
  return (
    <Panel className="relative overflow-hidden">
      {/* A single soft accent wash. The only decorative gradient in the
          app - it marks the primary surface and is not repeated. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 size-[340px] rounded-full opacity-[0.16] blur-3xl"
        style={{ background: "radial-gradient(circle, var(--color-signal-400), transparent 68%)" }}
      />
      <div className="relative flex flex-wrap items-end justify-between gap-6 p-6">
        <div>
          <p className="label-xs mb-2">Workspace</p>
          <h2 className="display-lg text-[26px] text-hi">
            {counts.running > 0 ? (
              <>
                {counts.running} {counts.running === 1 ? "video" : "videos"} rendering
              </>
            ) : (
              "Nothing rendering"
            )}
          </h2>
          <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-mid">
            {counts.running > 0
              ? "Work in progress is tracked below and updates live."
              : "Start a new video, or pick up something waiting for your approval."}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button variant="solid" size="md" icon={<Wand2 className="size-4" />} onClick={onCreate}>
              Create video
            </Button>
            <Button variant="outline" size="md" icon={<Plus className="size-4" />}>
              New course
            </Button>
          </div>
        </div>

        <div className="flex gap-2.5">
          <Stat label="Videos" value={counts.total} icon={Film} />
          <Stat label="Completed" value={counts.done} icon={CheckCircle2} tone="var(--color-state-done)" />
          <Stat label="Failed" value={counts.failed} icon={AlertTriangle} tone="var(--color-state-fail)" />
          <Stat label="Courses" value={courses} icon={Clock} />
        </div>
      </div>
    </Panel>
  );
}

function Stat({ label, value, icon: Icon, tone }) {
  return (
    <div className="min-w-[104px] rounded-[var(--radius-v2-md)] border border-line-soft bg-surface-2 px-3.5 py-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className="size-3.5" style={{ color: tone || "var(--v2-text-3)" }} strokeWidth={2.2} />
        <span className="label-xs">{label}</span>
      </div>
      <p className="numeric display text-[22px] leading-none text-hi">{value}</p>
    </div>
  );
}

/* ── Active work ──────────────────────────────────────────────────────── */

function ActiveWork({ jobs, loading }) {
  return (
    <Panel>
      <PanelHead
        title="In progress"
        subtitle="Live pipeline state, updated as each stage completes"
        actions={
          jobs.length > 0 && (
            <span className="flex items-center gap-1.5 text-[12px] text-accent">
              <Radio className="size-3.5 animate-v2-pulse" />
              {jobs.length} active
            </span>
          )
        }
      />
      <div className="border-t border-line-soft">
        {loading ? (
          <div className="flex flex-col gap-4 p-5">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <Empty
            icon={<Film className="size-5" />}
            title="Nothing in progress"
            hint="Videos you generate will show their pipeline here while they run."
          />
        ) : (
          jobs.map((job) => <ActiveRow key={job._id} job={job} />)
        )}
      </div>
    </Panel>
  );
}

function ActiveRow({ job }) {
  const stage = stageOf(job.status);
  return (
    <div className="border-b border-line-soft px-5 py-4 last:border-0">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-medium text-hi">{job.topic || "Untitled video"}</p>
          <div className="mt-1 flex items-center gap-2">
            <Mono>{job._id}</Mono>
            <span className="text-lo">·</span>
            <span className="text-[12px] text-lo">{job.type || "video"}</span>
          </div>
        </div>
        <span className="numeric display shrink-0 text-[15px] text-hi">{job.progress ?? 0}%</span>
      </div>

      <Progress
        value={job.progress ?? null}
        tone={stage ? `var(--color-stage-${stage})` : "var(--v2-accent)"}
        className="mb-3.5"
      />

      <PipelineTrack stages={stagesFromJob(job)} />
    </div>
  );
}

/* ── Needs you ────────────────────────────────────────────────────────── */

function NeedsYou({ jobs, loading, onOpen }) {
  return (
    <Panel>
      <PanelHead title="Needs you" subtitle="Paused until you approve or retry" />
      <div className="border-t border-line-soft">
        {loading ? (
          <div className="flex flex-col gap-3 p-5">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : jobs.length === 0 ? (
          <Empty
            icon={<CheckCircle2 className="size-5" />}
            title="All clear"
            hint="Nothing is waiting on a decision from you."
          />
        ) : (
          jobs.map((job) => (
            <button
              key={job._id}
              type="button"
              onClick={() => onOpen(job)}
              className="interactive flex w-full flex-col gap-2 border-b border-line-soft px-5 py-3.5 text-left last:border-0"
            >
              <div className="flex w-full items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-hi">{job.topic || "Untitled"}</p>
                  <p className="mt-0.5 text-[11.5px] text-lo">{timeAgo(job.updatedAt || job.createdAt)}</p>
                </div>
                <StatusPill status={job.status} />
                <ArrowUpRight className="size-3.5 shrink-0 text-lo" />
              </div>
              {/* Where it is stuck matters as much as that it is stuck - the
                  compact track shows which gate it is waiting at without
                  costing a row of height. */}
              <PipelineTrack stages={stagesFromJob(job)} size="sm" />
            </button>
          ))
        )}
      </div>
    </Panel>
  );
}

/* ── Recent ───────────────────────────────────────────────────────────── */

function RecentWork({ jobs, loading, onOpen }) {
  return (
    <Panel>
      <PanelHead
        title="Recently finished"
        actions={<Button variant="ghost" size="sm" iconRight={<ArrowUpRight className="size-3.5" />}>View all</Button>}
      />
      <div className="border-t border-line-soft">
        {loading ? (
          <div className="grid grid-cols-2 gap-3 p-5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <Empty icon={<Clock className="size-5" />} title="No finished videos yet" />
        ) : (
          <div className="grid grid-cols-1 gap-px bg-[var(--v2-line-soft)] sm:grid-cols-2">
            {jobs.map((job) => {
              const failed = stateOf(job.status) === STATE.FAIL;
              return (
                <button
                  key={job._id}
                  type="button"
                  onClick={() => onOpen(job)}
                  className="interactive flex items-center gap-3 bg-surface-1 px-5 py-3.5 text-left"
                >
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-v2-sm)]"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${
                        failed ? "var(--color-state-fail)" : "var(--color-state-done)"
                      } 14%, transparent)`,
                      color: failed ? "var(--color-state-fail)" : "var(--color-state-done)",
                    }}
                  >
                    {failed ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-hi">{job.topic || "Untitled"}</p>
                    <p className="mt-0.5 text-[11.5px] text-lo">{timeAgo(job.updatedAt || job.createdAt)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ── Courses ──────────────────────────────────────────────────────────── */

function CourseSnapshot({ courses, loading }) {
  return (
    <Panel>
      <PanelHead title="Courses" subtitle="Lesson completion across your courses" />
      <div className="border-t border-line-soft p-5">
        {loading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : courses.length === 0 ? (
          <Empty icon={<Film className="size-5" />} title="No courses yet" className="py-6" />
        ) : (
          <div className="flex flex-col gap-4">
            {courses.slice(0, 4).map((course) => {
              const total = course.totalVideos ?? course.videoCount ?? 0;
              const done = course.completedVideos ?? 0;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <div key={course._id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <p className="truncate text-[13px] font-medium text-hi">{course.title}</p>
                    <span className="numeric shrink-0 text-[11.5px] text-lo">
                      {done}/{total}
                    </span>
                  </div>
                  <Progress value={pct} tone="var(--color-stage-publish)" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
}
