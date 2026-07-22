import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Pencil, Languages, Palette, LayoutTemplate } from "lucide-react";
import { getCourseVideo, updateCourseVideoScript } from "../../services/api";
import { templateNames } from "vireon-remotion-templates/src/templateNames";
import { LoadingState, EmptyState } from "../../components";
import { ScenePreview } from "../../components/video/ScenePreview";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { AccordionItem } from "../../components/ui/Accordion";
import { Select } from "../../components/ui/Select";
import { Input, Textarea, NumberInput, Label } from "../../components/ui/Input";
import { cn } from "../../components/ui/cn";
import { toast } from "../../components/ui/toastBus";

const TEMPLATE_OPTIONS = Object.entries(templateNames).map(([value, label]) => ({ value, label }));

const SectionLabel = ({ icon: Icon, tone, children }) => {
  const TONE_CLASS = {
    accent: "bg-accent-subtle text-accent",
    info: "bg-info-500/10 text-info-600 dark:text-info-500",
    warning: "bg-warning-500/10 text-warning-600 dark:text-warning-500",
    success: "bg-success-500/10 text-success-600 dark:text-success-500",
  };
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-[7px]", TONE_CLASS[tone])}>
        <Icon className="size-3.5" />
      </span>
      <h4 className="text-[13px] font-semibold text-text-primary">{children}</h4>
    </div>
  );
};

const Field = ({ label, children }) => (
  <div>
    <Label>{label}</Label>
    {children}
  </div>
);

const CourseVideoStudio = () => {
  const { courseId, videoId } = useParams();
  const navigate = useNavigate();

  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scriptMeta, setScriptMeta] = useState(null);
  const [editedScenes, setEditedScenes] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);

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
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to load video");
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    fetchVideo();
  }, [fetchVideo]);

  const handleFieldChange = (index, field, value) => {
    setEditedScenes((prev) => {
      const updated = [...prev];
      const scene = { ...updated[index], [field]: value };
      if (field === "title" || field === "subtitle") {
        scene.elements = { ...(scene.elements || {}), [field]: value };
      }
      updated[index] = scene;
      return updated;
    });
    setHasChanges(true);
  };

  const handleImageChange = (index, value) => {
    setEditedScenes((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], elements: { ...(updated[index].elements || {}), image: value } };
      return updated;
    });
    setHasChanges(true);
  };

  const handleAudioTextChange = (index, value) => {
    setEditedScenes((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], audio: { ...updated[index].audio, text: value } };
      return updated;
    });
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

  const previewScenes = useMemo(() => editedScenes, [editedScenes]);

  if (loading) return <LoadingState label="Loading studio..." />;

  if (!video) {
    return <EmptyState description="Video not found" actionLabel="Back to course" onAction={() => navigate(`/courses/${courseId}`)} />;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="secondary" icon={<ArrowLeft className="size-4" />} onClick={() => navigate(`/courses/${courseId}/videos/${videoId}`)}>
          Back to Editor
        </Button>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-text-primary">
          <Pencil className="size-[18px] text-text-tertiary" /> Studio — {video.title}
        </h1>
      </div>

      <Card className="mb-6 animate-slide-up p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold text-text-primary">Total Scenes:</span>
            <Badge variant="accent">{editedScenes.length}</Badge>
            {hasChanges && <Badge variant="warning">Unsaved changes</Badge>}
          </div>
          <Button variant="primary" icon={<Save className="size-4" />} onClick={handleSave} loading={saving} disabled={!hasChanges}>
            Save Changes
          </Button>
        </div>
      </Card>

      <Card className="mb-6">
        <div className="border-b border-border-light px-5 py-4">
          <h3 className="text-[15px] font-semibold text-text-primary">Live Preview</h3>
          <p className="mt-0.5 text-xs text-text-tertiary">Updates instantly as you edit below — no audio, no render.</p>
        </div>
        <div className="p-5">
          <ScenePreview
            scenes={previewScenes}
            focusIndex={selectedSceneIndex}
            onActiveSceneChange={setSelectedSceneIndex}
          />
        </div>
      </Card>

      {editedScenes.length === 0 ? (
        <EmptyState description="No scenes found" />
      ) : (
        <div className="space-y-3">
          {editedScenes.map((scene, index) => (
            <AccordionItem
              key={index}
              defaultOpen={index === selectedSceneIndex}
              title={
                <span className="flex flex-wrap items-center gap-2" onClick={() => setSelectedSceneIndex(index)}>
                  <Badge variant="accent">Scene {scene.sceneNumber || index + 1}</Badge>
                  <span className="font-semibold text-text-primary">{scene.title || "Untitled Scene"}</span>
                  <span className="text-text-tertiary">{scene.duration}s</span>
                </span>
              }
            >
              <div className="space-y-5 rounded-xl bg-surface-hover p-4">
                <div>
                  <SectionLabel icon={Pencil} tone="accent">
                    Text
                  </SectionLabel>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field label="Title">
                      <Input value={scene.title || ""} onChange={(e) => handleFieldChange(index, "title", e.target.value)} />
                    </Field>
                    <Field label="Subtitle">
                      <Input value={scene.subtitle || ""} onChange={(e) => handleFieldChange(index, "subtitle", e.target.value)} />
                    </Field>
                    <Field label="Duration (seconds)">
                      <NumberInput min={1} max={60} value={scene.duration} onChange={(e) => handleFieldChange(index, "duration", Number(e.target.value))} />
                    </Field>
                    <Field label="Background Color">
                      <Input value={scene.backgroundColor || ""} onChange={(e) => handleFieldChange(index, "backgroundColor", e.target.value)} />
                    </Field>
                  </div>
                </div>

                <div className="h-px bg-border-light" />

                <div>
                  <SectionLabel icon={LayoutTemplate} tone="info">
                    Template
                  </SectionLabel>
                  <Field label="Scene Template">
                    <Select
                      value={scene.templateId}
                      onChange={(v) => handleFieldChange(index, "templateId", v)}
                      options={TEMPLATE_OPTIONS}
                    />
                  </Field>
                </div>

                <div className="h-px bg-border-light" />

                <div>
                  <SectionLabel icon={Palette} tone="warning">
                    Image
                  </SectionLabel>
                  <Field label="Image URL">
                    <Input
                      value={scene.elements?.image || ""}
                      onChange={(e) => handleImageChange(index, e.target.value)}
                      placeholder="https://..."
                    />
                  </Field>
                </div>

                <div className="h-px bg-border-light" />

                <div>
                  <SectionLabel icon={Languages} tone="success">
                    Narration
                  </SectionLabel>
                  <Field label="Narration Text">
                    <Textarea rows={2} value={scene.audio?.text || ""} onChange={(e) => handleAudioTextChange(index, e.target.value)} placeholder="Text to speak in this scene" />
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

export default CourseVideoStudio;
