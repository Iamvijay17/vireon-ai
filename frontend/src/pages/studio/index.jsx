import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Redo2,
  CheckCircle2,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Copy,
  Trash2,
  GripVertical,
  LayoutTemplate,
  Settings,
  Image as ImageIcon,
  Languages,
} from "lucide-react";
import { getVideoJob, updateVideoScenes, rerenderVideoJob, approveVideoJob } from "../../services/api";
import {
  connect,
  joinJobRoom,
  leaveJobRoom,
  onJobProgress,
  onJobCompleted,
  onJobFailed,
  onConnect,
  onDisconnect,
  onJobStatus,
  isConnected,
} from "../../services/socket";
import { templateNames } from "vireon-remotion-templates/src/templateNames";
import { LoadingState, EmptyState } from "../../components";
import { ScenePreview } from "../../components/video/ScenePreview";
import { SceneThumbnail } from "../../components/video/SceneThumbnail";
import { useForceSidebarCollapsed } from "../../shared/sidebarContextValue";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Select } from "../../components/ui/Select";
import { Input, Textarea, NumberInput, Label } from "../../components/ui/Input";
import { cn } from "../../components/ui/cn";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";

const TEMPLATE_OPTIONS = Object.entries(templateNames).map(([value, label]) => ({ value, label }));

const SCENE_TYPE_OPTIONS = [
  { value: "intro", label: "Intro" },
  { value: "content", label: "Content" },
  { value: "image", label: "Image" },
];

const TRANSITION_OPTIONS = [
  { value: "fade", label: "Fade" },
  { value: "slide", label: "Slide" },
  { value: "zoom", label: "Zoom" },
  { value: "dissolve", label: "Dissolve" },
];

const CAMERA_OPTIONS = [
  { value: "static", label: "Static" },
  { value: "zoom-in", label: "Zoom In" },
  { value: "zoom-out", label: "Zoom Out" },
  { value: "slide", label: "Slide" },
];

const Field = ({ label, children }) => (
  <div>
    <Label>{label}</Label>
    {children}
  </div>
);

const SectionLabel = ({ icon: Icon, children }) => (
  <div className="mb-2.5 flex items-center gap-1.5 text-[13px] font-semibold text-text-primary">
    <Icon className="size-3.5 text-text-tertiary" />
    {children}
  </div>
);

const StudioPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const jobId = searchParams.get("id");

  // Full-width editor - collapse the global nav sidebar while this is open,
  // restoring whatever the user had on the way out.
  useForceSidebarCollapsed(true);

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rerendering, setRerendering] = useState(false);
  const [approving, setApproving] = useState(false);
  const [socketStatus, setSocketStatus] = useState(() => (isConnected() ? "connected" : "disconnected"));
  const [editedScenes, setEditedScenes] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  const dragIndexRef = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    try {
      setLoading(true);
      const res = await getVideoJob(jobId);
      setJob(res.data.job);
      setEditedScenes(res.data.job.script?.scenes || []);
      setHasChanges(false);
      setSelectedSceneIndex(0);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to fetch job");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  useEffect(() => {
    if (!jobId) return;
    connect();
    joinJobRoom(jobId);

    const unsubProgress = onJobProgress((data) => {
      if (data.jobId === jobId) {
        setJob((prev) => (prev ? { ...prev, progress: data.progress, status: data.status } : prev));
      }
    });
    const unsubCompleted = onJobCompleted((data) => {
      if (data.jobId === jobId) {
        setJob((prev) => (prev ? { ...prev, progress: 100, status: "COMPLETED" } : prev));
        toast.success("Render completed!");
      }
    });
    const unsubFailed = onJobFailed((data) => {
      if (data.jobId === jobId) {
        setJob((prev) => (prev ? { ...prev, status: "FAILED", error: data.error } : prev));
        toast.error("Render failed");
      }
    });
    const unsubStatus = onJobStatus((data) => {
      if (data.jobId === jobId) {
        setJob((prev) => ({ ...(prev || {}), ...data }));
      }
    });
    const unsubConnect = onConnect(() => setSocketStatus("connected"));
    const unsubDisconnect = onDisconnect(() => setSocketStatus("disconnected"));

    return () => {
      leaveJobRoom(jobId);
      unsubProgress();
      unsubCompleted();
      unsubFailed();
      unsubStatus();
      unsubConnect();
      unsubDisconnect();
    };
  }, [jobId]);

  const renumber = (list) => list.map((s, i) => ({ ...s, sceneNumber: i + 1 }));

  const updateScene = (index, updater) => {
    setEditedScenes((prev) => {
      const updated = [...prev];
      updated[index] = updater(updated[index]);
      return updated;
    });
    setHasChanges(true);
  };

  const handleFieldChange = (index, field, value) => {
    updateScene(index, (scene) => ({ ...scene, [field]: value }));
  };

  const handleAudioTextChange = (index, value) => {
    updateScene(index, (scene) => ({ ...scene, audio: { ...scene.audio, text: value } }));
  };

  const handleDuplicateScene = (index) => {
    setEditedScenes((prev) => {
      const source = prev[index];
      // A duplicate needs fresh audio/image generation, not the original's
      // pointers - the pipeline resolves each scene's real audio file purely
      // by scene number (scene{N}.mp3), so carrying over a stale audio.file
      // string here would make the worker think this new scene's audio
      // already exists and skip generating it, 404-ing at render time.
      const copy = {
        ...source,
        imageUrl: "",
        audio: { ...(source.audio || {}), file: "", duration: 0, captionTimestamps: null },
        elements: source.elements ? { ...source.elements, captionTimestamps: null } : source.elements,
      };
      const updated = [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
      return renumber(updated);
    });
    setSelectedSceneIndex(index + 1);
    setHasChanges(true);
  };

  const handleDeleteScene = async (index) => {
    if (editedScenes.length <= 1) {
      toast.error("A video needs at least one scene");
      return;
    }
    const ok = await confirmDialog({
      title: "Delete this scene?",
      content: "This only affects the draft - nothing is saved until you click Save Changes.",
      danger: true,
    });
    if (!ok) return;
    setEditedScenes((prev) => renumber(prev.filter((_, i) => i !== index)));
    setSelectedSceneIndex((i) => Math.max(0, Math.min(i, editedScenes.length - 2)));
    setHasChanges(true);
  };

  const handleDrop = (targetIndex) => {
    const fromIndex = dragIndexRef.current;
    dragIndexRef.current = null;
    setDragOverIndex(null);
    if (fromIndex == null || fromIndex === targetIndex) return;
    setEditedScenes((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(targetIndex, 0, moved);
      return renumber(updated);
    });
    setSelectedSceneIndex(targetIndex);
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!jobId) return;
    try {
      setSaving(true);
      await updateVideoScenes(jobId, editedScenes);
      setHasChanges(false);
      toast.success("Scenes saved successfully!");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to save scenes");
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
      await approveVideoJob(jobId);
      toast.success("Script approved! Generating audio, images, and video...");
      navigate(`/render?id=${jobId}`);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to approve script");
    } finally {
      setApproving(false);
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
      toast.error(err.response?.data?.error || "Failed to start re-render");
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
              Approve & Continue
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
          waiting for AI image generation. Click "Approve & Continue" when you're ready to generate audio, images, and
          the final video.
        </Alert>
      )}

      {!canEdit && !isAwaitingApproval && (
        <Alert type="warning" title="This job cannot be edited in its current state.">
          Only completed, failed, or awaiting-approval jobs can be edited and re-rendered.
        </Alert>
      )}

      {editedScenes.length === 0 ? (
        <EmptyState description="No scenes found" />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[220px_minmax(0,1fr)_340px]">
          {/* LEFT: SCENE TIMELINE */}
          <Card className="flex min-h-0 flex-col">
            <div className="flex items-center justify-between border-b border-border-light px-3.5 py-3">
              <h3 className="text-[13px] font-semibold text-text-primary">Scenes</h3>
              <span className="text-[11px] text-text-tertiary">{Math.round(totalSeconds)}s</span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
              {editedScenes.map((s, i) => {
                const isActive = i === selectedSceneIndex;
                const isDragOver = dragOverIndex === i;
                return (
                  <button
                    key={i}
                    type="button"
                    draggable={canEdit}
                    onDragStart={() => {
                      dragIndexRef.current = i;
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragOverIndex !== i) setDragOverIndex(i);
                    }}
                    onDragLeave={() => setDragOverIndex((cur) => (cur === i ? null : cur))}
                    onDrop={() => canEdit && handleDrop(i)}
                    onDragEnd={() => setDragOverIndex(null)}
                    onClick={() => setSelectedSceneIndex(i)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border p-1.5 text-left transition-colors",
                      isActive ? "border-accent bg-accent-subtle" : "border-border-light bg-surface hover:bg-surface-hover",
                      isDragOver && "ring-2 ring-accent",
                    )}
                  >
                    <GripVertical className="size-3.5 shrink-0 cursor-grab text-text-tertiary" />
                    <div className="aspect-video w-20 shrink-0 overflow-hidden rounded-md bg-black">
                      <SceneThumbnail scene={s} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate text-[11px] font-medium", isActive ? "text-accent" : "text-text-primary")}>
                        {s.sceneNumber || i + 1}. {s.title || "Untitled"}
                      </p>
                      <p className="mt-0.5 text-[10px] text-text-tertiary">{Math.round(s.duration || 8)}s</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

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

          {/* RIGHT: INSPECTOR */}
          <Card className="flex min-h-0 flex-col">
            <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
              <button
                type="button"
                onClick={() => setSelectedSceneIndex((i) => Math.max(0, i - 1))}
                disabled={selectedSceneIndex === 0}
                className="rounded-md p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary disabled:opacity-30"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-[13px] font-semibold text-text-primary">
                Scene {selectedSceneIndex + 1} of {editedScenes.length}
              </span>
              <button
                type="button"
                onClick={() => setSelectedSceneIndex((i) => Math.min(editedScenes.length - 1, i + 1))}
                disabled={selectedSceneIndex === editedScenes.length - 1}
                className="rounded-md p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary disabled:opacity-30"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              <div>
                <SectionLabel icon={LayoutTemplate}>Template</SectionLabel>
                <Select
                  value={scene.templateId}
                  onChange={(v) => handleFieldChange(selectedSceneIndex, "templateId", v)}
                  options={TEMPLATE_OPTIONS}
                  disabled={!canEdit}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Scene Number">
                  <NumberInput min={1} value={scene.sceneNumber} onChange={(e) => handleFieldChange(selectedSceneIndex, "sceneNumber", Number(e.target.value))} disabled={!canEdit} />
                </Field>
                <Field label="Scene Type">
                  <Select value={scene.sceneType} onChange={(v) => handleFieldChange(selectedSceneIndex, "sceneType", v)} options={SCENE_TYPE_OPTIONS} disabled={!canEdit} />
                </Field>
                <Field label="Title">
                  <Input value={scene.title || ""} onChange={(e) => handleFieldChange(selectedSceneIndex, "title", e.target.value)} disabled={!canEdit} />
                </Field>
                <Field label="Subtitle">
                  <Input value={scene.subtitle || ""} onChange={(e) => handleFieldChange(selectedSceneIndex, "subtitle", e.target.value)} disabled={!canEdit} />
                </Field>
                <Field label="Duration (seconds)">
                  <NumberInput min={1} max={60} value={scene.duration} onChange={(e) => handleFieldChange(selectedSceneIndex, "duration", Number(e.target.value))} disabled={!canEdit} />
                </Field>
                <Field label="Background Color">
                  <Input value={scene.backgroundColor || ""} onChange={(e) => handleFieldChange(selectedSceneIndex, "backgroundColor", e.target.value)} disabled={!canEdit} />
                </Field>
              </div>

              <div className="h-px bg-border-light" />

              <div>
                <SectionLabel icon={Settings}>Animation</SectionLabel>
                <div className="grid grid-cols-1 gap-3">
                  <Field label="Transition">
                    <Select value={scene.transition} onChange={(v) => handleFieldChange(selectedSceneIndex, "transition", v)} options={TRANSITION_OPTIONS} disabled={!canEdit} />
                  </Field>
                  <Field label="Camera Motion">
                    <Select value={scene.cameraMotion} onChange={(v) => handleFieldChange(selectedSceneIndex, "cameraMotion", v)} options={CAMERA_OPTIONS} disabled={!canEdit} />
                  </Field>
                  <Field label="Animation">
                    <Input value={scene.animation || ""} onChange={(e) => handleFieldChange(selectedSceneIndex, "animation", e.target.value)} disabled={!canEdit} placeholder="e.g., fadeIn, slideUp" />
                  </Field>
                </div>
              </div>

              <div className="h-px bg-border-light" />

              <div>
                <SectionLabel icon={ImageIcon}>Image</SectionLabel>
                <div className="space-y-3">
                  <Field label="Image Prompt">
                    <Textarea rows={2} value={scene.imagePrompt || ""} onChange={(e) => handleFieldChange(selectedSceneIndex, "imagePrompt", e.target.value)} disabled={!canEdit} placeholder="AI image generation prompt (only for image scenes)" />
                  </Field>
                  <Field label="Image URL (manual override)">
                    <Input
                      value={scene.imageUrl || ""}
                      onChange={(e) => handleFieldChange(selectedSceneIndex, "imageUrl", e.target.value)}
                      disabled={!canEdit}
                      placeholder="https://... - skips AI image generation for this scene"
                    />
                  </Field>
                </div>
              </div>

              <div className="h-px bg-border-light" />

              <div>
                <SectionLabel icon={Languages}>Audio / Narration</SectionLabel>
                <Field label="Narration Text">
                  <Textarea rows={3} value={scene.audio?.text || ""} onChange={(e) => handleAudioTextChange(selectedSceneIndex, e.target.value)} disabled={!canEdit} placeholder="Text to speak in this scene" />
                </Field>
              </div>

              <div className="flex gap-2 border-t border-border-light pt-4">
                <Button variant="secondary" size="sm" icon={<Copy className="size-3.5" />} onClick={() => handleDuplicateScene(selectedSceneIndex)} disabled={!canEdit} className="flex-1">
                  Duplicate
                </Button>
                <Button variant="danger" size="sm" icon={<Trash2 className="size-3.5" />} onClick={() => handleDeleteScene(selectedSceneIndex)} disabled={!canEdit} className="flex-1">
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default StudioPage;
