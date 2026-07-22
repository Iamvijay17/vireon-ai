import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  ChevronLeft,
  ChevronRight,
  Copy,
  Trash2,
  GripVertical,
  LayoutTemplate,
  Palette,
  Languages,
} from "lucide-react";
import { getCourseVideo, updateCourseVideoScript } from "../../services/api";
import { templateNames } from "vireon-remotion-templates/src/templateNames";
import { LoadingState, EmptyState } from "../../components";
import { ScenePreview } from "../../components/video/ScenePreview";
import { SceneThumbnail } from "../../components/video/SceneThumbnail";
import { useForceSidebarCollapsed } from "../../shared/sidebarContextValue";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Select } from "../../components/ui/Select";
import { Input, Textarea, NumberInput, Label } from "../../components/ui/Input";
import { cn } from "../../components/ui/cn";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";

const TEMPLATE_OPTIONS = Object.entries(templateNames).map(([value, label]) => ({ value, label }));

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

const CourseVideoStudio = () => {
  const { courseId, videoId } = useParams();
  const navigate = useNavigate();

  // This is a full-width editor — give it the room by collapsing the global
  // nav sidebar for as long as this page is open, restoring it on the way out.
  useForceSidebarCollapsed(true);

  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scriptMeta, setScriptMeta] = useState(null);
  const [editedScenes, setEditedScenes] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  const dragIndexRef = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const fetchVideo = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getCourseVideo(videoId);
      const v = res.data.video || res.data;
      setVideo(v);
      try {
        const parsed = JSON.parse(v.script);
        setScriptMeta(parsed);
        setEditedScenes(parsed.scenes || []);
      } catch {
        setScriptMeta(null);
        setEditedScenes([]);
      }
      setHasChanges(false);
      setSelectedSceneIndex(0);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to load video");
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    fetchVideo();
  }, [fetchVideo]);

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
    updateScene(index, (scene) => {
      const next = { ...scene, [field]: value };
      if (field === "title" || field === "subtitle") {
        next.elements = { ...(scene.elements || {}), [field]: value };
      }
      return next;
    });
  };

  const handleImageChange = (index, value) => {
    updateScene(index, (scene) => ({ ...scene, elements: { ...(scene.elements || {}), image: value } }));
  };

  const handleAudioTextChange = (index, value) => {
    updateScene(index, (scene) => ({ ...scene, audio: { ...scene.audio, text: value } }));
  };

  const handleDuplicateScene = (index) => {
    setEditedScenes((prev) => {
      const copy = { ...prev[index], elements: { ...(prev[index].elements || {}) }, audio: { ...(prev[index].audio || {}) } };
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
      content: "This only affects the draft — nothing is saved until you click Save Changes.",
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
    try {
      setSaving(true);
      const newScript = { ...(scriptMeta || {}), scenes: editedScenes };
      await updateCourseVideoScript(videoId, JSON.stringify(newScript));
      setHasChanges(false);
      toast.success("Scenes saved. Regenerate audio and re-render to apply changes to the final video.");
      fetchVideo();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to save scenes");
    } finally {
      setSaving(false);
    }
  };

  const totalSeconds = useMemo(
    () => editedScenes.reduce((sum, s) => sum + (s.duration || 8), 0),
    [editedScenes],
  );

  if (loading) return <LoadingState label="Loading studio..." />;

  if (!video) {
    return <EmptyState description="Video not found" actionLabel="Back to course" onAction={() => navigate(`/courses/${courseId}`)} />;
  }

  const scene = editedScenes[selectedSceneIndex];

  return (
    <div className="flex h-[calc(100vh-13rem)] min-h-[520px] flex-col gap-3">
      {/* TOOLBAR */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" icon={<ArrowLeft className="size-4" />} onClick={() => navigate(`/courses/${courseId}/videos/${videoId}`)}>
            Back
          </Button>
          <h1 className="truncate text-lg font-semibold tracking-tight text-text-primary">{video.title}</h1>
          {hasChanges && <Badge variant="warning">Unsaved changes</Badge>}
        </div>
        <Button variant="primary" size="sm" icon={<Save className="size-4" />} onClick={handleSave} loading={saving} disabled={!hasChanges}>
          Save Changes
        </Button>
      </div>

      {editedScenes.length === 0 ? (
        <EmptyState description="No scenes found" />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[220px_minmax(0,1fr)_340px]">
          {/* LEFT: VERTICAL TIMELINE WITH THUMBNAILS */}
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
                    draggable
                    onDragStart={() => {
                      dragIndexRef.current = i;
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragOverIndex !== i) setDragOverIndex(i);
                    }}
                    onDragLeave={() => setDragOverIndex((cur) => (cur === i ? null : cur))}
                    onDrop={() => handleDrop(i)}
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

          {/* CENTER: CANVAS */}
          <Card className="flex min-h-0 flex-col overflow-hidden">
            <div className="flex flex-1 flex-col justify-center p-4">
              <ScenePreview
                scenes={editedScenes}
                focusIndex={selectedSceneIndex}
                onActiveSceneChange={setSelectedSceneIndex}
                hideChips
                videoId={videoId}
              />
            </div>
          </Card>

          {/* RIGHT: INSPECTOR (selected scene only) */}
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
                <Select value={scene.templateId} onChange={(v) => handleFieldChange(selectedSceneIndex, "templateId", v)} options={TEMPLATE_OPTIONS} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Title">
                  <Input value={scene.title || ""} onChange={(e) => handleFieldChange(selectedSceneIndex, "title", e.target.value)} />
                </Field>
                <Field label="Subtitle">
                  <Input value={scene.subtitle || ""} onChange={(e) => handleFieldChange(selectedSceneIndex, "subtitle", e.target.value)} />
                </Field>
                <Field label="Duration (s)">
                  <NumberInput min={1} max={60} value={scene.duration} onChange={(e) => handleFieldChange(selectedSceneIndex, "duration", Number(e.target.value))} />
                </Field>
                <Field label="Background">
                  <Input value={scene.backgroundColor || ""} onChange={(e) => handleFieldChange(selectedSceneIndex, "backgroundColor", e.target.value)} />
                </Field>
              </div>

              <div>
                <SectionLabel icon={Palette}>Image</SectionLabel>
                <Input value={scene.elements?.image || ""} onChange={(e) => handleImageChange(selectedSceneIndex, e.target.value)} placeholder="https://..." />
              </div>

              <div>
                <SectionLabel icon={Languages}>Narration</SectionLabel>
                <Textarea rows={4} value={scene.audio?.text || ""} onChange={(e) => handleAudioTextChange(selectedSceneIndex, e.target.value)} placeholder="Text to speak in this scene" />
              </div>

              <div className="flex gap-2 border-t border-border-light pt-4">
                <Button variant="secondary" size="sm" icon={<Copy className="size-3.5" />} onClick={() => handleDuplicateScene(selectedSceneIndex)} className="flex-1">
                  Duplicate
                </Button>
                <Button variant="danger" size="sm" icon={<Trash2 className="size-3.5" />} onClick={() => handleDeleteScene(selectedSceneIndex)} className="flex-1">
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

export default CourseVideoStudio;
