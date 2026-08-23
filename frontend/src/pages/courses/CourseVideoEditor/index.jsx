import { useState, useCallback } from "react";
import { ArrowLeft, RotateCw, Square } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { LoadingState } from "../../../components";
import { useSetBreadcrumbLabel } from "../../../shared/breadcrumbContextValue";
import { useCourseWorkerStatus } from "../../../shared/useCourseWorkerStatus";
import { Card, CardHeader } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Tooltip } from "../../../components/ui/Tooltip";
import { Alert } from "../../../components/ui/Alert";
import { Steps } from "../../../components/ui/Steps";
import { DescriptionList } from "../../../components/ui/DescriptionList";
import { Timeline } from "../../../components/ui/Timeline";
import { toast } from "../../../components/ui/toastBus";
import { confirmDialog } from "../../../components/ui/confirmBus";
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
} from "../../../services/api";
import { getCurrentStep, scriptToText } from "./constants";
import { InlineEmpty } from "./shared";
import { useActivityLog } from "./useActivityLog";
import { useVideoSocket } from "./useVideoSocket";
import { ScriptStepCard } from "./ScriptStepCard";
import { AudioStepCard } from "./AudioStepCard";
import { RenderStepCard } from "./RenderStepCard";

const CourseVideoEditor = () => {
  const { courseId, videoId } = useParams();
  const navigate = useNavigate();

  const [video, setVideo] = useState(null);
  useSetBreadcrumbLabel(video?.title);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [editingScript, setEditingScript] = useState(false);
  const [scriptText, setScriptText] = useState("");
  const workerRunning = useCourseWorkerStatus();
  // Which of the 3 pipeline step cards is expanded. null = follow the
  // pipeline automatically (open whichever step is next); once the user
  // manually toggles one, their choice sticks instead of auto-following.
  const [openStep, setOpenStep] = useState(null);

  const setStepLoading = (step, val) => setActionLoading((prev) => ({ ...prev, [step]: val }));

  const { activityLog, fetchActivityLogs, addActivity } = useActivityLog(videoId);

  const fetchVideo = useCallback(async () => {
    try {
      const res = await getCourseVideo(videoId);
      const v = res.data.video;
      setVideo(v);
      setScriptText(scriptToText(v.script));

      addActivity(`Status: ${v.status}`, v.updatedAt);
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to load video");
      navigate(`/courses/${courseId}`);
    } finally {
      setLoading(false);
    }
  }, [videoId, courseId, navigate, addActivity]);

  const socketStatus = useVideoSocket({
    videoId,
    courseId,
    fetchVideo,
    fetchActivityLogs,
    addActivity,
    setVideo,
    setScriptText,
    setActionLoading,
  });

  const handleGenerateScript = async () => {
    setStepLoading("script", true);
    try {
      await generateCourseVideoScript(videoId);
      toast.info("Script generation started");
      addActivity("Script generation started");
      fetchActivityLogs();
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to start script generation");
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
      toast.error(err.friendlyMessage || "Failed to regenerate script");
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
      toast.error(err.friendlyMessage || "Failed to start audio generation");
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
      toast.error(err.friendlyMessage || "Failed to regenerate audio");
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
      toast.error(err.friendlyMessage || "Failed to start rendering");
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
      toast.error(err.friendlyMessage || "Failed to re-render");
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
      toast.error(err.friendlyMessage || "Failed to retry");
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
      toast.error(err.friendlyMessage || "Failed to stop");
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
      toast.error(err.friendlyMessage || `Failed to regenerate scene ${sceneNumber}`);
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
          <ScriptStepCard
            video={video}
            scenes={scenes}
            hasScript={hasScript}
            isApproved={isApproved}
            hasAudio={hasAudio}
            isProcessing={isProcessing}
            scriptState={scriptState}
            scriptSummary={scriptSummary}
            isOpen={effectiveOpenStep === "script"}
            onToggle={() => toggleStep("script")}
            actionLoading={actionLoading}
            editingScript={editingScript}
            setEditingScript={setEditingScript}
            scriptText={scriptText}
            setScriptText={setScriptText}
            onGenerateScript={handleGenerateScript}
            onApproveScript={handleApproveScript}
            onRegenerateScript={handleRegenerateScript}
            onSaveScript={handleSaveScript}
            onManualRefresh={handleManualRefresh}
            courseId={courseId}
            videoId={videoId}
            navigate={navigate}
          />

          <AudioStepCard
            video={video}
            scenes={scenes}
            hasAudio={hasAudio}
            isApproved={isApproved}
            isProcessing={isProcessing}
            audioState={audioState}
            audioSummary={audioSummary}
            isOpen={effectiveOpenStep === "audio"}
            onToggle={() => toggleStep("audio")}
            actionLoading={actionLoading}
            regeneratingScene={regeneratingScene}
            onGenerateAudio={handleGenerateAudio}
            onRegenerateAudio={handleRegenerateAudio}
            onRegenerateSceneAudio={handleRegenerateSceneAudio}
            onManualRefresh={handleManualRefresh}
          />

          <RenderStepCard
            video={video}
            hasAudio={hasAudio}
            isCompleted={isCompleted}
            isUploading={isUploading}
            isProcessing={isProcessing}
            renderState={renderState}
            renderSummary={renderSummary}
            isOpen={effectiveOpenStep === "render"}
            onToggle={() => toggleStep("render")}
            actionLoading={actionLoading}
            onRender={handleRender}
            onReRender={handleReRender}
            onManualRefresh={handleManualRefresh}
            courseId={courseId}
            navigate={navigate}
          />
        </div>

        {/* Right Column - Activity Log */}
        <Card className="h-fit">
          <CardHeader title="Activity Log" />
          <div className="p-5 h-[420px] overflow-y-auto">
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
