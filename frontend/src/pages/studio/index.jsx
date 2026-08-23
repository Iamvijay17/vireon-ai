import { useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Redo2, CheckCircle2, Pencil, AudioLines, Video } from "lucide-react";
import { updateVideoScenes, rerenderVideoJob, approveVideoJob, generateVideoAudio, generateVideoRender } from "../../services/api";
import { LoadingState, EmptyState } from "../../components";
import { ScenePreview } from "../../components/video/ScenePreview";
import { useForceSidebarCollapsed } from "../../shared/sidebarContextValue";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { toast } from "../../components/ui/toastBus";
import { useStudioJob } from "./useStudioJob";
import { useSceneEditor } from "./useSceneEditor";
import { SceneTimeline } from "./SceneTimeline";
import { InspectorPanel } from "./InspectorPanel";

const StudioPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const jobId = searchParams.get("id");

  // Full-width editor - collapse the global nav sidebar while this is open,
  // restoring whatever the user had on the way out.
  useForceSidebarCollapsed(true);

  const editor = useSceneEditor(jobId);
  const { job, setJob, loading, socketStatus } = useStudioJob(jobId, editor.resetScenes);

  const [saving, setSaving] = useState(false);
  const [rerendering, setRerendering] = useState(false);
  const [approving, setApproving] = useState(false);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [generatingRender, setGeneratingRender] = useState(false);
  const [inspectorTab, setInspectorTab] = useState("content");

  const { editedScenes, hasChanges, setHasChanges, selectedSceneIndex, setSelectedSceneIndex } = editor;

  const handleSave = async () => {
    if (!jobId) return;
    try {
      setSaving(true);
      await updateVideoScenes(jobId, editedScenes);
      setHasChanges(false);
      toast.success("Scenes saved successfully!");
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to save scenes");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!jobId) return;
    try {
      setApproving(true);
      if (hasChanges) {
        await updateVideoScenes(jobId, editedScenes);
        setHasChanges(false);
      }
      const res = await approveVideoJob(jobId);
      if (job?.fastGeneration === false) {
        setJob((prev) => (prev ? { ...prev, status: res.data.status, progress: res.data.progress } : prev));
        toast.success("Script approved! Click \"Generate Audio\" when you're ready for the next step.");
      } else {
        toast.success("Script approved! Generating audio, images, and video...");
        navigate(`/render?id=${jobId}`);
      }
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to approve script");
    } finally {
      setApproving(false);
    }
  };

  const handleGenerateAudio = async () => {
    if (!jobId) return;
    try {
      setGeneratingAudio(true);
      await generateVideoAudio(jobId);
      toast.success("Audio generation started!");
      navigate(`/render?id=${jobId}`);
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to start audio generation");
    } finally {
      setGeneratingAudio(false);
    }
  };

  const handleGenerateRender = async () => {
    if (!jobId) return;
    try {
      setGeneratingRender(true);
      await generateVideoRender(jobId);
      toast.success("Rendering started!");
      navigate(`/render?id=${jobId}`);
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to start rendering");
    } finally {
      setGeneratingRender(false);
    }
  };

  const handleRerender = async () => {
    if (!jobId) return;
    try {
      setRerendering(true);
      await rerenderVideoJob(jobId);
      toast.success("Re-render started!");
      navigate(`/render?id=${jobId}`);
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to start re-render");
    } finally {
      setRerendering(false);
    }
  };

  const totalSeconds = useMemo(
    () => editedScenes.reduce((sum, s) => sum + (s.duration || 8), 0),
    [editedScenes],
  );

  if (loading) return <LoadingState label="Loading studio..." />;

  if (!job) {
    return <EmptyState description="Job not found" actionLabel="Back to Dashboard" onAction={() => navigate("/")} />;
  }

  const isAwaitingApproval = job.status === "AWAITING_APPROVAL";
  // Manual mode (fastGeneration: false) pauses twice more after approval -
  // once with the script approved and waiting for "Generate Audio", once
  // with audio ready and waiting for "Generate Render" - mirroring the
  // course-video pipeline's separate script/audio/render steps.
  const isManual = job.fastGeneration === false;
  const isAwaitingAudioTrigger = isManual && job.status === "SCRIPT_COMPLETED";
  const isAwaitingRenderTrigger = isManual && job.status === "AUDIO_COMPLETED";
  const canEdit = job.status === "COMPLETED" || job.status === "FAILED" || job.status === "SCRIPT_COMPLETED" || isAwaitingApproval;
  const scene = editedScenes[selectedSceneIndex];

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[560px] flex-col gap-3">
      {/* TOOLBAR */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" icon={<ArrowLeft className="size-4" />} onClick={() => navigate("/")}>
            Back
          </Button>
          <h1 className="flex items-center gap-2 truncate text-lg font-semibold tracking-tight text-text-primary">
            <Pencil className="size-[18px] text-text-tertiary" /> {job.topic}
          </h1>
          <Badge variant={socketStatus === "connected" ? "success" : "neutral"} dot>
            {socketStatus === "connected" ? "Live" : "Offline"}
          </Badge>
          {hasChanges && <Badge variant="warning">Unsaved changes</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={<Save className="size-4" />} onClick={handleSave} loading={saving} disabled={!hasChanges || !canEdit}>
            Save Changes
          </Button>
          {isAwaitingApproval ? (
            <Button variant="primary" size="sm" icon={<CheckCircle2 className="size-4" />} onClick={handleApprove} loading={approving}>
              {isManual ? "Approve Script" : "Approve & Continue"}
            </Button>
          ) : isAwaitingAudioTrigger ? (
            <Button variant="primary" size="sm" icon={<AudioLines className="size-4" />} onClick={handleGenerateAudio} loading={generatingAudio}>
              Generate Audio
            </Button>
          ) : isAwaitingRenderTrigger ? (
            <Button variant="primary" size="sm" icon={<Video className="size-4" />} onClick={handleGenerateRender} loading={generatingRender}>
              Generate Render
            </Button>
          ) : (
            <Button variant="primary" size="sm" icon={<Redo2 className="size-4" />} onClick={handleRerender} loading={rerendering} disabled={!canEdit}>
              Re-render
            </Button>
          )}
        </div>
      </div>

      {isAwaitingApproval && (
        <Alert type="info" title="Script ready for review">
          Review and edit the scenes below - you can also paste a manual image URL for any image scene instead of
          waiting for AI image generation.{" "}
          {isManual
            ? 'Click "Approve Script" when ready - you\'ll then trigger audio and rendering separately.'
            : 'Click "Approve & Continue" when you\'re ready to generate audio, images, and the final video.'}
        </Alert>
      )}

      {isAwaitingAudioTrigger && (
        <Alert type="info" title="Script approved">
          Click "Generate Audio" when you're ready to generate the voiceover for each scene.
        </Alert>
      )}

      {isAwaitingRenderTrigger && (
        <Alert type="info" title="Audio ready">
          Click "Generate Render" when you're ready to generate images (if any) and produce the final video.
        </Alert>
      )}

      {!canEdit && !isAwaitingApproval && !isAwaitingAudioTrigger && !isAwaitingRenderTrigger && (
        <Alert type="warning" title="This job cannot be edited in its current state.">
          Only completed, failed, or awaiting-approval jobs can be edited and re-rendered.
        </Alert>
      )}

      {editedScenes.length === 0 ? (
        <EmptyState description="No scenes found" />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[220px_minmax(0,1fr)_340px]">
          <SceneTimeline
            editedScenes={editedScenes}
            selectedSceneIndex={selectedSceneIndex}
            setSelectedSceneIndex={setSelectedSceneIndex}
            totalSeconds={totalSeconds}
            canEdit={canEdit}
            dragIndexRef={editor.dragIndexRef}
            dragOverIndex={editor.dragOverIndex}
            setDragOverIndex={editor.setDragOverIndex}
            onDrop={editor.handleDrop}
          />

          {/* CENTER: LIVE PREVIEW */}
          <Card className="flex min-h-0 flex-col overflow-hidden">
            <div className="flex flex-1 flex-col justify-center p-4">
              <ScenePreview
                scenes={editedScenes}
                focusIndex={selectedSceneIndex}
                onActiveSceneChange={setSelectedSceneIndex}
                hideChips
                videoId={jobId}
              />
            </div>
          </Card>

          <InspectorPanel
            scene={scene}
            selectedSceneIndex={selectedSceneIndex}
            setSelectedSceneIndex={setSelectedSceneIndex}
            sceneCount={editedScenes.length}
            canEdit={canEdit}
            editor={editor}
            inspectorTab={inspectorTab}
            setInspectorTab={setInspectorTab}
          />
        </div>
      )}
    </div>
  );
};

export default StudioPage;
