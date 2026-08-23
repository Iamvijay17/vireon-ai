import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Redo2, Square, Pencil, Copy, Settings2 } from "lucide-react";
import {
  getVideoJob,
  updateVideoJob,
  restartVideoJob,
  regenerateVideoJobScript,
  rerenderVideoJob,
  stopVideoJob,
  generateVideoAudio,
  generateVideoRender,
  regenerateVideoSceneAudio,
  getVoices,
} from "../../services/api";
import { LoadingState, ErrorState } from "../../components";
import RenderQueue from "./RenderQueue";
import { Card, CardHeader } from "../../components/ui/Card";
import { Timeline } from "../../components/ui/Timeline";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { DescriptionList } from "../../components/ui/DescriptionList";
import { Tooltip } from "../../components/ui/Tooltip";
import { useFavoriteVoices } from "../../shared/useFavoriteVoices";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";
import { STEP_ORDER, BUSY_STATUSES, FALLBACK_VOICES } from "./constants";
import { useActivityLog } from "./useActivityLog";
import { useJobSocket } from "./useJobSocket";
import { PipelineActionsCard } from "./PipelineActionsCard";
import { ProgressCard } from "./ProgressCard";
import { SceneAudioCard } from "./SceneAudioCard";
import { VideoPlayerCard } from "./VideoPlayerCard";
import { EditDetailsModal } from "./EditDetailsModal";

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
  const [generateAudioLoading, setGenerateAudioLoading] = useState(false);
  const [generateRenderLoading, setGenerateRenderLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [voiceCatalog, setVoiceCatalog] = useState({ custom: [], clone: [] });
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");
  const { isFavorite, toggleFavorite } = useFavoriteVoices();

  const videoRef = useRef(null);

  const { activityLog, fetchActivityLogs } = useActivityLog();

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

  const socketStatus = useJobSocket(jobId, fetchJob, fetchActivityLogs, setJob, setLoading);

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

  const handleGenerateAudio = async () => {
    if (!jobId) return;
    try {
      setGenerateAudioLoading(true);
      await generateVideoAudio(jobId);
      toast.success("Audio generation started");
      fetchJob();
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to generate audio");
    } finally {
      setGenerateAudioLoading(false);
    }
  };

  const handleGenerateRender = async () => {
    if (!jobId) return;
    try {
      setGenerateRenderLoading(true);
      await generateVideoRender(jobId);
      toast.success("Render started");
      fetchJob();
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to start render");
    } finally {
      setGenerateRenderLoading(false);
    }
  };

  const openEditModal = () => {
    if (!job) return;
    setEditForm({
      topic: job.topic || "",
      duration: job.duration,
      language: job.language || "english",
      resolution: job.resolution || "1920x1080",
      voice: job.voice || "",
      hostVoice: job.hostVoice || "",
      guestVoice: job.guestVoice || "",
      hostName: job.hostName || "",
      guestName: job.guestName || "",
    });
    setEditError("");
    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!jobId || !editForm) return;
    if (!editForm.topic.trim() || editForm.topic.trim().length < 3) {
      setEditError("Topic must be at least 3 characters");
      return;
    }
    if (job?.type === "podcast" && (!editForm.hostVoice || !editForm.guestVoice)) {
      setEditError("Host and guest voice are both required for podcasts");
      return;
    }
    try {
      setEditSubmitting(true);
      const payload =
        job?.type === "podcast"
          ? {
              topic: editForm.topic.trim(),
              duration: editForm.duration,
              language: editForm.language,
              resolution: editForm.resolution,
              hostVoice: editForm.hostVoice,
              guestVoice: editForm.guestVoice,
              hostName: editForm.hostName,
              guestName: editForm.guestName,
            }
          : {
              topic: editForm.topic.trim(),
              duration: editForm.duration,
              language: editForm.language,
              resolution: editForm.resolution,
              voice: editForm.voice,
            };
      await updateVideoJob(jobId, payload);
      toast.success("Job details updated");
      setEditModalOpen(false);
      fetchJob();
    } catch (err) {
      setEditError(err.friendlyMessage || "Failed to update job details");
    } finally {
      setEditSubmitting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    getVoices()
      .then((res) => {
        if (!cancelled) setVoiceCatalog(res.data || { custom: [], clone: [] });
      })
      .catch(() => {
        // Keep FALLBACK_VOICES if the catalog can't be loaded.
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const isBusy = BUSY_STATUSES.includes(job?.status);
  const canEditDetails = Boolean(job) && !isBusy;
  const editDisabledReason = isBusy ? `Job is actively processing (${job.status.replace(/_/g, " ").toLowerCase()}) - wait for it to finish or pause.` : undefined;

  // Per-stage pipeline actions, always shown (disabled + a reason when not
  // eligible) rather than appearing/disappearing, so the whole flow reads
  // clearly top to bottom - mirrors the course-video pipeline's per-stage
  // buttons.
  const canRegenerateScript = hasScript && !isActive && !isCancelled;
  const scriptStageReason = !hasScript
    ? "The script hasn't been generated yet"
    : !canRegenerateScript
    ? isCancelled
      ? "Job was stopped - use Restart Job instead"
      : "Job is currently active"
    : undefined;

  const approvalStageReason = showReviewScript
    ? undefined
    : !hasScript
    ? "No script to review yet"
    : STEP_ORDER.indexOf(job?.status) > STEP_ORDER.indexOf("AWAITING_APPROVAL")
    ? "Already approved"
    : "Not ready for review yet";

  const audioStageReason = job?.fastGeneration
    ? "Runs automatically after approval (Fast Generation is on)"
    : showGenerateAudio
    ? undefined
    : job?.status === "AUDIO_COMPLETED" || STEP_ORDER.indexOf(job?.status) > STEP_ORDER.indexOf("AUDIO_COMPLETED")
    ? "Audio already generated - regenerate individual scenes below"
    : "Approve the script first";

  const canReRenderComplete = isComplete;
  const renderStageReason = job?.fastGeneration
    ? "Runs automatically after approval (Fast Generation is on)"
    : showGenerateRender
    ? undefined
    : canReRenderComplete
    ? undefined
    : "Generate audio first";

  const voiceOptions = [
    ...voiceCatalog.custom.map((v) => ({ value: v.id, label: v.label, description: "Custom", previewUrl: v.previewUrl })),
    ...voiceCatalog.clone.map((v) => ({ value: v.id, label: v.label, description: "Clone", previewUrl: v.previewUrl })),
  ];
  if (voiceOptions.length === 0) voiceOptions.push(...FALLBACK_VOICES);

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
        <Tooltip content={editDisabledReason || "Edit topic, duration, language, voice, or resolution"}>
          <Button variant="secondary" icon={<Settings2 className="size-4" />} disabled={!canEditDetails} onClick={openEditModal}>
            Edit Details
          </Button>
        </Tooltip>
        {(showGenericStudio || isComplete) && (
          <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => navigate(`/studio?id=${jobId}`)}>
            {isComplete ? "Studio Editor" : "Open Studio"}
          </Button>
        )}
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
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">{job?.topic || "Render Progress"}</h1>
        <span className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-text-secondary">
          <span className={`size-2 rounded-full ${socketDotCls[socketStatus]}`} />
          {socketLabel[socketStatus]}
        </span>
      </div>

      <PipelineActionsCard
        hasScript={hasScript}
        canRegenerateScript={canRegenerateScript}
        scriptStageReason={scriptStageReason}
        regenerateScriptLoading={regenerateScriptLoading}
        onRegenerateScript={handleRegenerateScript}
        showReviewScript={showReviewScript}
        approvalStageReason={approvalStageReason}
        onReviewApprove={() => navigate(`/studio?id=${jobId}`)}
        showGenerateAudio={showGenerateAudio}
        audioStageReason={audioStageReason}
        generateAudioLoading={generateAudioLoading}
        onGenerateAudio={handleGenerateAudio}
        showGenerateRender={showGenerateRender}
        canReRenderComplete={canReRenderComplete}
        renderStageReason={renderStageReason}
        generateRenderLoading={generateRenderLoading}
        rerenderLoading={rerenderLoading}
        onGenerateOrRerender={showGenerateRender ? handleGenerateRender : handleRerender}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Left Column - primary progress + output */}
        <div className="flex flex-col gap-4">
          <ProgressCard
            job={job}
            currentStepIndex={currentStepIndex}
            isComplete={isComplete}
            isFailed={isFailed}
            isCancelled={isCancelled}
            isActive={isActive}
          />

          {job?.script?.scenes?.length > 0 && (
            <SceneAudioCard
              job={job}
              isActive={isActive}
              regeneratingScene={regeneratingScene}
              onRegenerateScene={handleRegenerateScene}
            />
          )}

          {isComplete && job?.videoUrl && <VideoPlayerCard job={job} videoRef={videoRef} />}
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

      <EditDetailsModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        job={job}
        editForm={editForm}
        setEditForm={setEditForm}
        editError={editError}
        editSubmitting={editSubmitting}
        onSave={handleSaveEdit}
        voiceOptions={voiceOptions}
        isFavorite={isFavorite}
        toggleFavorite={toggleFavorite}
      />
    </div>
  );
};

export default RenderPage;
