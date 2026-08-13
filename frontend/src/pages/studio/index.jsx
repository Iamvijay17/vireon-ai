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
  AudioLines,
  Video,
  Palette,
  Plus,
  X,
  ArrowUp,
  ArrowDown,
  ListChecks,
} from "lucide-react";
import { getVideoJob, updateVideoScenes, rerenderVideoJob, approveVideoJob, generateVideoAudio, generateVideoRender, remapSceneElementsForTemplate } from "../../services/api";
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
import { TemplatePickerModal } from "../../components/video/TemplatePickerModal";
import { useForceSidebarCollapsed } from "../../shared/sidebarContextValue";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Select } from "../../components/ui/Select";
import { Input, Textarea, NumberInput, Label } from "../../components/ui/Input";
import { ColorInput } from "../../components/ui/ColorInput";
import { cn } from "../../components/ui/cn";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";

const SCENE_TYPE_OPTIONS = [
  { value: "intro", label: "Intro" },
  { value: "content", label: "Content" },
  { value: "contentwithimage", label: "Content + Image" },
  { value: "image", label: "Image" },
];

// Templates standardized on `elements.items: [{ heading?, text? }]` - keep in
// sync with STANDARDIZED_ITEMS_TEMPLATE_IDS in backend/src/controllers/sceneController.js.
const ITEMS_EDITABLE_TEMPLATE_IDS = ["template-004", "template-009", "template-013", "template-015", "template-032", "template-037", "template-038"];

const FONT_WEIGHT_OPTIONS = [
  { value: 300, label: "Light" },
  { value: 400, label: "Regular" },
  { value: 700, label: "Bold" },
];

const FONT_FAMILY_OPTIONS = [
  { value: "'Helvetica Neue', Helvetica, Arial, sans-serif", label: "Helvetica" },
  { value: "Georgia, 'Times New Roman', serif", label: "Georgia (serif)" },
  { value: "'Courier New', Courier, monospace", label: "Courier (mono)" },
  { value: "Verdana, Geneva, sans-serif", label: "Verdana" },
  { value: "'Trebuchet MS', sans-serif", label: "Trebuchet" },
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
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [generatingRender, setGeneratingRender] = useState(false);
  const [socketStatus, setSocketStatus] = useState(() => (isConnected() ? "connected" : "disconnected"));
  const [editedScenes, setEditedScenes] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  const dragIndexRef = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [remappingTemplate, setRemappingTemplate] = useState(false);

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
      toast.error(err.friendlyMessage || "Failed to fetch job");
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

  // Writes into scene.elements.styleConfig.<role> (or a flat key like
  // "accentColor" when path has no "."), matching the mergeStyle({...theme,
  // ...override}) pattern templates read via `elements.styleConfig` -
  // see backend/remotion/src/theme.js and CaptionRenderer.jsx's identical
  // {...defaultCaptionConfig, ...styleConfig} merge. No backend change is
  // needed: `elements` is a schema-less Mixed field and scenes save as a
  // full array replace.
  const handleElementFieldChange = (index, path, value) => {
    updateScene(index, (scene) => {
      const styleConfig = { ...(scene.elements?.styleConfig || {}) };
      if (path.includes(".")) {
        const [role, prop] = path.split(".");
        styleConfig[role] = { ...(styleConfig[role] || {}), [prop]: value };
      } else {
        styleConfig[path] = value;
      }
      return { ...scene, elements: { ...(scene.elements || {}), styleConfig } };
    });
  };

  // Applies one style key (e.g. textAlign, fontFamily) to both the title and
  // subtitle roles at once - a single "Text Position"/"Font" control reads
  // more naturally than two separate title/subtitle pickers, and mergeStyle
  // on the template side already accepts any style key passed through
  // overrides.title/subtitle, so no template change is needed for this.
  const handleTextStyleFieldChange = (index, key, value) => {
    updateScene(index, (scene) => {
      const styleConfig = { ...(scene.elements?.styleConfig || {}) };
      styleConfig.title = { ...(styleConfig.title || {}), [key]: value };
      styleConfig.subtitle = { ...(styleConfig.subtitle || {}), [key]: value };
      return { ...scene, elements: { ...(scene.elements || {}), styleConfig } };
    });
  };

  // Writes a flat key directly onto scene.elements (not nested under
  // styleConfig) - for fields templates read straight off `elements`, like
  // `elements.backgroundColor`/`elements.title`/`elements.subtitle`. The
  // "Title"/"Subtitle"/"Background Color" fields below only used to write
  // the top-level scene.title/subtitle/backgroundColor, which most templates
  // don't actually render from (they read scene.elements.* instead) - this
  // keeps both in sync.
  const handleElementDirectFieldChange = (index, field, value) => {
    updateScene(index, (scene) => ({ ...scene, elements: { ...(scene.elements || {}), [field]: value } }));
  };

  // Switching templates used to just swap templateId and leave the old
  // template's `elements` in place, so the new template rendered with
  // missing/mismatched fields (see remap-template endpoint's doc comment).
  // Sets templateId immediately for responsive UI, then replaces `elements`
  // once the server computes the new template's expected shape.
  const handleTemplateSelect = async (index, templateId) => {
    const scene = editedScenes[index];
    handleFieldChange(index, "templateId", templateId);
    if (!jobId || !scene) return;
    setRemappingTemplate(true);
    try {
      const res = await remapSceneElementsForTemplate(jobId, scene.sceneNumber, templateId, scene);
      updateScene(index, (s) => ({ ...s, elements: res.data.elements }));
    } catch (err) {
      toast.error(err.friendlyMessage || "Couldn't adapt scene content to the new template - you may need to re-enter some fields.");
    } finally {
      setRemappingTemplate(false);
    }
  };

  // Generic editor for `elements.items: [{ heading?, text? }]` - the shape
  // template-004/009/013/015/032/037/038 all standardized on (see each
  // template's doc comment and ITEMS_EDITABLE_TEMPLATE_IDS below). One
  // editor covers all of them instead of a bespoke form per template.
  //
  // Scenes generated before this standardization may still only have the
  // old field name (`features` on template-015, `steps` on 013/032) - the
  // templates themselves already fall back to these, so the editor reads
  // the same fallback chain to show existing content instead of a
  // misleadingly-empty list. The first edit writes to `items`, migrating
  // the scene forward (templates prefer `items` when both are present).
  const getSceneItems = (scene) => scene.elements?.items || scene.elements?.features || scene.elements?.steps || [];

  const handleItemFieldChange = (index, itemIndex, field, value) => {
    updateScene(index, (scene) => {
      const items = [...getSceneItems(scene)];
      items[itemIndex] = { ...items[itemIndex], [field]: value };
      return { ...scene, elements: { ...(scene.elements || {}), items } };
    });
  };

  const handleAddItem = (index) => {
    updateScene(index, (scene) => ({
      ...scene,
      elements: { ...(scene.elements || {}), items: [...getSceneItems(scene), { heading: "", text: "" }] },
    }));
  };

  const handleRemoveItem = (index, itemIndex) => {
    updateScene(index, (scene) => ({
      ...scene,
      elements: { ...(scene.elements || {}), items: getSceneItems(scene).filter((_, i) => i !== itemIndex) },
    }));
  };

  const handleMoveItem = (index, itemIndex, direction) => {
    updateScene(index, (scene) => {
      const items = [...getSceneItems(scene)];
      const target = itemIndex + direction;
      if (target < 0 || target >= items.length) return scene;
      [items[itemIndex], items[target]] = [items[target], items[itemIndex]];
      return { ...scene, elements: { ...(scene.elements || {}), items } };
    });
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
                onTextPositionChange={canEdit ? (role, pos) => handleElementFieldChange(selectedSceneIndex, `${role}.position`, pos) : undefined}
                onTextPositionReset={canEdit ? (role) => handleElementFieldChange(selectedSceneIndex, `${role}.position`, undefined) : undefined}
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
                <button
                  type="button"
                  onClick={() => canEdit && setTemplatePickerOpen(true)}
                  disabled={!canEdit}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface p-1.5 text-left transition-colors",
                    "hover:border-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border"
                  )}
                >
                  <div className="aspect-video w-16 shrink-0 overflow-hidden rounded-md bg-black">
                    <SceneThumbnail scene={scene} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-text-primary">
                      {templateNames[scene.templateId] || scene.templateId || "Choose a template"}
                    </p>
                    <p className="text-[11px] text-text-tertiary">Click to preview &amp; choose</p>
                  </div>
                </button>
                <TemplatePickerModal
                  open={templatePickerOpen}
                  onClose={() => setTemplatePickerOpen(false)}
                  scene={scene}
                  value={scene.templateId}
                  onSelect={(id) => handleTemplateSelect(selectedSceneIndex, id)}
                />
                {remappingTemplate && <p className="mt-1.5 text-[11px] text-text-tertiary">Adapting scene content to the new template...</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Scene Number">
                  <NumberInput min={1} value={scene.sceneNumber} onChange={(e) => handleFieldChange(selectedSceneIndex, "sceneNumber", Number(e.target.value))} disabled={!canEdit} />
                </Field>
                <Field label="Scene Type">
                  <Select value={scene.sceneType} onChange={(v) => handleFieldChange(selectedSceneIndex, "sceneType", v)} options={SCENE_TYPE_OPTIONS} disabled={!canEdit} />
                </Field>
                <Field label="Title">
                  <Input
                    value={scene.title || ""}
                    onChange={(e) => {
                      handleFieldChange(selectedSceneIndex, "title", e.target.value);
                      handleElementDirectFieldChange(selectedSceneIndex, "title", e.target.value);
                    }}
                    disabled={!canEdit}
                  />
                </Field>
                <Field label="Subtitle">
                  <Input
                    value={scene.subtitle || ""}
                    onChange={(e) => {
                      handleFieldChange(selectedSceneIndex, "subtitle", e.target.value);
                      handleElementDirectFieldChange(selectedSceneIndex, "subtitle", e.target.value);
                    }}
                    disabled={!canEdit}
                  />
                </Field>
                <Field label="Duration (seconds)">
                  <NumberInput min={1} max={60} value={scene.duration} onChange={(e) => handleFieldChange(selectedSceneIndex, "duration", Number(e.target.value))} disabled={!canEdit} />
                </Field>
                <Field label="Background Color">
                  <ColorInput
                    value={scene.backgroundColor}
                    onChange={(v) => {
                      handleFieldChange(selectedSceneIndex, "backgroundColor", v);
                      handleElementDirectFieldChange(selectedSceneIndex, "backgroundColor", v);
                    }}
                    disabled={!canEdit}
                  />
                </Field>
              </div>

              <div className="h-px bg-border-light" />

              <div>
                <SectionLabel icon={ListChecks}>Content Items</SectionLabel>
                {ITEMS_EDITABLE_TEMPLATE_IDS.includes(scene.templateId) ? (
                  <div className="space-y-2.5">
                    {getSceneItems(scene).map((item, itemIndex) => (
                      <div key={itemIndex} className="rounded-lg border border-border-light bg-surface p-2.5">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[11px] font-medium text-text-tertiary">Item {itemIndex + 1}</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveItem(selectedSceneIndex, itemIndex, -1)}
                              disabled={!canEdit || itemIndex === 0}
                              className="rounded p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary disabled:opacity-30"
                            >
                              <ArrowUp className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveItem(selectedSceneIndex, itemIndex, 1)}
                              disabled={!canEdit || itemIndex === getSceneItems(scene).length - 1}
                              className="rounded p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary disabled:opacity-30"
                            >
                              <ArrowDown className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(selectedSceneIndex, itemIndex)}
                              disabled={!canEdit}
                              className="rounded p-1 text-text-tertiary hover:bg-danger-500/10 hover:text-danger-500 disabled:opacity-30"
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {/* Falls back to older per-item field names (title/value on
                              not-yet-migrated items) for display only - onChange always
                              writes the canonical heading/text keys. */}
                          <Input
                            value={item.heading ?? item.title ?? item.value ?? ""}
                            onChange={(e) => handleItemFieldChange(selectedSceneIndex, itemIndex, "heading", e.target.value)}
                            disabled={!canEdit}
                            placeholder="Heading (optional)"
                          />
                          <Textarea
                            rows={2}
                            value={item.text ?? item.description ?? item.label ?? ""}
                            onChange={(e) => handleItemFieldChange(selectedSceneIndex, itemIndex, "text", e.target.value)}
                            disabled={!canEdit}
                            placeholder="Text"
                          />
                        </div>
                      </div>
                    ))}
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Plus className="size-3.5" />}
                      onClick={() => handleAddItem(selectedSceneIndex)}
                      disabled={!canEdit}
                      className="w-full"
                    >
                      Add Item
                    </Button>
                  </div>
                ) : (
                  <p className="text-[12px] text-text-tertiary">Content-item editing not available for this template.</p>
                )}
              </div>

              <div className="h-px bg-border-light" />

              <div>
                <SectionLabel icon={Palette}>Template Style</SectionLabel>
                <div className="space-y-3">
                  <p className="text-[11px] text-text-tertiary">
                    Drag the title/subtitle directly in the preview above to reposition. A reset icon appears on a text box once it's been moved.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Font Family">
                      <Select
                        value={scene.elements?.styleConfig?.title?.fontFamily ?? FONT_FAMILY_OPTIONS[0].value}
                        onChange={(v) => handleTextStyleFieldChange(selectedSceneIndex, "fontFamily", v)}
                        options={FONT_FAMILY_OPTIONS}
                        disabled={!canEdit}
                      />
                    </Field>
                    <Field label="Title Weight">
                      <Select
                        value={scene.elements?.styleConfig?.title?.fontWeight ?? 300}
                        onChange={(v) => handleElementFieldChange(selectedSceneIndex, "title.fontWeight", v)}
                        options={FONT_WEIGHT_OPTIONS}
                        disabled={!canEdit}
                      />
                    </Field>
                  </div>
                  <Field label="Title Size">
                    <NumberInput
                      min={24}
                      max={96}
                      value={scene.elements?.styleConfig?.title?.fontSize ?? ""}
                      onChange={(e) => handleElementFieldChange(selectedSceneIndex, "title.fontSize", Number(e.target.value))}
                      disabled={!canEdit}
                    />
                  </Field>
                  <Field label="Title Color">
                    <ColorInput
                      value={scene.elements?.styleConfig?.title?.color || "#ffffff"}
                      onChange={(v) => handleElementFieldChange(selectedSceneIndex, "title.color", v)}
                      disabled={!canEdit}
                    />
                  </Field>
                  <Field label="Subtitle Color">
                    <ColorInput
                      value={scene.elements?.styleConfig?.subtitle?.color || "#94a3b8"}
                      onChange={(v) => handleElementFieldChange(selectedSceneIndex, "subtitle.color", v)}
                      disabled={!canEdit}
                    />
                  </Field>
                  <Field label="Accent Color">
                    <ColorInput
                      value={scene.elements?.styleConfig?.accentColor || "#60a5fa"}
                      onChange={(v) => handleElementFieldChange(selectedSceneIndex, "accentColor", v)}
                      disabled={!canEdit}
                    />
                  </Field>
                  <div className="h-px bg-border-light" />
                  <p className="text-[11px] font-medium text-text-tertiary">Captions</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Text Color">
                      <ColorInput
                        value={scene.elements?.styleConfig?.captions?.textColor || "#ffffff"}
                        onChange={(v) => handleElementFieldChange(selectedSceneIndex, "captions.textColor", v)}
                        disabled={!canEdit}
                      />
                    </Field>
                    <Field label="Caption Size">
                      <NumberInput
                        min={16}
                        max={64}
                        value={scene.elements?.styleConfig?.captions?.fontSize ?? ""}
                        onChange={(e) => handleElementFieldChange(selectedSceneIndex, "captions.fontSize", Number(e.target.value))}
                        disabled={!canEdit}
                      />
                    </Field>
                  </div>
                </div>
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
