import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  AudioLines,
  Video,
  CloudUpload,
  Zap,
  Redo2,
  PlayCircle,
  Download,
  Pencil,
  Copy,
} from "lucide-react";
import {
  getVideoJob,
  restartVideoJob,
  rerenderVideoJob,
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
import { LoadingState, EmptyState, ErrorState } from "../../components";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Steps } from "../../components/ui/Steps";
import { DescriptionList } from "../../components/ui/DescriptionList";
import { CircularProgress } from "../../components/ui/CircularProgress";
import { toast } from "../../components/ui/toastBus";

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
  const [rerenderLoading, setRerenderLoading] = useState(false);
  const [socketStatus, setSocketStatus] = useState(() => (isConnected() ? "connected" : "disconnected"));
  const [copied, setCopied] = useState(false);

  const unsubscribesRef = useRef([]);
  const videoRef = useRef(null);

  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    try {
      setLoading(true);
      const res = await getVideoJob(jobId);
      setJob(res.data.job);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to fetch job");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  const handleRestart = async () => {
    if (!jobId) return;
    try {
      setRestartLoading(true);
      await restartVideoJob(jobId);
      toast.success("Job restarted successfully");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to restart job");
    } finally {
      setRestartLoading(false);
    }
  };

  const handleRerender = async () => {
    if (!jobId) return;
    try {
      setRerenderLoading(true);
      await rerenderVideoJob(jobId);
      toast.success("Re-render started successfully");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to re-render job");
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
          }
        })
      );

      unsubscribesRef.current.push(
        onJobCompleted((data) => {
          if (data.jobId === currentJobId) {
            setJob((prev) => (prev ? { ...prev, progress: 100, status: "COMPLETED", videoUrl: data.videoUrl, thumbnailUrl: data.thumbnailUrl } : prev));
            toast.success("Video generation completed!");
          }
        })
      );

      unsubscribesRef.current.push(
        onJobFailed((data) => {
          if (data.jobId === currentJobId) {
            setJob((prev) => (prev ? { ...prev, status: "FAILED", error: data.error } : prev));
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
    [cleanup, jobId]
  );

  useEffect(() => {
    if (!jobId) {
      setLoading(false);
      return undefined;
    }

    fetchJob();
    connect();
    setupListeners(jobId);
    joinJobRoom(jobId);
    setSocketStatus(isConnected() ? "connected" : "disconnected");

    return () => {
      leaveJobRoom(jobId);
    };
  }, [jobId, fetchJob, setupListeners]);

  if (loading) return <LoadingState label="Loading job details..." />;

  if (!jobId) {
    return <EmptyState description="No job ID specified" actionLabel="Back to Dashboard" onAction={() => navigate("/")} />;
  }

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
  const isActive = !isComplete && !isFailed;

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
        {isFailed && (
          <Button variant="danger" icon={<Redo2 className="size-4" />} loading={restartLoading} onClick={handleRestart}>
            Restart Job
          </Button>
        )}
        {job?.status === "AWAITING_APPROVAL" && (
          <Button variant="primary" icon={<Pencil className="size-4" />} onClick={() => navigate(`/studio?id=${jobId}`)}>
            Review Script
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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">{job?.topic || "Render Progress"}</h1>
        <span className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-text-secondary">
          <span className={`size-2 rounded-full ${socketDotCls[socketStatus]}`} />
          {socketLabel[socketStatus]}
        </span>
      </div>

      {/* Overall Progress */}
      <Card className="mb-6 animate-slide-up p-6">
        <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-3 py-2">
            <CircularProgress percent={job?.progress || 0} error={isFailed} />
            <Badge variant={isComplete ? "success" : isFailed ? "danger" : "accent"} icon={isComplete ? <CheckCircle2 className="size-3" /> : isFailed ? <XCircle className="size-3" /> : <RefreshCw className="size-3 animate-spin" />}>
              {job?.status?.replace(/_/g, " ")}
            </Badge>
          </div>
          <DescriptionList items={details} columns={2} />
        </div>
      </Card>

      {/* Pipeline Steps */}
      <Card className="mb-6 animate-slide-up p-6" style={{ "--stagger-index": 1 }}>
        <h3 className="mb-6 text-[15px] font-semibold text-text-primary">Pipeline</h3>
        <Steps
          items={PIPELINE_STEPS}
          current={currentStepIndex >= 0 ? currentStepIndex : 0}
          status={isFailed ? "error" : isComplete ? "finish" : "process"}
        />

        {isActive && job?.currentStep && (
          <Alert type="info" className="mt-5">
            <span className="flex items-center gap-2">
              <RefreshCw className="size-3.5 animate-spin" />
              {job.currentStep.replace(/_/g, " ")}
              {job.currentScene ? ` — Scene ${job.currentScene}` : ""}
            </span>
          </Alert>
        )}

        {isFailed && job?.error && (
          <Alert type="error" className="mt-5">
            {typeof job.error === "string" ? job.error : job.error?.message || "An error occurred"}
          </Alert>
        )}

        {isComplete && (
          <Alert type="success" title="Video generation completed successfully!" className="mt-5 animate-scale-in" />
        )}
      </Card>

      {/* Per-Scene Audio Progress */}
      {job?.script?.scenes?.length > 0 && (
        <Card className="mb-6 animate-slide-up p-6" style={{ "--stagger-index": 1.5 }}>
          <h3 className="mb-4 flex items-center gap-2 text-[15px] font-semibold text-text-primary">
            <AudioLines className="size-[18px] text-accent" /> Scene Audio ({job.script.scenes.filter((s) => s.audio?.file).length}/{job.script.scenes.length})
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {job.script.scenes.map((scene) => {
              const ready = Boolean(scene.audio?.file);
              return (
                <div
                  key={scene.sceneNumber}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-[13px]"
                >
                  <span className="font-medium text-text-primary">Scene {scene.sceneNumber}</span>
                  {ready ? (
                    <span className="flex items-center gap-1 text-success-500">
                      <CheckCircle2 className="size-3.5" /> Ready
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-text-tertiary">
                      <RefreshCw className="size-3.5 animate-spin" /> Pending
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

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
              style={{ aspectRatio: job?.resolution === "9:16" ? "9/16" : "16/9" }}
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
  );
};

export default RenderPage;
