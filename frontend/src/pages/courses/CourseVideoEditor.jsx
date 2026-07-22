import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  RotateCw,
  PlayCircle,
  Pencil,
  Zap,
  Loader2,
  StepForward,
  Inbox,
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
  onCourseVideoRenderReady,
  onCourseVideoUpdated,
  onJobFailed,
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
  const [parsedScript, setParsedScript] = useState(null);
  const [socketStatus, setSocketStatus] = useState(() => (isConnected() ? "connected" : "disconnected"));
  const [workerRunning, setWorkerRunning] = useState(null); // null = unknown, boolean once checked

  const setStepLoading = (step, val) => setActionLoading((prev) => ({ ...prev, [step]: val }));

  const applyScript = (script) => {
    if (!script) {
      setParsedScript(null);
      return;
    }
    try {
      setParsedScript(JSON.parse(script));
    } catch {
      setParsedScript(null);
    }
  };

  const fetchActivityLogs = useCallback(async () => {
    try {
      const res = await getCourseVideoActivityLogs(videoId);
      setActivityLog(
        (res.data.logs || []).map((log) => ({
          text: log.text,
          time: new Date(log.timestamp).toLocaleTimeString(),
        }))
      );
    } catch {
      // Ignore errors fetching logs
    }
  }, [videoId]);

  const addActivity = (text, timestamp) => {
    setActivityLog((prev) => [
      { text, time: timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString() },
      ...prev,
    ]);
  };

  const fetchVideo = useCallback(async () => {
    try {
      const res = await getCourseVideo(videoId);
      const v = res.data.video;
      setVideo(v);
      setScriptText(v.script || "");

      if (v.script) {
        try {
          setParsedScript(JSON.parse(v.script));
        } catch {
          setParsedScript(null);
        }
      } else {
        setParsedScript(null);
      }

      addActivity(`Status: ${v.status}`, v.updatedAt);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to load video");
      navigate(`/courses/${courseId}`);
    } finally {
      setLoading(false);
    }
  }, [videoId, courseId, navigate]);

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
        setScriptText(data.script || "");
        applyScript(data.script);
        setActionLoading({});
        addActivity(data.message || "Script ready", data.updatedAt);
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

  // Poll worker liveness so the Generate/Render buttons always reflect
  // whether a job would actually get picked up right now.
  useEffect(() => {
    let cancelled = false;
    const checkWorker = () => {
      getCourseWorkerStatus()
        .then((res) => {
          if (!cancelled) setWorkerRunning(res.data.running);
        })
        .catch(() => {
          if (!cancelled) setWorkerRunning(false);
        });
    };
    checkWorker();
    const interval = setInterval(checkWorker, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
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
    setStepLoading("save", true);
    try {
      await updateCourseVideoScript(videoId, scriptText);
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

  const isProcessing = ["Generating Script", "Generating Audio", "Rendering Video", "Uploading", "Generating Scenes", "Generating Images"].includes(video?.status);
  const isUploading = video?.status === "Uploading";
  const isFailed = video?.status === "Failed";
  const isCompleted = video?.status === "Completed";
  const hasScript = video?.script && video.script.length > 0;
  const isApproved = video?.approved;
  const hasAudio = video?.audioUrl && video.audioUrl.length > 0;
  const scenes = parsedScript?.scenes || [];
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
        <div className="flex items-center gap-2">
          {isFailed && (
            <Button variant="danger" icon={<RotateCw className="size-4" />} loading={actionLoading.retry} onClick={handleRetry}>
              Retry
            </Button>
          )}
          {isProcessing && (
            <Badge variant="accent" icon={<Loader2 className="size-3 animate-spin" />}>
              {video.status}
            </Badge>
          )}
          {isCompleted && (
            <Badge variant="success" icon={<CheckCircle2 className="size-3" />}>
              Completed
            </Badge>
          )}
        </div>
      </div>

      {/* Progress Steps */}
      <Card className="mb-4 p-6">
        <Steps items={stepItems} current={Math.max(currentStep, 0)} status={isFailed ? "error" : "process"} />
      </Card>

      {/* Video Info */}
      <Card className="mb-4 p-5">
        <DescriptionList items={infoItems} columns={4} />
        {video.additionalInstructions && (
          <p className="mt-3 text-[13px] text-text-secondary">Instructions: {video.additionalInstructions}</p>
        )}
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

      {/* Processing Progress */}
      {isProcessing && (
        <Card className="mb-4 p-5">
          <div className="flex items-center gap-4">
            <Spinner size="lg" />
            <div className="flex-1">
              <p className="font-semibold text-text-primary">{video.status}</p>
              {video.renderProgress > 0 && <Progress percent={video.renderProgress} className="mt-2 max-w-52" />}
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Left Column */}
        <div className="space-y-4">
          {/* STEP 1: SCRIPT */}
          <Card>
            <CardHeader
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <StepForward className="size-4 text-text-tertiary" />
                  Step 1: Script Generation
                  {hasScript && !isApproved && <Badge variant="warning">Needs Approval</Badge>}
                  {isApproved && <Badge variant="success" icon={<CheckCircle2 className="size-3" />}>Approved</Badge>}
                  {isCompleted && <Badge variant="success" icon={<CheckCircle2 className="size-3" />}>Done</Badge>}
                </span>
              }
              extra={
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
            />
            <div className="p-5">
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
                    <div className="flex flex-col gap-2.5">
                      {scenes.map((scene, i) => (
                        <div
                          key={i}
                          className="animate-slide-up rounded-[10px] bg-surface-hover p-4"
                          style={{ "--stagger-index": i }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5">
                              <Badge variant="accent" className="mt-0.5 shrink-0">
                                Scene {scene.sceneNumber || i + 1}
                              </Badge>
                              <div>
                                <p className="font-semibold text-text-primary">{scene.title || "Untitled scene"}</p>
                                {scene.subtitle && <p className="text-[13px] text-text-secondary">{scene.subtitle}</p>}
                                {(scene.audio?.text || scene.narration) && (
                                  <p className="mt-1 max-w-lg text-[13px] text-text-tertiary">
                                    &ldquo;{scene.audio?.text || scene.narration}&rdquo;
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              {scene.sceneType && <Badge>{scene.sceneType}</Badge>}
                              {scene.duration && <span className="text-xs text-text-tertiary">{scene.duration}s</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <InlineEmpty description="Script has no scenes" />
                  )}

                  <AccordionItem title={<span className="text-[13px] text-text-tertiary">View raw script JSON</span>} ghost className="mt-3">
                    <pre className="max-h-96 overflow-auto rounded-lg border border-border-light bg-bg p-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-text-primary">
                      {(() => {
                        try {
                          return JSON.stringify(JSON.parse(video.script), null, 2);
                        } catch {
                          return video.script;
                        }
                      })()}
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
                        setScriptText(video.script);
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
            </div>
          </Card>

          {/* STEP 2: AUDIO */}
          <Card>
            <CardHeader
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <StepForward className="size-4 text-text-tertiary" />
                  Step 2: Audio Generation
                  {hasAudio && (
                    <Badge variant="success" icon={<CheckCircle2 className="size-3" />}>
                      Generated ({Math.round(video.audioDuration)}s)
                    </Badge>
                  )}
                </span>
              }
              extra={
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
            />
            <div className="p-5">
              {!isApproved && !hasAudio && <InlineEmpty description="Approve the script first to generate audio" />}
              {isApproved && !hasAudio && !isProcessing && (
                <InlineEmpty description="Audio not yet generated">
                  <Button variant="primary" size="sm" icon={<Zap className="size-3.5" />} loading={actionLoading.audio} onClick={handleGenerateAudio} className="mt-1">
                    Generate Audio
                  </Button>
                </InlineEmpty>
              )}
              {video?.status === "Generating Audio" && <InlineSpinner label="Generating audio narration..." />}
              {hasAudio && scenes.length > 0 && (
                <div>
                  <p className="mb-3 font-semibold text-text-primary">Per-Scene Audio ({scenes.length} scenes)</p>
                  <ul className="divide-y divide-border-light">
                    {scenes.map((scene, idx) => {
                      const sceneNum = scene.sceneNumber || idx + 1;
                      // After a successful cloud upload, the backend swaps
                      // scene.audio.file for the full GitHub URL in place -
                      // use it directly when present, otherwise fall back
                      // to the locally-served file.
                      const audioFile = scene.audio?.file;
                      const sceneAudioUrl = audioFile && /^https?:\/\//i.test(audioFile)
                        ? audioFile
                        : `${audioBaseUrl}/${audioFile || `scene${sceneNum}.mp3`}`;
                      const narrationText = scene.audio?.text || scene.title || "";
                      const sceneTitle = scene.title || `Scene ${sceneNum}`;
                      const sceneType = scene.sceneType || "content";
                      return (
                        <li key={idx} className="py-3 first:pt-0 last:pb-0">
                          <div className="mb-2 flex items-center gap-2">
                            <Badge>{sceneType}</Badge>
                            <span className="font-semibold text-text-primary">
                              {sceneNum}. {sceneTitle}
                            </span>
                          </div>
                          <p className="mb-2 text-xs text-text-tertiary">
                            {narrationText.substring(0, 120)}
                            {narrationText.length > 120 ? "..." : ""}
                          </p>
                          <audio controls preload="none" className="h-9 w-full">
                            <source src={sceneAudioUrl} type="audio/mpeg" />
                            Your browser does not support the audio element.
                          </audio>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {hasAudio && scenes.length === 0 && (
                <div>
                  <DescriptionList
                    items={[
                      { label: "Total Duration", value: `${Math.round(video.audioDuration)} seconds` },
                      { label: "Generated", value: video.audioGeneratedAt ? new Date(video.audioGeneratedAt).toLocaleString() : "N/A" },
                    ]}
                  />
                  {video.audioUrl && (
                    <audio controls className="mt-3 w-full" src={resolveMediaUrl(video.audioUrl)}>
                      Your browser does not support the audio element.
                    </audio>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* STEP 3: RENDER */}
          <Card>
            <CardHeader
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <StepForward className="size-4 text-text-tertiary" />
                  Step 3: Video Render
                  {isCompleted && <Badge variant="success" icon={<CheckCircle2 className="size-3" />}>Completed</Badge>}
                </span>
              }
              extra={
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
            />
            <div className="p-5">
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
            </div>
          </Card>
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