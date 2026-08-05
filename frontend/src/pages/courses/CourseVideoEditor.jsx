import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  RotateCw,
  PlayCircle,
  Pencil,
  Zap,
  Inbox,
  ChevronDown,
  Check,
  Lock,
  Square,
} from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { LoadingState } from "../../components";
import { useSetBreadcrumbLabel } from "../../shared/breadcrumbContextValue";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Tooltip } from "../../components/ui/Tooltip";
import { Alert } from "../../components/ui/Alert";
import { Steps } from "../../components/ui/Steps";
import { DescriptionList } from "../../components/ui/DescriptionList";
import { Progress } from "../../components/ui/Progress";
import { Timeline } from "../../components/ui/Timeline";
import { AccordionItem } from "../../components/ui/Accordion";
import { Textarea } from "../../components/ui/Input";
import { Spinner } from "../../components/ui/Spinner";
import { AudioPlayer } from "../../components/ui/AudioPlayer";
import { ScenePreview } from "../../components/video/ScenePreview";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";
import {
  getCourseVideo,
  generateCourseVideoScript,
  approveCourseVideoScript,
  updateCourseVideoScript,
  regenerateCourseVideoScript,
  generateCourseVideoAudio,
  renderCourseVideo,
  retryCourseVideo,
  stopCourseVideo,
  regenerateCourseVideoSceneAudio,
  getCourseVideoActivityLogs,
  resolveMediaUrl,
  getCourseWorkerStatus,
} from "../../services/api";
import {
  connect,
  joinCourseRoom,
  leaveCourseRoom,
  onCourseVideoProgress,
  onCourseVideoScriptReady,
  onCourseVideoAudioReady,
  onCourseVideoSceneAudioReady,
  onCourseVideoRenderReady,
  onCourseVideoUpdated,
  onJobFailed,
  onCourseWorkerStatus,
  onConnect,
  onDisconnect,
  isConnected,
} from "../../services/socket";

const getCurrentStep = (status) => {
  const stepMap = {
    Draft: 0,
    "Generating Script": 0,
    "Script Generated": 1,
    "Waiting for Approval": 1,
    Approved: 1,
    "Generating Audio": 2,
    "Audio Generated": 2,
    "Generating Scenes": 2,
    "Scenes Generated": 2,
    "Generating Images": 2,
    "Images Generated": 2,
    "Rendering Video": 3,
    Uploading: 3,
    Completed: 4,
    Failed: -1,
  };
  return stepMap[status] ?? 0;
};

const InlineEmpty = ({ description, children }) => (
  <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
    <div className="flex size-11 items-center justify-center rounded-2xl bg-surface-hover text-text-tertiary">
      <Inbox className="size-5" />
    </div>
    <p className="max-w-xs text-sm text-text-tertiary">{description}</p>
    {children}
  </div>
);

const InlineSpinner = ({ label }) => (
  <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
    <Spinner size="lg" />
    <p className="text-sm text-text-secondary">{label}</p>
  </div>
);

const STEP_CIRCLE_CLASSES = {
  done: "border-accent bg-accent text-white",
  active: "border-accent bg-surface text-accent",
  error: "border-danger-500 bg-danger-500/10 text-danger-500",
  locked: "border-border bg-surface text-text-tertiary",
};

/**
 * Collapsible card for one pipeline step (Script/Audio/Render). Completed or
 * locked steps default to a compact summary row; the current step opens
 * automatically. Clicking the header toggles it, overriding the default.
 */
const StepSection = ({ number, title, state, badges, summary, actions, isOpen, onToggle, children }) => (
  <Card>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light px-5 py-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <ChevronDown className={`size-4 shrink-0 text-text-tertiary transition-transform ${isOpen ? "" : "-rotate-90"}`} />
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold ${STEP_CIRCLE_CLASSES[state]}`}>
          {state === "done" ? <Check className="size-4" /> : state === "locked" ? <Lock className="size-3.5" /> : number}
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-text-primary">{title}</h3>
            {badges}
          </span>
          {!isOpen && summary && <p className="mt-0.5 truncate text-xs text-text-tertiary">{summary}</p>}
        </span>
      </button>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
    {isOpen && <div className="p-5">{children}</div>}
  </Card>
);

const CourseVideoEditor = () => {
  const { courseId, videoId } = useParams();
  const navigate = useNavigate();
  const unsubscribesRef = useRef([]);

  const [video, setVideo] = useState(null);
  useSetBreadcrumbLabel(video?.title);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [editingScript, setEditingScript] = useState(false);
  const [scriptText, setScriptText] = useState("");
  const [activityLog, setActivityLog] = useState([]);
  const [socketStatus, setSocketStatus] = useState(() => (isConnected() ? "connected" : "disconnected"));
  const [workerRunning, setWorkerRunning] = useState(null); // null = unknown, boolean once checked
  // Which of the 3 pipeline step cards is expanded. null = follow the
  // pipeline automatically (open whichever step is next); once the user
  // manually toggles one, their choice sticks instead of auto-following.
  const [openStep, setOpenStep] = useState(null);

  const setStepLoading = (step, val) => setActionLoading((prev) => ({ ...prev, [step]: val }));

  // `video.script` is already a real { title, description, scenes, ... }
  // object from the API - this is only for the raw-JSON textarea editor.
  const scriptToText = (script) => (script?.scenes?.length ? JSON.stringify(script, null, 2) : "");

  const formatActivityTime = useCallback((timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    // Format time like "6:21 pm"
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
      // Within the current week (but not today/yesterday)
      label = date.toLocaleDateString("en-US", { weekday: "long" });
    } else if (diffDays <= 7) {
      // Within the last 7 days but previous week
      label = date.toLocaleDateString("en-US", { weekday: "long" });
    } else if (diffDays <= 14) {
      label = "last week";
    } else if (diffDays <= 60) {
      label = "last month";
    } else {
      // For older entries, show date
      label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }

    return `${label} ${timeStr}`;
  }, []);

  const fetchActivityLogs = useCallback(async () => {
    try {
      const res = await getCourseVideoActivityLogs(videoId);
      setActivityLog(
        (res.data.logs || []).map((log) => ({
          text: log.text,
          time: formatActivityTime(log.timestamp),
        }))
      );
    } catch {
      // Ignore errors fetching logs
    }
  }, [videoId, formatActivityTime]);

  const addActivity = useCallback((text, timestamp) => {
    setActivityLog((prev) => [
      { text, time: timestamp ? formatActivityTime(timestamp) : formatActivityTime(new Date().toISOString()) },
      ...prev,
    ]);
  }, [formatActivityTime]);

  const fetchVideo = useCallback(async () => {
    try {
      const res = await getCourseVideo(videoId);
      const v = res.data.video;
      setVideo(v);
      setScriptText(scriptToText(v.script));

      addActivity(`Status: ${v.status}`, v.updatedAt);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to load video");
      navigate(`/courses/${courseId}`);
    } finally {
      setLoading(false);
    }
  }, [videoId, courseId, navigate, addActivity]);

  const cleanup = useCallback(() => {
    unsubscribesRef.current.forEach((unsubscribe) => unsubscribe && unsubscribe());
    unsubscribesRef.current = [];
  }, []);

  useEffect(() => {
    if (!videoId || !courseId) return undefined;

    fetchVideo();
    fetchActivityLogs();
    cleanup();
    connect();
    joinCourseRoom(courseId);
    setSocketStatus(isConnected() ? "connected" : "disconnected");

    unsubscribesRef.current.push(
      onCourseVideoProgress((data) => {
        if (data.videoId !== videoId) return;
        setVideo((prev) => (prev ? { ...prev, status: data.status } : prev));
        if (data.message) addActivity(data.message);
      })
    );

    unsubscribesRef.current.push(
      onCourseVideoScriptReady((data) => {
        if (data.videoId !== videoId) return;
        setVideo((prev) => (prev ? { ...prev, status: data.status, script: data.script } : prev));
        setScriptText(scriptToText(data.script));
        setActionLoading({});
        addActivity(data.message || "Script ready", data.updatedAt);
        fetchActivityLogs();
      })
    );

    unsubscribesRef.current.push(
      onCourseVideoSceneAudioReady((data) => {
        if (data.videoId !== videoId) return;
        setVideo((prev) => {
          if (!prev?.script?.scenes) return prev;
          const scenes = prev.script.scenes.map((scene) =>
            scene.sceneNumber === data.sceneNumber
              ? { ...scene, audio: { ...scene.audio, ...data.audio } }
              : scene
          );
          return { ...prev, script: { ...prev.script, scenes } };
        });
        addActivity(`Scene ${data.sceneNumber} audio generated`);
        fetchActivityLogs();
      })
    );

    unsubscribesRef.current.push(
      onCourseVideoAudioReady((data) => {
        if (data.videoId !== videoId) return;
        setVideo((prev) =>
          prev ? { ...prev, status: data.status, audioUrl: data.audioUrl, audioDuration: data.audioDuration } : prev
        );
        setActionLoading({});
        addActivity(data.message || "Audio ready");
        fetchActivityLogs();
      })
    );

    unsubscribesRef.current.push(
      onCourseVideoRenderReady((data) => {
        if (data.videoId !== videoId) return;
        setVideo((prev) =>
          prev ? { ...prev, status: data.status, renderUrl: data.renderUrl, renderedAt: data.renderedAt || new Date().toISOString() } : prev
        );
        setActionLoading({});
        addActivity(data.message || "Render ready");
        fetchActivityLogs();
      })
    );

    unsubscribesRef.current.push(
      onCourseVideoUpdated((data) => {
        if (data.videoId !== videoId) return;
        // Cloud upload can touch script/audioUrl/renderUrl together, so
        // just refetch the full record rather than partially merging.
        fetchVideo();
        addActivity(data.message || "Video updated");
        fetchActivityLogs();
      })
    );

    unsubscribesRef.current.push(
      onJobFailed((data) => {
        if (data.videoId !== videoId) return;
        setVideo((prev) => (prev ? { ...prev, status: data.status, error: { message: data.error, step: data.step } } : prev));
        setActionLoading({});
        toast.error(data.error || "Step failed");
        addActivity(`Failed: ${data.error || "Unknown error"}`);
        fetchActivityLogs();
      })
    );

    unsubscribesRef.current.push(
      onConnect(() => {
        setSocketStatus("connected");
        // Rooms aren't remembered across a reconnect - rejoin and resync
        // in case events fired while we were disconnected.
        joinCourseRoom(courseId);
        fetchVideo();
        fetchActivityLogs();
      })
    );
    unsubscribesRef.current.push(
      onDisconnect((reason) => setSocketStatus(reason === "io client disconnect" ? "disconnected" : "reconnecting"))
    );

    return () => {
      leaveCourseRoom(courseId);
      cleanup();
    };
  }, [videoId, courseId, fetchVideo, fetchActivityLogs, cleanup]);

  // Worker liveness for the Generate/Render buttons' running/offline
  // indicator: one REST call for the initial value, then the backend
  // pushes courseWorkerStatus over the socket whenever it changes (see
  // SocketService._pollWorkerStatus) instead of this tab polling on its own.
  useEffect(() => {
    let cancelled = false;
    getCourseWorkerStatus()
      .then((res) => {
        if (!cancelled) setWorkerRunning(res.data.running);
      })
      .catch(() => {
        if (!cancelled) setWorkerRunning(false);
      });
    const unsubscribe = onCourseWorkerStatus((data) => setWorkerRunning(data.running));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const handleGenerateScript = async () => {
    setStepLoading("script", true);
    try {
      await generateCourseVideoScript(videoId);
      toast.info("Script generation started");
      addActivity("Script generation started");
      fetchActivityLogs();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || "Failed to start script generation");
      setStepLoading("script", false);
    }
  };

  const handleApproveScript = async () => {
    setStepLoading("approve", true);
    try {
      await approveCourseVideoScript(videoId);
      toast.success("Script approved");
      addActivity("Script approved");
      fetchVideo();
      fetchActivityLogs();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to approve script");
    } finally {
      setStepLoading("approve", false);
    }
  };

  const handleSaveScript = async () => {
    let parsed;
    try {
      parsed = JSON.parse(scriptText);
    } catch {
      toast.error("Invalid JSON - please fix before saving");
      return;
    }
    setStepLoading("save", true);
    try {
      await updateCourseVideoScript(videoId, parsed);
      toast.success("Script updated");
      setEditingScript(false);
      addActivity("Script edited and saved");
      fetchVideo();
      fetchActivityLogs();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save script");
    } finally {
      setStepLoading("save", false);
    }
  };

  const handleRegenerateScript = async () => {
    const ok = await confirmDialog({ title: "Regenerate Script", content: "This will replace the current script. Are you sure?" });
    if (!ok) return;
    setStepLoading("script", true);
    try {
      await regenerateCourseVideoScript(videoId);
      toast.info("Script regeneration started");
      addActivity("Script regeneration started");
      fetchActivityLogs();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || "Failed to regenerate script");
      setStepLoading("script", false);
    }
  };

  const handleGenerateAudio = async () => {
    setStepLoading("audio", true);
    try {
      await generateCourseVideoAudio(videoId);
      toast.info("Audio generation started");
      addActivity("Audio generation started");
      fetchActivityLogs();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || "Failed to start audio generation");
      setStepLoading("audio", false);
    }
  };

  const handleRegenerateAudio = async () => {
    const ok = await confirmDialog({ title: "Regenerate Audio", content: "This will regenerate all audio for this video. Are you sure?" });
    if (!ok) return;
    setStepLoading("audio", true);
    try {
      await generateCourseVideoAudio(videoId);
      toast.info("Audio regeneration started");
      addActivity("Audio regeneration started");
      fetchActivityLogs();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || "Failed to regenerate audio");
      setStepLoading("audio", false);
    }
  };

  const handleRender = async () => {
    setStepLoading("render", true);
    try {
      await renderCourseVideo(videoId);
      toast.info("Rendering started");
      addActivity("Rendering started");
      fetchActivityLogs();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || "Failed to start rendering");
      setStepLoading("render", false);
    }
  };

  const handleReRender = async () => {
    const ok = await confirmDialog({ title: "Re-Render Video", content: "This will re-render the video from scratch. Are you sure?" });
    if (!ok) return;
    setStepLoading("render", true);
    try {
      await renderCourseVideo(videoId);
      toast.info("Re-rendering started");
      addActivity("Re-rendering started");
      fetchActivityLogs();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || "Failed to re-render");
      setStepLoading("render", false);
    }
  };

  const handleManualRefresh = () => {
    fetchVideo();
    fetchActivityLogs();
    toast.info("Refreshed video data");
  };

  const handleRetry = async () => {
    const failedStep = video?.error?.step || "Script Generation";
    setStepLoading("retry", true);
    try {
      await retryCourseVideo(videoId);
      toast.info(`Retrying ${failedStep}...`);
      addActivity(`Retrying ${failedStep}...`);
      fetchActivityLogs();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || "Failed to retry");
      setStepLoading("retry", false);
    }
  };

  const handleStop = async () => {
    const ok = await confirmDialog({
      title: "Stop this lesson?",
      content:
        "This will be marked cancelled. If it's still queued this stops it immediately; if it's actively processing, it stops as soon as the current step finishes checking in (may take a moment).",
      confirmText: "Stop",
      danger: true,
    });
    if (!ok) return;

    setStepLoading("stop", true);
    try {
      await stopCourseVideo(videoId);
      toast.success("Lesson stopped");
      addActivity("Stopped by user");
      fetchActivityLogs();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || "Failed to stop");
    } finally {
      setStepLoading("stop", false);
    }
  };

  const [regeneratingScene, setRegeneratingScene] = useState(null);
  const handleRegenerateSceneAudio = async (sceneNumber) => {
    setRegeneratingScene(sceneNumber);
    try {
      const res = await regenerateCourseVideoSceneAudio(videoId, sceneNumber);
      setVideo((prev) => {
        if (!prev?.script?.scenes) return prev;
        const scenes = prev.script.scenes.map((scene) =>
          scene.sceneNumber === sceneNumber
            ? { ...scene, audio: { ...scene.audio, ...res.data.audio } }
            : scene
        );
        return { ...prev, script: { ...prev.script, scenes } };
      });
      toast.success(`Scene ${sceneNumber} audio regenerated`);
      fetchActivityLogs();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || `Failed to regenerate scene ${sceneNumber}`);
    } finally {
      setRegeneratingScene(null);
    }
  };

  const isProcessing = ["Generating Script", "Generating Audio", "Rendering Video", "Uploading", "Generating Scenes", "Generating Images"].includes(video?.status);
  const isUploading = video?.status === "Uploading";
  const isFailed = video?.status === "Failed";
  const isCompleted = video?.status === "Completed";
  const hasScript = Boolean(video?.script?.scenes?.length);
  const isApproved = video?.approved;
  const hasAudio = video?.audioUrl && video.audioUrl.length > 0;
  const scenes = video?.script?.scenes || [];
  const audioBaseUrl = video?._id ? resolveMediaUrl(`/public/${video._id}/audio`) : null;

  if (loading) return <LoadingState label="Loading video..." />;

  if (!video) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <h2 className="text-lg font-semibold text-text-primary">Video not found</h2>
        <Button variant="primary" onClick={() => navigate(`/courses/${courseId}`)}>
          Back to Course
        </Button>
      </div>
    );
  }

  const currentStep = getCurrentStep(video.status);
  const stepItems = [
    { title: "Draft" },
    { title: "Script", description: isApproved ? "Approved" : hasScript ? "Ready" : undefined },
    { title: "Audio", description: hasAudio ? `${Math.round(video.audioDuration)}s` : undefined },
    { title: "Render" },
    { title: "Complete" },
  ];

  const infoItems = [
    { label: "Duration", value: `${video.duration} min` },
    { label: "Voice", value: video.voice },
    { label: "Style", value: video.style },
    {
      label: "Status",
      value: (
        <Badge variant={isCompleted ? "success" : isFailed ? "danger" : isProcessing ? "accent" : "neutral"}>{video.status}</Badge>
      ),
    },
  ];

  // Per-card state for the collapsible Script/Audio/Render steps below.
  const failedStep = (video.error?.step || "").toLowerCase();
  const scriptState = isFailed && failedStep.includes("script") ? "error" : isApproved ? "done" : "active";
  const audioState = isFailed && failedStep.includes("audio")
    ? "error"
    : hasAudio
    ? "done"
    : isApproved
    ? "active"
    : "locked";
  const renderState = isFailed && (failedStep.includes("render") || failedStep.includes("upload"))
    ? "error"
    : isCompleted
    ? "done"
    : hasAudio
    ? "active"
    : "locked";

  // Auto-follow the pipeline: open whichever step isn't done yet, unless the
  // user has manually picked one.
  const autoOpenStep = scriptState !== "done" ? "script" : audioState !== "done" ? "audio" : "render";
  const effectiveOpenStep = openStep ?? autoOpenStep;
  const toggleStep = (key) => setOpenStep(effectiveOpenStep === key ? "none" : key);

  const scriptSummary = scriptState === "done"
    ? `${scenes.length} scene${scenes.length === 1 ? "" : "s"} • Approved`
    : hasScript
    ? `${scenes.length} scene${scenes.length === 1 ? "" : "s"} • Awaiting approval`
    : "Not generated yet";
  const audioSummary = audioState === "done"
    ? `${Math.round(video.audioDuration)}s narration • Generated`
    : audioState === "locked"
    ? "Waiting on script approval"
    : "Not generated yet";
  const renderSummary = renderState === "done"
    ? `Completed ${video.renderedAt ? new Date(video.renderedAt).toLocaleDateString() : ""}`
    : renderState === "locked"
    ? "Waiting on audio"
    : "Ready to render";

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="md" iconOnly aria-label="Back to course" onClick={() => navigate(`/courses/${courseId}`)} icon={<ArrowLeft className="size-4" />} />
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-text-primary">{video.title}</h1>
            <p className="mt-1 text-sm text-text-secondary">{video.topic}</p>
          </div>
          <Badge variant={socketStatus === "connected" ? "success" : "neutral"} dot>
            {socketStatus === "connected" ? "Live" : socketStatus === "reconnecting" ? "Reconnecting..." : "Offline"}
          </Badge>
          {workerRunning !== null && (
            <Tooltip
              content={
                workerRunning
                  ? "The course worker is running - generation jobs will process."
                  : "The course worker is not running. Start it (npm run course-worker) before generating - otherwise generation requests will be rejected."
              }
            >
              <Badge variant={workerRunning ? "success" : "danger"} dot>
                {workerRunning ? "Worker Running" : "Worker Offline"}
              </Badge>
            </Tooltip>
          )}
        </div>
        {isProcessing && (
          <Button variant="danger" icon={<Square className="size-4" />} loading={actionLoading.stop} onClick={handleStop}>
            Stop
          </Button>
        )}
        {isFailed && (
          <Button variant="danger" icon={<RotateCw className="size-4" />} loading={actionLoading.retry} onClick={handleRetry}>
            Retry
          </Button>
        )}
      </div>

      {/* Progress + Video Info */}
      <Card className="mb-4 p-6">
        <Steps items={stepItems} current={Math.max(currentStep, 0)} status={isFailed ? "error" : "process"} />
        <div className="mt-6 border-t border-border-light pt-5">
          <DescriptionList items={infoItems} columns={4} />
          {video.additionalInstructions && (
            <p className="mt-3 text-[13px] text-text-secondary">Instructions: {video.additionalInstructions}</p>
          )}
        </div>
      </Card>

      {/* Error Alert */}
      {isFailed && video.error?.message && (
        <Alert
          type="error"
          title={`Failed at: ${video.error.step || "Unknown"}`}
          className="mb-4"
          action={
            <Button size="sm" loading={actionLoading.retry} onClick={handleRetry}>
              Retry
            </Button>
          }
        >
          {video.error.message}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Left Column */}
        <div className="space-y-4">
          {/* STEP 1: SCRIPT */}
          <StepSection
            number={1}
            title="Script Generation"
            state={scriptState}
            isOpen={effectiveOpenStep === "script"}
            onToggle={() => toggleStep("script")}
            summary={scriptSummary}
            badges={
              <>
                {hasScript && !isApproved && <Badge variant="warning">Needs Approval</Badge>}
                {isApproved && <Badge variant="success" icon={<CheckCircle2 className="size-3" />}>Approved</Badge>}
              </>
            }
            actions={
              <>
                <Button variant="ghost" size="sm" iconOnly aria-label="Refresh" icon={<RotateCw className="size-3.5" />} onClick={handleManualRefresh} />
                {!hasScript && video?.status !== "Generating Script" && (
                  <Button variant="primary" size="sm" icon={<Zap className="size-3.5" />} loading={actionLoading.script} onClick={handleGenerateScript}>
                    Generate Script
                  </Button>
                )}
                {hasScript && !isApproved && video?.status !== "Generating Script" && (
                  <>
                    <Button variant="secondary" size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setEditingScript((v) => !v)}>
                      {editingScript ? "Cancel" : "Edit"}
                    </Button>
                    <Button variant="primary" size="sm" icon={<CheckCircle2 className="size-3.5" />} loading={actionLoading.approve} onClick={handleApproveScript}>
                      Approve Script
                    </Button>
                    <Button variant="secondary" size="sm" icon={<RotateCw className="size-3.5" />} loading={actionLoading.script} onClick={handleRegenerateScript}>
                      Regenerate
                    </Button>
                  </>
                )}
                {isApproved && video?.status !== "Generating Script" && (
                  <Button variant="secondary" size="sm" icon={<RotateCw className="size-3.5" />} loading={actionLoading.script} onClick={handleRegenerateScript}>
                    Regenerate Script
                  </Button>
                )}
              </>
            }
          >
            {!hasScript && !isProcessing && (
              <InlineEmpty description="No script yet">
                <Button variant="primary" size="sm" icon={<Zap className="size-3.5" />} loading={actionLoading.script} onClick={handleGenerateScript} className="mt-1">
                  Generate Script with AI
                </Button>
              </InlineEmpty>
            )}
            {!hasScript && video?.status === "Generating Script" && <InlineSpinner label="Generating script using AI..." />}
            {hasScript && !editingScript && (
              <div>
                {scenes.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {scenes.map((scene, i) => (
                      <div
                        key={i}
                        className="animate-slide-up rounded-[10px] bg-surface-hover p-3.5"
                        style={{ "--stagger-index": i }}
                      >
                        <div className="mb-1.5 flex items-start justify-between gap-2">
                          <span className="flex items-center gap-2">
                            <Badge variant="accent" className="shrink-0">
                              {scene.sceneNumber || i + 1}
                            </Badge>
                            <p className="font-semibold text-text-primary">{scene.title || "Untitled scene"}</p>
                          </span>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {scene.sceneType && <Badge>{scene.sceneType}</Badge>}
                            {Boolean(scene.duration) && <span className="text-xs text-text-tertiary">{scene.duration}s</span>}
                          </div>
                        </div>
                        {scene.subtitle && <p className="text-[13px] text-text-secondary">{scene.subtitle}</p>}
                        {(scene.audio?.text || scene.narration) && (
                          <p className="mt-1 line-clamp-2 text-[13px] text-text-tertiary">
                            &ldquo;{scene.audio?.text || scene.narration}&rdquo;
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <InlineEmpty description="Script has no scenes" />
                )}

                <AccordionItem title={<span className="text-[13px] text-text-tertiary">View raw script JSON</span>} ghost className="mt-3">
                  <pre className="max-h-96 overflow-auto rounded-lg border border-border-light bg-bg p-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-text-primary">
                    {JSON.stringify(video.script, null, 2)}
                  </pre>
                </AccordionItem>
              </div>
            )}
            {hasScript && editingScript && (
              <div>
                <Textarea
                  rows={15}
                  value={scriptText}
                  onChange={(e) => setScriptText(e.target.value)}
                  className="bg-bg font-mono text-[13px]"
                />
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditingScript(false);
                      setScriptText(scriptToText(video.script));
                    }}
                  >
                    Cancel
                  </Button>
                  <Button variant="primary" loading={actionLoading.save} onClick={handleSaveScript}>
                    Save Script
                  </Button>
                </div>
              </div>
            )}
          </StepSection>

          {/* SCENE PREVIEW: live in-browser Remotion preview, no server render */}
          {hasScript && scenes.length > 0 && effectiveOpenStep === "script" && (
            <Card>
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    <PlayCircle className="size-4 text-text-tertiary" />
                    Scene Preview
                    {!hasAudio && <Badge>No audio</Badge>}
                  </span>
                }
                extra={
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Pencil className="size-3.5" />}
                    onClick={() => navigate(`/courses/${courseId}/videos/${videoId}/studio`)}
                  >
                    Customize in Studio
                  </Button>
                }
              />
              <div className="p-5">
                <ScenePreview scenes={scenes} videoId={videoId} />
              </div>
            </Card>
          )}

          {/* STEP 2: AUDIO */}
          <StepSection
            number={2}
            title="Audio Generation"
            state={audioState}
            isOpen={effectiveOpenStep === "audio"}
            onToggle={() => toggleStep("audio")}
            summary={audioSummary}
            actions={
              <>
                <Button variant="ghost" size="sm" iconOnly aria-label="Refresh" icon={<RotateCw className="size-3.5" />} onClick={handleManualRefresh} />
                {isApproved && !hasAudio && video?.status !== "Generating Audio" && (
                  <Button variant="primary" size="sm" icon={<Zap className="size-3.5" />} loading={actionLoading.audio} onClick={handleGenerateAudio}>
                    Generate Audio
                  </Button>
                )}
                {hasAudio && video?.status !== "Generating Audio" && (
                  <Button variant="secondary" size="sm" icon={<RotateCw className="size-3.5" />} loading={actionLoading.audio} onClick={handleRegenerateAudio}>
                    Regenerate Audio
                  </Button>
                )}
              </>
            }
          >
            {!isApproved && !hasAudio && <InlineEmpty description="Approve the script first to generate audio" />}
            {isApproved && !hasAudio && !isProcessing && (
              <InlineEmpty description="Audio not yet generated">
                <Button variant="primary" size="sm" icon={<Zap className="size-3.5" />} loading={actionLoading.audio} onClick={handleGenerateAudio} className="mt-1">
                  Generate Audio
                </Button>
              </InlineEmpty>
            )}
            {video?.status === "Generating Audio" && scenes.length === 0 && (
              <InlineSpinner label="Generating audio narration..." />
            )}
            {(hasAudio || video?.status === "Generating Audio") && scenes.length > 0 && (() => {
              const readyCount = scenes.filter((s) => Boolean(s.audio?.file)).length;
              return (
                <div>
                  <p className="mb-3 font-semibold text-text-primary">
                    Per-Scene Audio ({readyCount}/{scenes.length} ready)
                  </p>
                  <div className="flex flex-col divide-y divide-border-light rounded-xl border border-border-light">
                    {scenes.map((scene, idx) => {
                      const sceneNum = scene.sceneNumber || idx + 1;
                      // After a successful cloud upload, the backend swaps
                      // scene.audio.file for the full GitHub URL in place -
                      // use it directly when present, otherwise fall back
                      // to the locally-served file.
                      const audioFile = scene.audio?.file;
                      const sceneReady = Boolean(audioFile);
                      const sceneAudioUrl = sceneReady
                        ? (/^https?:\/\//i.test(audioFile) ? audioFile : `${audioBaseUrl}/${audioFile}`)
                        : null;
                      const sceneTitle = scene.title || `Scene ${sceneNum}`;
                      const sceneType = scene.sceneType || "content";
                      const isRegenerating = regeneratingScene === sceneNum;
                      return (
                        <div key={idx} className="p-3">
                          <div className="mb-2 flex items-center gap-2">
                            <span className="text-xs font-medium text-text-tertiary">{sceneNum}</span>
                            <span className="text-[13px] font-semibold text-text-primary">{sceneTitle}</span>
                            <Badge className="ml-auto shrink-0">{sceneType}</Badge>
                            {sceneReady && !isProcessing && (
                              <Tooltip content="Regenerate just this scene's audio">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  iconOnly
                                  aria-label={`Regenerate scene ${sceneNum} audio`}
                                  icon={<RotateCw className={`size-3.5 ${isRegenerating ? "animate-spin" : ""}`} />}
                                  disabled={isRegenerating}
                                  onClick={() => handleRegenerateSceneAudio(sceneNum)}
                                />
                              </Tooltip>
                            )}
                          </div>
                          {sceneReady && !isRegenerating ? (
                            <AudioPlayer src={sceneAudioUrl} className="w-full" />
                          ) : (
                            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border-light px-3 py-2 text-xs text-text-tertiary">
                              <Spinner size="sm" />
                              {isRegenerating ? "Regenerating this scene's audio..." : "Generating this scene's audio..."}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            {hasAudio && scenes.length === 0 && (
              <div>
                <DescriptionList
                  items={[
                    { label: "Total Duration", value: `${Math.round(video.audioDuration)} seconds` },
                    { label: "Generated", value: video.audioGeneratedAt ? new Date(video.audioGeneratedAt).toLocaleString() : "N/A" },
                  ]}
                />
                {video.audioUrl && <AudioPlayer src={resolveMediaUrl(video.audioUrl)} className="mt-3" />}
              </div>
            )}
          </StepSection>

          {/* STEP 3: RENDER */}
          <StepSection
            number={3}
            title="Video Render"
            state={renderState}
            isOpen={effectiveOpenStep === "render"}
            onToggle={() => toggleStep("render")}
            summary={renderSummary}
            actions={
              <>
                <Button variant="ghost" size="sm" iconOnly aria-label="Refresh" icon={<RotateCw className="size-3.5" />} onClick={handleManualRefresh} />
                {hasAudio && !isCompleted && !isProcessing && (
                  <Button variant="primary" size="sm" icon={<Zap className="size-3.5" />} loading={actionLoading.render} onClick={handleRender}>
                    Render Video
                  </Button>
                )}
                {isCompleted && (
                  <Button variant="secondary" size="sm" icon={<RotateCw className="size-3.5" />} loading={actionLoading.render} onClick={handleReRender}>
                    Re-Render
                  </Button>
                )}
              </>
            }
          >
            {!hasAudio && !isCompleted && <InlineEmpty description="Generate audio first to render the video" />}
            {hasAudio && !isCompleted && !isProcessing && (
              <InlineEmpty description="Ready to render">
                <Button variant="primary" size="sm" icon={<Zap className="size-3.5" />} loading={actionLoading.render} onClick={handleRender} className="mt-1">
                  Render Video
                </Button>
              </InlineEmpty>
            )}
            {video?.status === "Rendering Video" && (
              <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                <Spinner size="lg" />
                <p className="text-sm text-text-secondary">Rendering video...</p>
                {video.renderProgress > 0 && <Progress percent={video.renderProgress} className="mt-1 w-full max-w-sm" />}
              </div>
            )}
            {isUploading && (
              <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                <Spinner size="lg" />
                <p className="text-sm text-text-secondary">Uploading assets to cloud storage...</p>
                {video.renderProgress > 0 && <Progress percent={video.renderProgress} className="mt-1 w-full max-w-sm" />}
              </div>
            )}
            {isCompleted && (
              <div className="flex flex-col items-center py-6 text-center">
                <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-success-500/10 text-success-500">
                  <CheckCircle2 className="size-7" />
                </div>
                <h3 className="text-base font-semibold text-text-primary">Video Completed!</h3>
                <p className="mt-1 text-sm text-text-secondary">
                  Rendered at: {video.renderedAt ? new Date(video.renderedAt).toLocaleString() : "N/A"}
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {video.renderUrl && (
                    <Button href={resolveMediaUrl(video.renderUrl)} target="_blank" rel="noopener noreferrer" variant="primary" icon={<PlayCircle className="size-4" />}>
                      Watch Video
                    </Button>
                  )}
                  <Button variant="secondary" icon={<RotateCw className="size-4" />} loading={actionLoading.render} onClick={handleReRender}>
                    Re-Render
                  </Button>
                  <Button variant="ghost" onClick={() => navigate(`/courses/${courseId}`)}>
                    Back to Course
                  </Button>
                </div>
              </div>
            )}
          </StepSection>
        </div>

        {/* Right Column - Activity Log */}
        <Card className="h-fit">
          <CardHeader title="Activity Log" />
          <div className="p-5">
            {activityLog.length === 0 ? (
              <InlineEmpty description="No activity yet" />
            ) : (
              <Timeline
                items={activityLog.slice(0, 20).map((entry) => ({ title: entry.text, timestamp: entry.time }))}
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default CourseVideoEditor;