import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  XCircle,
  CircleSlash,
  Clock,
  FileText,
  AudioLines,
  Video,
  CloudUpload,
  Zap,
  Redo2,
  Square,
  PlayCircle,
  Download,
  Pencil,
  Copy,
  RotateCw,
} from "lucide-react";
import {
  getVideoJob,
  restartVideoJob,
  regenerateVideoJobScript,
  rerenderVideoJob,
  stopVideoJob,
  regenerateVideoSceneAudio,
  resolveMediaUrl,
  getVideoJobActivityLogs,
} from "../../services/api";
import {
  connect,
  joinJobRoom,
  leaveJobRoom,
  onJobProgress,
  onJobCompleted,
  onJobFailed,
  onSceneAudioReady,
  onConnect,
  onDisconnect,
  requestJobStatus,
  onJobStatus,
  isConnected,
} from "../../services/socket";
import { LoadingState, ErrorState } from "../../components";
import RenderQueue from "./RenderQueue";
import { Card, CardHeader } from "../../components/ui/Card";
import { Timeline } from "../../components/ui/Timeline";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Steps } from "../../components/ui/Steps";
import { DescriptionList } from "../../components/ui/DescriptionList";
import { CircularProgress } from "../../components/ui/CircularProgress";
import { AudioPlayer } from "../../components/ui/AudioPlayer";
import { Tooltip } from "../../components/ui/Tooltip";
import { Spinner } from "../../components/ui/Spinner";
import { isPortraitResolution } from "../../shared/resolution";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";

const PIPELINE_STEPS = [
  { title: "Queued", status: "QUEUED", icon: Clock },
  { title: "Script", status: "SCRIPT_GENERATION", icon: FileText },
  { title: "Approval", status: "AWAITING_APPROVAL", icon: Pencil },
  { title: "Audio", status: "GENERATING_AUDIO", icon: AudioLines },
  { title: "Images", status: "GENERATING_IMAGES", icon: FileText },
  { title: "Assets", status: "PREPARING_ASSETS", icon: Zap },
  { title: "Render", status: "RENDERING", icon: Video },
  { title: "Upload", status: "UPLOADING", icon: CloudUpload },
  { title: "Complete", status: "COMPLETED", icon: CheckCircle2 },
];

const STEP_ORDER = PIPELINE_STEPS.map((s) => s.status);

const RenderPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const jobId = searchParams.get("id");

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [restartLoading, setRestartLoading] = useState(false);
  const [regenerateScriptLoading, setRegenerateScriptLoading] = useState(false);
  const [rerenderLoading, setRerenderLoading] = useState(false);
  const [stopLoading, setStopLoading] = useState(false);
  const [socketStatus, setSocketStatus] = useState(() => (isConnected() ? "connected" : "disconnected"));
  const [copied, setCopied] = useState(false);
  const [activityLog, setActivityLog] = useState([]);

  const unsubscribesRef = useRef([]);
  const videoRef = useRef(null);

  const formatActivityTime = useCallback((timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).toLowerCase();

    const diffDays = Math.round((today - target) / 86400000);

    let label;
    if (diffDays === 0) {
      label = "today";
    } else if (diffDays === 1) {
      label = "yesterday";
    } else if (diffDays > 1 && target >= startOfWeek) {
      label = date.toLocaleDateString("en-US", { weekday: "long" });
    } else if (diffDays <= 7) {
      label = date.toLocaleDateString("en-US", { weekday: "long" });
    } else if (diffDays <= 14) {
      label = "last week";
    } else if (diffDays <= 60) {
      label = "last month";
    } else {
      label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }

    return `${label} ${timeStr}`;
  }, []);

  const fetchActivityLogs = useCallback(async (currentJobId) => {
    if (!currentJobId) return;
    try {
      const res = await getVideoJobActivityLogs(currentJobId);
      setActivityLog(
        (res.data.logs || []).map((log) => ({
          text: log.text,
          time: formatActivityTime(log.timestamp),
        }))
      );
    } catch {
      // Ignore errors fetching logs
    }
  }, [formatActivityTime]);

  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    try {
      setLoading(true);
      const res = await getVideoJob(jobId);
      setJob(res.data.job);
      setError(null);
    } catch (err) {
      setError(err.friendlyMessage || "Failed to fetch job");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  const handleRestart = async (isStuckActive) => {
    if (!jobId) return;
    if (isStuckActive) {
      const ok = await confirmDialog({
        title: "Regenerate stuck job?",
        content:
          "Only do this if the job has stopped making progress (e.g. no change for several minutes). Retriggering a job that's actually still processing can cause conflicting writes to the same files.",
        confirmText: "Regenerate",
        danger: true,
      });
      if (!ok) return;
    }
    try {
      setRestartLoading(true);
      await restartVideoJob(jobId);
      toast.success("Job restarted successfully");
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to restart job");
    } finally {
      setRestartLoading(false);
    }
  };

  const handleStop = async () => {
    if (!jobId) return;
    const ok = await confirmDialog({
      title: "Stop this job?",
      content:
        "This will be marked cancelled. If it's still queued this stops it immediately; if it's actively processing, it stops as soon as the current step finishes checking in (may take a moment).",
      confirmText: "Stop Job",
      danger: true,
    });
    if (!ok) return;
    try {
      setStopLoading(true);
      await stopVideoJob(jobId);
      toast.success("Job stopped");
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to stop job");
    } finally {
      setStopLoading(false);
    }
  };

  const [regeneratingScene, setRegeneratingScene] = useState(null);
  const handleRegenerateScene = async (sceneNumber) => {
    if (!jobId) return;
    setRegeneratingScene(sceneNumber);
    try {
      const res = await regenerateVideoSceneAudio(jobId, sceneNumber);
      setJob((prev) => {
        if (!prev?.script?.scenes) return prev;
        const scenes = prev.script.scenes.map((scene) =>
          scene.sceneNumber === sceneNumber
            ? { ...scene, audio: { ...scene.audio, ...res.data.audio } }
            : scene
        );
        return { ...prev, script: { ...prev.script, scenes } };
      });
      toast.success(`Scene ${sceneNumber} audio regenerated`);
    } catch (err) {
      toast.error(err.friendlyMessage || `Failed to regenerate scene ${sceneNumber}`);
    } finally {
      setRegeneratingScene(null);
    }
  };

  const handleRegenerateScript = async () => {
    if (!jobId) return;
    const ok = await confirmDialog({
      title: "Regenerate script?",
      content:
        "This throws away the current script and any generated audio/render output, then re-generates the script from scratch. This can't be undone.",
      confirmText: "Regenerate Script",
      danger: true,
    });
    if (!ok) return;
    try {
      setRegenerateScriptLoading(true);
      await regenerateVideoJobScript(jobId);
      toast.success("Script regeneration started");
      navigate(`/render?id=${jobId}`);
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to regenerate script");
    } finally {
      setRegenerateScriptLoading(false);
    }
  };

  const handleRerender = async () => {
    if (!jobId) return;
    try {
      setRerenderLoading(true);
      await rerenderVideoJob(jobId);
      toast.success("Re-render started successfully");
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to re-render job");
    } finally {
      setRerenderLoading(false);
    }
  };

  const cleanup = useCallback(() => {
    unsubscribesRef.current.forEach((unsubscribe) => unsubscribe && unsubscribe());
    unsubscribesRef.current = [];
  }, []);

  const setupListeners = useCallback(
    (currentJobId) => {
      cleanup();

      unsubscribesRef.current.push(
        onJobProgress((data) => {
          if (data.jobId === currentJobId) {
            setJob((prev) =>
              prev ? { ...prev, progress: data.progress, status: data.status, currentStep: data.currentStep, currentScene: data.currentScene } : prev
            );
            fetchActivityLogs(currentJobId);
          }
        })
      );

      unsubscribesRef.current.push(
        onJobCompleted((data) => {
          if (data.jobId === currentJobId) {
            setJob((prev) => (prev ? { ...prev, progress: 100, status: "COMPLETED", videoUrl: data.videoUrl, thumbnailUrl: data.thumbnailUrl } : prev));
            fetchActivityLogs(currentJobId);
            toast.success("Video generation completed!");
          }
        })
      );

      unsubscribesRef.current.push(
        onJobFailed((data) => {
          if (data.jobId === currentJobId) {
            setJob((prev) => (prev ? { ...prev, status: "FAILED", error: data.error } : prev));
            fetchActivityLogs(currentJobId);
            toast.error("Video generation failed");
          }
        })
      );

      unsubscribesRef.current.push(
        onSceneAudioReady((data) => {
          if (data.jobId === currentJobId) {
            setJob((prev) => {
              if (!prev?.script?.scenes) return prev;
              const scenes = prev.script.scenes.map((scene) =>
                scene.sceneNumber === data.sceneNumber
                  ? { ...scene, audio: { ...scene.audio, ...data.audio } }
                  : scene
              );
              return { ...prev, script: { ...prev.script, scenes } };
            });
          }
        })
      );

      unsubscribesRef.current.push(
        onJobStatus((data) => {
          if (data.jobId === currentJobId) {
            setJob((prev) => ({
              ...(prev || {}),
              progress: data.progress,
              status: data.status,
              currentStep: data.currentStep,
              currentScene: data.currentScene,
              videoUrl: data.videoUrl || prev?.videoUrl,
              thumbnailUrl: data.thumbnailUrl || prev?.thumbnailUrl,
            }));
          }
        })
      );

      unsubscribesRef.current.push(
        onConnect(() => {
          setSocketStatus("connected");
          if (jobId) {
            joinJobRoom(jobId);
            requestJobStatus(jobId);
          }
        })
      );

      unsubscribesRef.current.push(
        onDisconnect((reason) => {
          setSocketStatus(reason === "io client disconnect" ? "disconnected" : "reconnecting");
        })
      );
    },
    [cleanup, jobId, fetchActivityLogs]
  );

  useEffect(() => {
    if (!jobId) {
      setLoading(false);
      return undefined;
    }

    fetchJob();
    fetchActivityLogs(jobId);
    connect();
    setupListeners(jobId);
    joinJobRoom(jobId);
    setSocketStatus(isConnected() ? "connected" : "disconnected");

    return () => {
      leaveJobRoom(jobId);
    };
  }, [jobId, fetchJob, fetchActivityLogs, setupListeners]);

  if (!jobId) return <RenderQueue />;

  if (loading) return <LoadingState label="Loading job details..." />;

  if (error && !job) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <ErrorState message="Error" description={error} />
        <Button className="mt-4" onClick={() => navigate("/")}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const currentStepIndex = STEP_ORDER.indexOf(job?.status);
  const isComplete = job?.status === "COMPLETED";
  const isFailed = job?.status === "FAILED";
  const isCancelled = job?.status === "CANCELLED";
  const isActive = !isComplete && !isFailed && !isCancelled;
  const hasScript = job?.script?.scenes?.length > 0;
  const showReviewScript = job?.status === "AWAITING_APPROVAL";
  const showGenerateAudio = job?.fastGeneration === false && job?.status === "SCRIPT_COMPLETED";
  const showGenerateRender = job?.fastGeneration === false && job?.status === "AUDIO_COMPLETED";
  // Every other active state (queued behind script, generating audio/images,
  // preparing assets, rendering, uploading) currently has no way to jump into
  // the Studio - fall back to a plain "Studio" button once a script exists.
  const showGenericStudio = hasScript && isActive && !showReviewScript && !showGenerateAudio && !showGenerateRender;
  // A job stuck in an active state (e.g. UPLOADING forever) has no FAILED
  // status to trigger the restart button - offer manual regeneration for any
  // active, non-queued job so it isn't stuck with no recourse.
  const canRegenerateStuck = isActive && job?.status !== "QUEUED";
  // A cancelled job can still be restarted (backend only blocks COMPLETED).
  const canRestartCancelled = isCancelled;
  // Stoppable at any point before it's actually finished, including QUEUED
  // (removes it from the queue before it ever starts).
  const canStop = isActive;

  const copyJobId = async () => {
    await navigator.clipboard.writeText(job?._id || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const details = [
    {
      label: "Job ID",
      value: (
        <button onClick={copyJobId} className="flex items-center gap-1.5 font-mono text-xs hover:text-accent">
          {job?._id}
          <Copy className="size-3" />
          {copied && <span className="text-[11px] text-accent">Copied</span>}
        </button>
      ),
    },
    { label: "Type", value: <Badge>{job?.type}</Badge> },
    { label: "Resolution", value: job?.resolution || "—" },
    { label: "Language", value: job?.language || "—" },
    { label: "Voice", value: job?.voice || "—" },
    { label: "Created", value: job?.createdAt ? new Date(job.createdAt).toLocaleString() : "—" },
  ];

  const socketDotCls = { connected: "bg-success-500", reconnecting: "bg-warning-500", disconnected: "bg-text-tertiary" };
  const socketLabel = { connected: "Live", reconnecting: "Reconnecting...", disconnected: "Offline" };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button variant="secondary" icon={<ArrowLeft className="size-4" />} onClick={() => navigate("/")}>
          Back
        </Button>
        <Button variant="secondary" icon={<RefreshCw className="size-4" />} loading={loading} onClick={fetchJob}>
          Refresh
        </Button>
        {(isFailed || canRestartCancelled) && (
          <Button variant="danger" icon={<Redo2 className="size-4" />} loading={restartLoading} onClick={() => handleRestart(false)}>
            Restart Job
          </Button>
        )}
        {canRegenerateStuck && (
          <Button variant="secondary" icon={<Redo2 className="size-4" />} loading={restartLoading} onClick={() => handleRestart(true)}>
            Regenerate
          </Button>
        )}
        {canStop && (
          <Button variant="danger" icon={<Square className="size-4" />} loading={stopLoading} onClick={handleStop}>
            Stop
          </Button>
        )}
        {hasScript && !isActive && !isCancelled && (
          <Button variant="secondary" icon={<RotateCw className="size-4" />} loading={regenerateScriptLoading} onClick={handleRegenerateScript}>
            Regenerate Script
          </Button>
        )}
        {showReviewScript && (
          <Button variant="primary" icon={<Pencil className="size-4" />} onClick={() => navigate(`/studio?id=${jobId}`)}>
            Review Script
          </Button>
        )}
        {showGenerateAudio && (
          <Button variant="primary" icon={<AudioLines className="size-4" />} onClick={() => navigate(`/studio?id=${jobId}`)}>
            Generate Audio
          </Button>
        )}
        {showGenerateRender && (
          <Button variant="primary" icon={<Video className="size-4" />} onClick={() => navigate(`/studio?id=${jobId}`)}>
            Generate Render
          </Button>
        )}
        {showGenericStudio && (
          <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => navigate(`/studio?id=${jobId}`)}>
            Studio
          </Button>
        )}
        {isComplete && (
          <>
            <Button variant="primary" icon={<Pencil className="size-4" />} onClick={() => navigate(`/studio?id=${jobId}`)}>
              Studio Editor
            </Button>
            <Button variant="primary" icon={<Redo2 className="size-4" />} loading={rerenderLoading} onClick={handleRerender}>
              Re-render
            </Button>
          </>
        )}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">{job?.topic || "Render Progress"}</h1>
        <span className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-text-secondary">
          <span className={`size-2 rounded-full ${socketDotCls[socketStatus]}`} />
          {socketLabel[socketStatus]}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Left Column - primary progress + output */}
        <div className="flex flex-col gap-4">
          {/* Progress + Pipeline */}
          <Card className="animate-slide-up p-6">
            <div className="flex flex-col items-center gap-3 border-b border-border-light pb-6 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="flex items-center gap-4">
                <CircularProgress percent={job?.progress || 0} error={isFailed} />
                <div>
                  <Badge
                    variant={isComplete ? "success" : isFailed ? "danger" : isCancelled ? "neutral" : "accent"}
                    icon={
                      isComplete ? <CheckCircle2 className="size-3" /> :
                      isFailed ? <XCircle className="size-3" /> :
                      isCancelled ? <CircleSlash className="size-3" /> :
                      <RefreshCw className="size-3 animate-spin" />
                    }
                  >
                    {job?.status?.replace(/_/g, " ")}
                  </Badge>
                  {isActive && job?.currentScene ? (
                    <p className="mt-1.5 text-xs text-text-tertiary">Scene {job.currentScene}</p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="pt-6">
              <Steps
                items={PIPELINE_STEPS}
                current={currentStepIndex >= 0 ? currentStepIndex : 0}
                status={isFailed || isCancelled ? "error" : isComplete ? "finish" : "process"}
              />

              {isFailed && job?.error && (
                <Alert type="error" className="mt-5">
                  {typeof job.error === "string" ? job.error : job.error?.message || "An error occurred"}
                </Alert>
              )}

              {isCancelled && (
                <Alert type="info" className="mt-5">
                  Stopped before reaching {job?.error?.step?.replace(/_/g, " ") || "completion"}. Use Restart Job to pick back up from here.
                </Alert>
              )}

              {isComplete && (
                <Alert type="success" title="Video generation completed successfully!" className="mt-5 animate-scale-in" />
              )}
            </div>
          </Card>

          {/* Per-Scene Audio Progress */}
          {job?.script?.scenes?.length > 0 && (() => {
            const scenes = job.script.scenes;
            const readyScenes = scenes.filter((s) => s.audio?.file);
            return (
              <Card className="animate-slide-up p-6" style={{ "--stagger-index": 1 }}>
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
                    <AudioLines className="size-[18px] text-accent" /> Scene Audio
                  </h3>
                  <span className="text-xs font-medium text-text-tertiary">{readyScenes.length}/{scenes.length} ready</span>
                </div>

                <div className="mb-4 flex flex-wrap gap-1.5">
                  {scenes.map((scene) => {
                    const ready = Boolean(scene.audio?.file);
                    const isCurrent = isActive && job?.currentScene === scene.sceneNumber;
                    return (
                      <span
                        key={scene.sceneNumber}
                        title={`Scene ${scene.sceneNumber}${ready ? " — ready" : isCurrent ? " — generating" : " — pending"}`}
                        className={`flex size-7 items-center justify-center rounded-md border text-[11px] font-medium ${
                          ready
                            ? "border-success-500/30 bg-success-500/10 text-success-600"
                            : isCurrent
                            ? "animate-pulse border-accent bg-accent/10 text-accent"
                            : "border-border text-text-tertiary"
                        }`}
                      >
                        {scene.sceneNumber}
                      </span>
                    );
                  })}
                </div>

                {readyScenes.length > 0 ? (
                  <div className="flex flex-col gap-2 border-t border-border-light pt-4">
                    {readyScenes.map((scene) => {
                      const audioFile = scene.audio.file;
                      const sceneAudioUrl = /^https?:\/\//i.test(audioFile)
                        ? audioFile
                        : resolveMediaUrl(`/public/${job._id}/audio/${audioFile}`);
                      const isRegenerating = regeneratingScene === scene.sceneNumber;
                      return (
                        <div key={scene.sceneNumber} className="flex items-center gap-3">
                          <span className="w-16 shrink-0 text-[13px] font-medium text-text-secondary">Scene {scene.sceneNumber}</span>
                          {isRegenerating ? (
                            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-dashed border-border-light px-3 py-2 text-xs text-text-tertiary">
                              <Spinner size="sm" />
                              Regenerating this scene's audio...
                            </div>
                          ) : (
                            <AudioPlayer src={sceneAudioUrl} className="min-w-0 flex-1" />
                          )}
                          {!isActive && (
                            <Tooltip content="Regenerate just this scene's audio">
                              <Button
                                variant="ghost"
                                size="sm"
                                iconOnly
                                aria-label={`Regenerate scene ${scene.sceneNumber} audio`}
                                icon={<RotateCw className={`size-3.5 ${isRegenerating ? "animate-spin" : ""}`} />}
                                disabled={isRegenerating}
                                onClick={() => handleRegenerateScene(scene.sceneNumber)}
                              />
                            </Tooltip>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="border-t border-border-light pt-4 text-[13px] text-text-tertiary">Audio will appear here as scenes finish generating.</p>
                )}
              </Card>
            );
          })()}

          {/* Video / Player section */}
          {isComplete && job?.videoUrl && (
            <Card className="animate-slide-up p-6" style={{ "--stagger-index": 2 }}>
              <h3 className="mb-5 flex items-center gap-2 text-[15px] font-semibold text-text-primary">
                <PlayCircle className="size-[18px] text-accent" /> Output Video
              </h3>

              <div className="mx-auto max-w-2xl overflow-hidden rounded-xl bg-black shadow-lg">
                <video
                  ref={videoRef}
                  src={job.videoUrl}
                  controls
                  autoPlay
                  poster={job.thumbnailUrl || undefined}
                  className="block w-full object-contain"
                  style={{ aspectRatio: isPortraitResolution(job?.resolution) ? "9/16" : "16/9" }}
                >
                  Your browser does not support the video tag.
                </video>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4 text-[13px] text-text-secondary">
                  {job.resolution && (
                    <span>
                      Resolution: <span className="font-semibold text-text-primary">{job.resolution}</span>
                    </span>
                  )}
                  {job.duration && (
                    <span>
                      Duration: <span className="font-semibold text-text-primary">{job.duration}s</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button href={job.videoUrl} target="_blank" rel="noopener noreferrer" variant="primary" icon={<PlayCircle className="size-4" />}>
                    Open in new tab
                  </Button>
                  <Button href={job.videoUrl} target="_blank" rel="noopener noreferrer" download variant="secondary" icon={<Download className="size-4" />}>
                    Download
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Right Column - details + activity log */}
        <div className="flex flex-col gap-4">
          <Card className="h-fit animate-slide-up" style={{ "--stagger-index": 0.5 }}>
            <CardHeader title="Details" />
            <div className="p-5">
              <DescriptionList items={details} columns={1} />
            </div>
          </Card>

          <Card className="h-fit animate-slide-up" style={{ "--stagger-index": 1 }}>
            <CardHeader title="Activity Log" />
            <div className="h-[420px] overflow-y-auto p-5">
              {activityLog.length === 0 ? (
                <p className="text-[13px] text-text-tertiary">No activity yet</p>
              ) : (
                <Timeline
                  items={activityLog.slice(0, 20).map((entry) => ({ title: entry.text, timestamp: entry.time }))}
                />
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default RenderPage;
