import { installExclusiveAudio } from "../../lib/exclusiveAudio";
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, RefreshCw, Square, Redo2, Download, AlertTriangle, Play,
  Mic2, Clock, Monitor, Palette, UserSquare2, Sparkles, ChevronRight,
} from "lucide-react";
import {
  Panel, PanelHead, Button, StatusPill, Progress, Skeleton, Empty, Mono, Divider,
} from "../ui/primitives";
import { Segmented } from "../ui/controls";
import { PipelineTrack } from "../ui/Pipeline";
import { stagesFromJob } from "../lib/pipelineStages";
import { STATE, stateOf, isTerminal } from "../lib/status";
import { useJobLive } from "../lib/useJobLive";
import { cx } from "../ui/cx";
import { useApiQuery, useInvalidate } from "../../lib/useApiQuery";
import { queryKeys } from "../../lib/queryClient";
import {
  getVideoJob, restartVideoJob, stopVideoJob, rerenderVideoJob,
  generateVideoAudio, generateVideoRender, approveVideoJob,
  resolveSceneAudioUrl, resolveMediaUrl,
} from "../../services/api";
import { timeAgo } from "../../lib/timeAgo";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";

/**
 * Job detail: one video, its pipeline, and everything you can do to it.
 *
 * Organised around the question the user actually arrives with - "where is
 * this and what do I do next" - so the pipeline and the single most
 * relevant action sit at the top, before any metadata.
 */
installExclusiveAudio();

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);
  const [tab, setTab] = useState("scenes");

  const socketStatus = useJobLive(id);

  const { data: job, loading, error, refetch } = useApiQuery(
    queryKeys.videos.detail(id),
    () => getVideoJob(id),
    { select: (data) => data.job, errorMessage: "Could not load this job" }
  );

  const invalidate = useInvalidate();

  const act = async (key, label, fn, confirm) => {
    if (confirm && !(await confirmDialog(confirm))) return;
    setBusy(key);
    try {
      await fn();
      toast.success(label);
      invalidate(queryKeys.videos.detail(id), queryKeys.jobs.all, queryKeys.videos.all);
    } catch (err) {
      toast.error(err.friendlyMessage || `${label} failed`);
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <DetailSkeleton />;

  if (error || !job) {
    return (
      <div className="mx-auto max-w-[1400px]">
        <Panel>
          <Empty
            icon={<AlertTriangle className="size-5" />}
            title="Couldn't load this job"
            hint={error?.friendlyMessage || "It may have been deleted."}
            action={
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
                <Button variant="solid" size="sm" onClick={() => navigate("/v2/jobs")}>Back to jobs</Button>
              </div>
            }
          />
        </Panel>
      </div>
    );
  }

  const state = stateOf(job.status);
  const scenes = job.script?.scenes || [];
  const done = isTerminal(job.status);

  return (
    <div className="mx-auto flex max-w-[1400px] animate-v2-rise flex-col gap-5">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => navigate("/v2/jobs")}
          className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] text-lo transition-colors hover:text-hi"
        >
          <ArrowLeft className="size-3.5" /> Jobs
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="display-lg truncate text-[22px] text-hi">{job.topic || "Untitled video"}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <StatusPill status={job.status} />
              <Mono>{job._id}</Mono>
              <span className="text-[12px] text-lo">· updated {timeAgo(job.updatedAt)}</span>
              {socketStatus !== "connected" && (
                <span className="text-[12px] text-[var(--color-state-wait)]">· offline</span>
              )}
            </div>
          </div>

          <Actions job={job} busy={busy} act={act} navigate={navigate} />
        </div>
      </div>

      {/* ── Pipeline ───────────────────────────────────────────────────── */}
      <Panel className="p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <span className="label-xs">Pipeline</span>
          {!done && <span className="numeric display text-[15px] text-hi">{job.progress ?? 0}%</span>}
        </div>
        <PipelineTrack stages={stagesFromJob(job)} />
        {!done && (
          <Progress
            value={job.progress ?? null}
            className="mt-4"
            tone={state === STATE.WAIT ? "var(--color-state-wait)" : "var(--v2-accent)"}
          />
        )}
      </Panel>

      {job.error?.message && <ErrorPanel job={job} />}

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          {job.videoUrl && <VideoPanel job={job} />}

          <Panel>
            <PanelHead
              title="Content"
              actions={
                <Segmented
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: "scenes", label: "Scenes", count: scenes.length },
                    { value: "script", label: "Script" },
                  ]}
                />
              }
            />
            <div className="border-t border-line-soft">
              {scenes.length === 0 ? (
                <Empty
                  icon={<Sparkles className="size-5" />}
                  title="No script yet"
                  hint="Scenes appear here once the script stage completes."
                />
              ) : tab === "scenes" ? (
                scenes.map((scene) => <SceneRow key={scene.sceneNumber} scene={scene} jobId={job._id} />)
              ) : (
                <ScriptText scenes={scenes} />
              )}
            </div>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <SpecPanel job={job} />
        </div>
      </div>
    </div>
  );
}

/* ── Actions ──────────────────────────────────────────────────────────── */

/**
 * Which actions exist depends on where the job is. Rather than showing
 * every button greyed out, only the ones that apply are rendered - the
 * primary next step is `solid`, everything else is secondary.
 */
function Actions({ job, busy, act, navigate }) {
  const state = stateOf(job.status);
  const status = String(job.status || "").toUpperCase();
  const manual = job.fastGeneration === false;

  const buttons = [];

  if (status === "AWAITING_APPROVAL") {
    buttons.push(
      <Button key="approve" variant="solid" size="md" loading={busy === "approve"}
        icon={<Play className="size-4" />}
        onClick={() => act("approve", "Script approved", () => approveVideoJob(job._id))}>
        Approve script
      </Button>
    );
  }

  if (manual && status === "SCRIPT_COMPLETED") {
    buttons.push(
      <Button key="audio" variant="solid" size="md" loading={busy === "audio"}
        icon={<Mic2 className="size-4" />}
        onClick={() => act("audio", "Audio generation started", () => generateVideoAudio(job._id))}>
        Generate audio
      </Button>
    );
  }

  if (status === "AUDIO_COMPLETED") {
    buttons.push(
      <Button key="render" variant="solid" size="md" loading={busy === "render"}
        icon={<Play className="size-4" />}
        onClick={() => act("render", "Render started", () => generateVideoRender(job._id))}>
        Render video
      </Button>
    );
  }

  if (state === STATE.RUN || state === STATE.WAIT) {
    buttons.push(
      <Button key="stop" variant="outline" size="md" loading={busy === "stop"}
        icon={<Square className="size-4" />}
        onClick={() =>
          act("stop", "Job stopped", () => stopVideoJob(job._id), {
            title: "Stop this job?",
            content: "It will stop as soon as the current step checks in.",
            confirmText: "Stop", danger: true,
          })
        }>
        Stop
      </Button>
    );
  }

  // RETRY_SCHEDULED is a waiting state, but the wait is on a backoff timer,
  // not on the user - so offer to run it now rather than making them watch
  // a countdown they cannot influence.
  if (state === STATE.FAIL || status === "RETRY_SCHEDULED") {
    buttons.push(
      <Button key="restart" variant="solid" size="md" loading={busy === "restart"}
        icon={<Redo2 className="size-4" />}
        onClick={() => act("restart", "Job restarted", () => restartVideoJob(job._id))}>
        {status === "RETRY_SCHEDULED" ? "Retry now" : "Retry"}
      </Button>
    );
  }

  if (job.videoUrl) {
    buttons.push(
      <Button key="rerender" variant="outline" size="md" loading={busy === "rerender"}
        icon={<RefreshCw className="size-4" />}
        onClick={() =>
          act("rerender", "Re-render started", () => rerenderVideoJob(job._id), {
            title: "Re-render this video?",
            content: "The existing render will be replaced.",
            confirmText: "Re-render",
          })
        }>
        Re-render
      </Button>
    );
  }

  // Studio is where scenes get edited; it is a destination, not an action,
  // so it stays visually quiet.
  buttons.push(
    <Button key="studio" variant="ghost" size="md" iconRight={<ChevronRight className="size-4" />}
      onClick={() => navigate(`/v2/studio?id=${job._id}`)}>
      Open in studio
    </Button>
  );

  return <div className="flex flex-wrap items-center gap-2">{buttons}</div>;
}

/* ── Error ────────────────────────────────────────────────────────────── */

function ErrorPanel({ job }) {
  const { message, detail, step, retryCount } = job.error;
  return (
    <div
      className="flex gap-3 rounded-[var(--radius-v2-lg)] border p-4"
      style={{
        borderColor: "color-mix(in srgb, var(--color-state-fail) 32%, transparent)",
        backgroundColor: "color-mix(in srgb, var(--color-state-fail) 8%, transparent)",
      }}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: "var(--color-state-fail)" }} />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-hi">{message}</p>
        {/* The raw cause stays available but subordinate - it is for
            debugging, not for the person deciding what to do next. */}
        {detail && detail !== message && (
          <p className="numeric mt-1.5 font-[family-name:var(--font-v2-mono)] text-[11.5px] break-words text-lo">
            {detail}
          </p>
        )}
        <p className="mt-2 text-[12px] text-lo">
          Failed at {step || "an unknown step"}
          {retryCount ? ` · attempt ${retryCount} of ${job.maxRetries ?? 3}` : ""}
          {job.nextRetryAt && ` · retrying ${timeAgo(job.nextRetryAt)}`}
        </p>
      </div>
    </div>
  );
}

/* ── Video ────────────────────────────────────────────────────────────── */

function VideoPanel({ job }) {
  return (
    <Panel className="overflow-hidden">
      <video
        controls
        poster={job.thumbnailUrl ? resolveMediaUrl(job.thumbnailUrl) : undefined}
        src={resolveMediaUrl(job.videoUrl)}
        className="aspect-video w-full bg-black"
      />
      <div className="flex items-center justify-between px-5 py-3">
        <span className="text-[12.5px] text-lo">Final render</span>
        <a href={resolveMediaUrl(job.videoUrl)} download>
          <Button variant="outline" size="sm" icon={<Download className="size-3.5" />}>Download</Button>
        </a>
      </div>
    </Panel>
  );
}

/* ── Scenes ───────────────────────────────────────────────────────────── */

function SceneRow({ scene, jobId }) {
  const hasAudio = Boolean(scene.audio?.file);
  return (
    <div className="flex gap-3.5 border-b border-line-soft px-5 py-4 last:border-0">
      <span className="numeric mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-v2-sm)] bg-[var(--v2-hover)] text-[11.5px] font-semibold text-mid">
        {scene.sceneNumber}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[13.5px] font-medium text-hi">{scene.title || `Scene ${scene.sceneNumber}`}</p>
          <span className="rounded-full border border-line px-1.5 py-0.5 text-[10.5px] text-lo">
            {scene.sceneType}
          </span>
          {scene.audio?.duration > 0 && (
            <span className="numeric text-[11.5px] text-lo">{scene.audio.duration.toFixed(1)}s</span>
          )}
        </div>

        {scene.audio?.text && (
          <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-mid">{scene.audio.text}</p>
        )}

        {hasAudio ? (
          // Native audio element: the browser's own transport is better than
          // anything hand-rolled here, and this is a review surface, not an
          // editor.
          <audio
            controls
            data-exclusive-audio
            preload="none"
            src={resolveSceneAudioUrl(jobId, scene.audio.file)}
            className="mt-2.5 h-8 w-full max-w-md"
          />
        ) : (
          <p className="mt-2 text-[11.5px] text-lo">Audio not generated yet</p>
        )}
      </div>
    </div>
  );
}

function ScriptText({ scenes }) {
  return (
    <div className="flex flex-col gap-4 p-5">
      {scenes.map((scene) => (
        <div key={scene.sceneNumber}>
          <p className="label-xs mb-1">
            {scene.sceneNumber}. {scene.title || scene.sceneType}
            {scene.audio?.voice ? ` — ${scene.audio.voice}` : ""}
          </p>
          <p className="text-[13px] leading-relaxed text-mid">{scene.audio?.text || "—"}</p>
        </div>
      ))}
    </div>
  );
}

/* ── Spec ─────────────────────────────────────────────────────────────── */

function SpecPanel({ job }) {
  const rows = [
    { icon: Sparkles, label: "Type", value: job.type },
    { icon: Monitor, label: "Resolution", value: job.resolution },
    { icon: Clock, label: "Duration", value: job.duration ? `${job.duration}s` : "—" },
    { icon: Mic2, label: "Voice", value: prettyVoice(job.voice) },
    { icon: Palette, label: "Quality", value: job.quality || "standard" },
    { icon: UserSquare2, label: "Avatar", value: job.avatarEnabled ? job.avatarPosition || "on" : "off" },
  ];

  return (
    <Panel>
      <PanelHead title="Specification" />
      <Divider />
      <div className="flex flex-col">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 px-5 py-2.5">
            <Icon className="size-3.5 shrink-0 text-lo" />
            <span className="flex-1 text-[12.5px] text-mid">{label}</span>
            <span className={cx("truncate text-[12.5px] text-hi", !value && "text-lo")}>{value || "—"}</span>
          </div>
        ))}
      </div>
      <Divider />
      <div className="flex items-center justify-between px-5 py-3">
        <span className="text-[12px] text-lo">Created</span>
        <span className="text-[12px] text-mid">{timeAgo(job.createdAt)}</span>
      </div>
    </Panel>
  );
}

/** Voice ids arrive as "clone:alex-intelligent-friendly-confident.mp3". */
function prettyVoice(voice) {
  if (!voice) return "—";
  return String(voice)
    .replace(/^clone:/, "")
    .replace(/\.(mp3|wav)$/i, "")
    .replace(/[-_]/g, " ");
}

/* ── Skeleton ─────────────────────────────────────────────────────────── */

function DetailSkeleton() {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-28 w-full" />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
