import { Settings, Image as ImageIcon, Languages } from "lucide-react";
import { Select } from "../../components/ui/Select";
import { Input, Textarea } from "../../components/ui/Input";
import { Field, SectionLabel } from "./shared";
import { TRANSITION_OPTIONS, CAMERA_OPTIONS } from "./constants";

export const AnimationTab = ({ scene, selectedSceneIndex, canEdit, editor }) => (
  <div>
    <SectionLabel icon={Settings}>Animation</SectionLabel>
    <div className="grid grid-cols-1 gap-3">
      <Field label="Transition">
        <Select value={scene.transition} onChange={(v) => editor.handleFieldChange(selectedSceneIndex, "transition", v)} options={TRANSITION_OPTIONS} disabled={!canEdit} />
      </Field>
      <Field label="Camera Motion">
        <Select value={scene.cameraMotion} onChange={(v) => editor.handleFieldChange(selectedSceneIndex, "cameraMotion", v)} options={CAMERA_OPTIONS} disabled={!canEdit} />
      </Field>
      <Field label="Animation">
        <Input value={scene.animation || ""} onChange={(e) => editor.handleFieldChange(selectedSceneIndex, "animation", e.target.value)} disabled={!canEdit} placeholder="e.g., fadeIn, slideUp" />
      </Field>
    </div>
  </div>
);

export const ImageTab = ({ scene, selectedSceneIndex, canEdit, editor }) => (
  <div>
    <SectionLabel icon={ImageIcon}>Image</SectionLabel>
    <div className="space-y-3">
      <Field label="Image Prompt">
        <Textarea rows={2} value={scene.imagePrompt || ""} onChange={(e) => editor.handleFieldChange(selectedSceneIndex, "imagePrompt", e.target.value)} disabled={!canEdit} placeholder="AI image generation prompt (only for image scenes)" />
      </Field>
      <Field label="Image URL (manual override)">
        <Input
          value={scene.imageUrl || ""}
          onChange={(e) => editor.handleFieldChange(selectedSceneIndex, "imageUrl", e.target.value)}
          disabled={!canEdit}
          placeholder="https://... - skips AI image generation for this scene"
        />
      </Field>
    </div>
  </div>
);

export const AudioTab = ({ scene, selectedSceneIndex, canEdit, editor }) => (
  <div>
    <SectionLabel icon={Languages}>Audio / Narration</SectionLabel>
    <Field label="Narration Text">
      <Textarea rows={3} value={scene.audio?.text || ""} onChange={(e) => editor.handleAudioTextChange(selectedSceneIndex, e.target.value)} disabled={!canEdit} placeholder="Text to speak in this scene" />
    </Field>
  </div>
);
