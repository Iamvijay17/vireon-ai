import { Settings, Image as ImageIcon, Languages, RotateCw } from "lucide-react";
import { Select } from "../../components/ui/Select";
import { Input, Textarea } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Tooltip } from "../../components/ui/Tooltip";
import { Spinner } from "../../components/ui/Spinner";
import { AudioPlayer } from "../../components/ui/AudioPlayer";
import { VoiceSelect } from "../../components/ui/VoiceSelect";
import { resolveSceneAudioUrl } from "../../services/api";
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

export const AudioTab = ({
  scene,
  selectedSceneIndex,
  canEdit,
  editor,
  job,
  voiceOptions,
  isFavorite,
  toggleFavorite,
  onVoiceChange,
  regeneratingScene,
  onRegenerateScene,
}) => {
  const isPodcast = job?.type === "podcast";
  const isRegenerating = regeneratingScene === scene.sceneNumber;
  const sceneAudioUrl = scene.audio?.file ? resolveSceneAudioUrl(job?._id, scene.audio.file) : null;

  return (
    <div>
      <SectionLabel icon={Languages}>Audio / Narration</SectionLabel>
      <Field label="Narration Text">
        <Textarea rows={3} value={scene.audio?.text || ""} onChange={(e) => editor.handleAudioTextChange(selectedSceneIndex, e.target.value)} disabled={!canEdit} placeholder="Text to speak in this scene" />
      </Field>

      {isPodcast ? (
        <div className="mt-3 grid grid-cols-1 gap-3">
          <Field label="Host Voice">
            <VoiceSelect
              options={voiceOptions}
              value={job?.hostVoice}
              onChange={(v) => onVoiceChange("hostVoice", v)}
              disabled={!canEdit}
              isFavorite={isFavorite}
              onToggleFavorite={toggleFavorite}
            />
          </Field>
          <Field label="Guest Voice">
            <VoiceSelect
              options={voiceOptions}
              value={job?.guestVoice}
              onChange={(v) => onVoiceChange("guestVoice", v)}
              disabled={!canEdit}
              isFavorite={isFavorite}
              onToggleFavorite={toggleFavorite}
            />
          </Field>
        </div>
      ) : (
        <div className="mt-3">
          <Field label="Voice">
            <VoiceSelect
              options={voiceOptions}
              value={job?.voice}
              onChange={(v) => onVoiceChange("voice", v)}
              disabled={!canEdit}
              isFavorite={isFavorite}
              onToggleFavorite={toggleFavorite}
            />
          </Field>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3 border-t border-border-light pt-4">
        {isRegenerating ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-dashed border-border-light px-3 py-2 text-xs text-text-tertiary">
            <Spinner size="sm" />
            Regenerating this scene's audio...
          </div>
        ) : sceneAudioUrl ? (
          <AudioPlayer src={sceneAudioUrl} className="min-w-0 flex-1" />
        ) : (
          <p className="flex-1 text-[13px] text-text-tertiary">No audio generated for this scene yet.</p>
        )}
        <Tooltip content="Regenerate this scene's audio using the voice above">
          <Button
            variant="secondary"
            size="sm"
            icon={<RotateCw className={`size-3.5 ${isRegenerating ? "animate-spin" : ""}`} />}
            disabled={!canEdit || isRegenerating}
            onClick={() => onRegenerateScene(scene.sceneNumber)}
          >
            Regenerate
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};
