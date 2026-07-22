import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Redo2,
  Settings,
  Pencil,
  Languages,
  Image as ImageIcon,
  ChevronRight,
  CheckCircle2,
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
import { LoadingState, EmptyState } from "../../components";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { AccordionItem } from "../../components/ui/Accordion";
import { Select } from "../../components/ui/Select";
import { Input, Textarea, NumberInput, Label } from "../../components/ui/Input";
import { cn } from "../../components/ui/cn";
import { toast } from "../../components/ui/toastBus";

const SCENE_TYPE_OPTIONS = [
  { value: "title", label: "Title" },
  { value: "content", label: "Content" },
  { value: "image", label: "Image" },
  { value: "end", label: "End" },
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

const SECTION_TONE = {
  accent: "bg-accent-subtle text-accent",
  info: "bg-info-500/10 text-info-600 dark:text-info-500",
  warning: "bg-warning-500/10 text-warning-600 dark:text-warning-500",
  success: "bg-success-500/10 text-success-600 dark:text-success-500",
};

const SectionLabel = ({ icon: Icon, tone, children }) => (
  <div className="mb-3 flex items-center gap-2">
    <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-[7px]", SECTION_TONE[tone])}>
      <Icon className="size-3.5" />
    </span>
    <h4 className="text-[13px] font-semibold text-text-primary">{children}</h4>
  </div>
);

const Field = ({ label, children }) => (
  <div>
    <Label>{label}</Label>
    {children}
  </div>
);

const StudioPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const jobId = searchParams.get("id");

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rerendering, setRerendering] = useState(false);
  const [approving, setApproving] = useState(false);
  const [socketStatus, setSocketStatus] = useState(() => (isConnected() ? "connected" : "disconnected"));
  const [editedScenes, setEditedScenes] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const videoRef = useRef(null);

  const sceneTimeline = useMemo(() => {
    return editedScenes.reduce((acc, scene) => {
      const start = acc.length ? acc[acc.length - 1].endTime : 0;
      const end = start + (scene.duration || 8);
      acc.push({ ...scene, startTime: start, endTime: end });
      return acc;
    }, []);
  }, [editedScenes]);

  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    try {
      setLoading(true);
      const res = await getVideoJob(jobId);
      setJob(res.data.job);
      setEditedScenes(res.data.job.script?.scenes || []);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to fetch job");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  const handleSceneChange = (index, field, value) => {
    const updated = [...editedScenes];
    updated[index] = { ...updated[index], [field]: value };
    setEditedScenes(updated);
    setHasChanges(true);
  };

  const handleAudioTextChange = (index, value) => {
    const updated = [...editedScenes];
    updated[index] = { ...updated[index], audio: { ...updated[index].audio, text: value } };
    setEditedScenes(updated);
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
        toast.success("Re-render completed!");
      }
    });
    const unsubFailed = onJobFailed((data) => {
      if (data.jobId === jobId) {
        setJob((prev) => (prev ? { ...prev, status: "FAILED", error: data.error } : prev));
        toast.error("Re-render failed");
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

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  if (loading) return <LoadingState label="Loading studio..." />;

  if (!job) {
    return <EmptyState description="Job not found" actionLabel="Back to Dashboard" onAction={() => navigate("/")} />;
  }

  const isAwaitingApproval = job.status === "AWAITING_APPROVAL";
  const canEdit = job.status === "COMPLETED" || job.status === "FAILED" || job.status === "SCRIPT_COMPLETED" || isAwaitingApproval;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="secondary" icon={<ArrowLeft className="size-4" />} onClick={() => navigate("/")}>
          Back
        </Button>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-text-primary">
          <Pencil className="size-[18px] text-text-tertiary" /> Studio Editor — {job.topic}
        </h1>
        <Badge variant={socketStatus === "connected" ? "success" : "neutral"} dot>
          {socketStatus === "connected" ? "Live" : "Offline"}
        </Badge>
      </div>

      {/* Action Bar */}
      <Card className="mb-6 animate-slide-up p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold text-text-primary">Total Scenes:</span>
            <Badge variant="accent">{editedScenes.length}</Badge>
            <span className="text-text-tertiary">Job ID: {job._id}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" icon={<Save className="size-4" />} onClick={handleSave} loading={saving} disabled={!hasChanges || !canEdit}>
              Save Changes
            </Button>
            {isAwaitingApproval ? (
              <Button variant="primary" icon={<CheckCircle2 className="size-4" />} onClick={handleApprove} loading={approving}>
                Approve & Continue
              </Button>
            ) : (
              <Button variant="primary" icon={<Redo2 className="size-4" />} onClick={handleRerender} loading={rerendering} disabled={!canEdit}>
                Re-render
              </Button>
            )}
          </div>
        </div>
      </Card>

      {isAwaitingApproval && (
        <Alert type="info" title="Script ready for review" className="mb-6">
          Review and edit the scenes below - you can also paste a manual image URL for any image scene instead of
          waiting for AI image generation. Click "Approve & Continue" when you're ready to generate audio, images, and
          the final video.
        </Alert>
      )}

      {/* Preview */}
      {job?.videoUrl && (
        <Card className="mb-6">
          <div className="border-b border-border-light px-5 py-4">
            <h3 className="text-[15px] font-semibold text-text-primary">Preview</h3>
          </div>
          <div className="p-5">
            <div className="mx-auto w-full max-w-3xl">
              <video
                ref={videoRef}
                src={job.videoUrl}
                controls
                className="block w-full rounded-lg bg-black"
                onTimeUpdate={(e) => {
                  const time = e.target.currentTime;
                  setCurrentTime(time);
                  const sceneIndex = sceneTimeline.findIndex((s) => time >= s.startTime && time < s.endTime);
                  if (sceneIndex >= 0 && sceneIndex !== selectedSceneIndex) {
                    setSelectedSceneIndex(sceneIndex);
                  }
                }}
              />
            </div>

            {/* Scene Timeline */}
            <div className="mt-5">
              <h4 className="mb-3.5 text-[13px] font-semibold text-text-primary">Scene Timeline</h4>
              <div className="flex flex-wrap gap-2">
                {sceneTimeline.map((scene, index) => {
                  const isActive = index === selectedSceneIndex;
                  const isPast = currentTime >= scene.endTime;
                  const jump = () => {
                    setSelectedSceneIndex(index);
                    if (videoRef.current) videoRef.current.currentTime = scene.startTime;
                  };
                  return (
                    <button
                      key={index}
                      type="button"
                      aria-pressed={isActive}
                      aria-label={`Jump to scene ${scene.sceneNumber || index + 1}: ${scene.title || "Untitled"}`}
                      onClick={jump}
                      className={cn(
                        "flex min-w-38 flex-1 items-center gap-2 rounded-lg border p-3 text-left transition-colors",
                        isActive
                          ? "border-accent bg-accent-subtle"
                          : isPast
                          ? "border-border bg-surface-active opacity-70"
                          : "border-border bg-surface hover:bg-surface-hover"
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold",
                          isActive ? "bg-accent text-white" : "bg-border-light text-text-secondary"
                        )}
                      >
                        {scene.sceneNumber || index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-[13px]",
                            isActive ? "font-semibold text-accent" : "font-normal text-text-primary"
                          )}
                        >
                          {scene.title || `Scene ${scene.sceneNumber || index + 1}`}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-text-tertiary">
                          {scene.duration}s • {scene.sceneType}
                        </span>
                      </span>
                      {isActive && <ChevronRight className="size-4 shrink-0 text-accent" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Scene Editor */}
      {!canEdit && (
        <Alert type="warning" title="This job cannot be edited in its current state." className="mb-6">
          Only completed or failed jobs can be edited and re-rendered.
        </Alert>
      )}

      {editedScenes.length === 0 ? (
        <EmptyState description="No scenes found" />
      ) : (
        <div className="space-y-3">
          {editedScenes.map((scene, index) => (
            <AccordionItem
              key={index}
              defaultOpen
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant="accent">Scene {scene.sceneNumber || index + 1}</Badge>
                  <span className="font-semibold text-text-primary">{scene.title || "Untitled Scene"}</span>
                  <Badge variant={scene.sceneType === "title" ? "success" : scene.sceneType === "end" ? "danger" : "neutral"}>
                    {scene.sceneType}
                  </Badge>
                  <span className="text-text-tertiary">{scene.duration}s</span>
                </span>
              }
            >
              <div className="space-y-5 rounded-xl bg-surface-hover p-4">
                {/* Basic Info */}
                <div>
                  <SectionLabel icon={Pencil} tone="accent">
                    Basic Info
                  </SectionLabel>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field label="Scene Number">
                      <NumberInput min={1} value={scene.sceneNumber} onChange={(e) => handleSceneChange(index, "sceneNumber", Number(e.target.value))} disabled={!canEdit} />
                    </Field>
                    <Field label="Scene Type">
                      <Select value={scene.sceneType} onChange={(v) => handleSceneChange(index, "sceneType", v)} options={SCENE_TYPE_OPTIONS} disabled={!canEdit} />
                    </Field>
                    <Field label="Title">
                      <Input value={scene.title || ""} onChange={(e) => handleSceneChange(index, "title", e.target.value)} disabled={!canEdit} />
                    </Field>
                    <Field label="Subtitle">
                      <Input value={scene.subtitle || ""} onChange={(e) => handleSceneChange(index, "subtitle", e.target.value)} disabled={!canEdit} />
                    </Field>
                    <Field label="Duration (seconds)">
                      <NumberInput min={1} max={60} value={scene.duration} onChange={(e) => handleSceneChange(index, "duration", Number(e.target.value))} disabled={!canEdit} />
                    </Field>
                    <Field label="Background Color">
                      <Input value={scene.backgroundColor || ""} onChange={(e) => handleSceneChange(index, "backgroundColor", e.target.value)} disabled={!canEdit} />
                    </Field>
                  </div>
                </div>

                <div className="h-px bg-border-light" />

                {/* Animation */}
                <div>
                  <SectionLabel icon={Settings} tone="info">
                    Animation
                  </SectionLabel>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Field label="Transition">
                      <Select value={scene.transition} onChange={(v) => handleSceneChange(index, "transition", v)} options={TRANSITION_OPTIONS} disabled={!canEdit} />
                    </Field>
                    <Field label="Camera Motion">
                      <Select value={scene.cameraMotion} onChange={(v) => handleSceneChange(index, "cameraMotion", v)} options={CAMERA_OPTIONS} disabled={!canEdit} />
                    </Field>
                    <Field label="Animation">
                      <Input value={scene.animation || ""} onChange={(e) => handleSceneChange(index, "animation", e.target.value)} disabled={!canEdit} placeholder="e.g., fadeIn, slideUp" />
                    </Field>
                  </div>
                </div>

                <div className="h-px bg-border-light" />

                {/* Image */}
                <div>
                  <SectionLabel icon={ImageIcon} tone="warning">
                    Image
                  </SectionLabel>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field label="Image Prompt">
                      <Textarea rows={2} value={scene.imagePrompt || ""} onChange={(e) => handleSceneChange(index, "imagePrompt", e.target.value)} disabled={!canEdit} placeholder="AI image generation prompt (only for image scenes)" />
                    </Field>
                    <Field label="Image URL (manual override)">
                      <Input
                        value={scene.imageUrl || ""}
                        onChange={(e) => handleSceneChange(index, "imageUrl", e.target.value)}
                        disabled={!canEdit}
                        placeholder="https://... - skips AI image generation for this scene"
                      />
                    </Field>
                  </div>
                </div>

                <div className="h-px bg-border-light" />

                {/* Audio */}
                <div>
                  <SectionLabel icon={Languages} tone="success">
                    Audio / Narration
                  </SectionLabel>
                  <Field label="Narration Text">
                    <Textarea rows={2} value={scene.audio?.text || ""} onChange={(e) => handleAudioTextChange(index, e.target.value)} disabled={!canEdit} placeholder="Text to speak in this scene" />
                  </Field>
                </div>
              </div>
            </AccordionItem>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudioPage;
