import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { LoadingState } from "../../../components";
import { useSetBreadcrumbLabel } from "../../../shared/breadcrumbContextValue";
import { useCourseWorkerStatus } from "../../../shared/useCourseWorkerStatus";
import { Card, CardHeader } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Alert } from "../../../components/ui/Alert";
import { Steps } from "../../../components/ui/Steps";
import { Progress } from "../../../components/ui/Progress";
import { DescriptionList } from "../../../components/ui/DescriptionList";
import { Timeline } from "../../../components/ui/Timeline";
import { toast } from "../../../components/ui/toastBus";
import { getCourseVideo, getCourseVideoActivityLogs } from "../../../services/api";
import { getCurrentStep, scriptToText } from "./constants";
import { InlineEmpty } from "./shared";
import { useActivityLog } from "../../../shared/useActivityLog";
import { useVideoSocket } from "./useVideoSocket";
import { useLessonActions } from "./useLessonActions";
import { deriveLessonView } from "./lessonView";
import { LessonHeader } from "./LessonHeader";
import { ScriptStepCard } from "./ScriptStepCard";
import { AudioStepCard } from "./AudioStepCard";
import { RenderStepCard } from "./RenderStepCard";

/**
 * One course lesson: its script, audio and render steps as collapsible
 * cards, live over the socket. Status-derived state comes from
 * deriveLessonView and the actions from useLessonActions.
 */
const CourseVideoEditor = () => {
  const { courseId, videoId } = useParams();
  const navigate = useNavigate();

  const [video, setVideo] = useState(null);
  useSetBreadcrumbLabel(video?.title);
  const [loading, setLoading] = useState(true);
  const [editingScript, setEditingScript] = useState(false);
  const [scriptText, setScriptText] = useState("");
  const workerRunning = useCourseWorkerStatus();
  // Which of the 3 pipeline step cards is expanded. null = follow the
  // pipeline automatically (open whichever step is next); once the user
  // manually toggles one, their choice sticks instead of auto-following.
  const [openStep, setOpenStep] = useState(null);

  // Closes over videoId so callers can keep calling fetchActivityLogs()
  // with no arguments. useCallback keeps the reference stable, which the
  // hook depends on.
  const fetchVideoActivityLogs = useCallback(() => getCourseVideoActivityLogs(videoId), [videoId]);
  const { activityLog, fetchActivityLogs, addActivity } = useActivityLog(fetchVideoActivityLogs);

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

  const actions = useLessonActions({
    videoId,
    video,
    setVideo,
    scriptText,
    setEditingScript,
    fetchVideo,
    fetchActivityLogs,
    addActivity,
  });
  const { actionLoading } = actions;

  const socketStatus = useVideoSocket({
    videoId,
    courseId,
    fetchVideo,
    fetchActivityLogs,
    addActivity,
    setVideo,
    setScriptText,
    setActionLoading: actions.setActionLoading,
  });

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

  const v = deriveLessonView(video);

  const currentStep = getCurrentStep(video.status);
  const stepItems = [
    { title: "Draft" },
    { title: "Script", description: v.isApproved ? "Approved" : v.hasScript ? "Ready" : undefined },
    { title: "Audio", description: v.hasAudio ? `${Math.round(video.audioDuration)}s` : undefined },
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
        <Badge variant={v.isCompleted ? "success" : v.isFailed ? "danger" : v.isProcessing ? "accent" : "neutral"}>{video.status}</Badge>
      ),
    },
  ];

  const effectiveOpenStep = openStep ?? v.autoOpenStep;
  const toggleStep = (key) => setOpenStep(effectiveOpenStep === key ? "none" : key);

  return (
    <div>
      <LessonHeader
        video={video}
        socketStatus={socketStatus}
        workerRunning={workerRunning}
        isProcessing={v.isProcessing}
        isFailed={v.isFailed}
        actionLoading={actionLoading}
        onBack={() => navigate(`/courses/${courseId}`)}
        onStop={actions.handleStop}
        onRetry={actions.handleRetry}
      />

      {/* Progress + Video Info */}
      <Card className="mb-4 p-4 sm:p-6">
        <Steps items={stepItems} current={Math.max(currentStep, 0)} status={v.isFailed ? "error" : "process"} />
        {v.isProcessing && (video.liveProgress ?? 0) > 0 && (
          <div className="mt-5">
            <p className="mb-1 text-xs text-text-tertiary">{video.status} - overall progress</p>
            <Progress percent={video.liveProgress} trickle />
          </div>
        )}
        <div className="mt-6 border-t border-border-light pt-5">
          <DescriptionList items={infoItems} columns={4} />
          {video.additionalInstructions && (
            <p className="mt-3 text-[13px] text-text-secondary">Instructions: {video.additionalInstructions}</p>
          )}
        </div>
      </Card>

      {v.isFailed && video.error?.message && (
        <Alert
          type="error"
          title={`Failed at: ${video.error.step || "Unknown"}`}
          className="mb-4"
          action={
            <Button size="sm" loading={actionLoading.retry} onClick={actions.handleRetry}>
              Retry
            </Button>
          }
        >
          {video.error.message}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <ScriptStepCard
            video={video}
            scenes={v.scenes}
            hasScript={v.hasScript}
            isApproved={v.isApproved}
            hasAudio={v.hasAudio}
            isProcessing={v.isProcessing}
            scriptState={v.scriptState}
            scriptSummary={v.scriptSummary}
            isOpen={effectiveOpenStep === "script"}
            onToggle={() => toggleStep("script")}
            actionLoading={actionLoading}
            editingScript={editingScript}
            setEditingScript={setEditingScript}
            scriptText={scriptText}
            setScriptText={setScriptText}
            onGenerateScript={actions.handleGenerateScript}
            onApproveScript={actions.handleApproveScript}
            onRegenerateScript={actions.handleRegenerateScript}
            onSaveScript={actions.handleSaveScript}
            onManualRefresh={actions.handleManualRefresh}
            courseId={courseId}
            videoId={videoId}
            navigate={navigate}
          />

          <AudioStepCard
            video={video}
            scenes={v.scenes}
            hasAudio={v.hasAudio}
            isApproved={v.isApproved}
            isProcessing={v.isProcessing}
            audioState={v.audioState}
            audioSummary={v.audioSummary}
            isOpen={effectiveOpenStep === "audio"}
            onToggle={() => toggleStep("audio")}
            actionLoading={actionLoading}
            regeneratingScene={actions.regeneratingScene}
            onGenerateAudio={actions.handleGenerateAudio}
            onRegenerateAudio={actions.handleRegenerateAudio}
            onRegenerateSceneAudio={actions.handleRegenerateSceneAudio}
            onManualRefresh={actions.handleManualRefresh}
          />

          <RenderStepCard
            video={video}
            hasAudio={v.hasAudio}
            isCompleted={v.isCompleted}
            isUploading={v.isUploading}
            isProcessing={v.isProcessing}
            renderState={v.renderState}
            renderSummary={v.renderSummary}
            isOpen={effectiveOpenStep === "render"}
            onToggle={() => toggleStep("render")}
            actionLoading={actionLoading}
            onRender={actions.handleRender}
            onReRender={actions.handleReRender}
            onManualRefresh={actions.handleManualRefresh}
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
