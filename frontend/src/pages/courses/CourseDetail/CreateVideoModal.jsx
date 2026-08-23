import { Modal } from "../../../components/ui/Modal";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Select";
import { Switch } from "../../../components/ui/Switch";
import { VoiceSelect } from "../../../components/ui/VoiceSelect";
import { Input, Textarea, Label, FieldHint } from "../../../components/ui/Input";
import { DURATION_OPTIONS, STYLE_OPTIONS, RESOLUTION_OPTIONS, AVATAR_POSITION_OPTIONS } from "./constants";

export const CreateVideoModal = ({
  open,
  onClose,
  formValues,
  setFormValues,
  formError,
  submitting,
  onSubmit,
  voiceOptions,
  isFavorite,
  toggleFavorite,
  onAvatarEnabledChange,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    title="Create Video"
    width="lg"
    footer={
      <>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" loading={submitting} onClick={onSubmit}>
          Create Video
        </Button>
      </>
    }
  >
    <div className="space-y-4">
      <div>
        <Label required>Video Title</Label>
        <Input
          placeholder="e.g., Introduction to React"
          value={formValues.title}
          onChange={(e) => setFormValues((prev) => ({ ...prev, title: e.target.value }))}
          error={Boolean(formError) && !formValues.title.trim()}
        />
      </div>
      <div>
        <Label required>Topic</Label>
        <Textarea
          rows={2}
          placeholder="e.g., Explain React from scratch for beginners."
          value={formValues.topic}
          onChange={(e) => setFormValues((prev) => ({ ...prev, topic: e.target.value }))}
          error={Boolean(formError) && !formValues.topic.trim()}
        />
      </div>
      {formError && <p className="text-xs text-danger-500">{formError}</p>}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Duration</Label>
          <Select options={DURATION_OPTIONS} value={formValues.duration} onChange={(v) => setFormValues((prev) => ({ ...prev, duration: v }))} />
        </div>
        <div>
          <Label>Voice</Label>
          <VoiceSelect
            options={voiceOptions}
            value={formValues.voice}
            onChange={(v) => setFormValues((prev) => ({ ...prev, voice: v }))}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
          />
          <FieldHint>Custom presets or cloned from your reference .wav files</FieldHint>
        </div>
        <div>
          <Label>Style</Label>
          <Select options={STYLE_OPTIONS} value={formValues.style} onChange={(v) => setFormValues((prev) => ({ ...prev, style: v }))} />
        </div>
        <div>
          <Label>Resolution</Label>
          <Select options={RESOLUTION_OPTIONS} value={formValues.resolution} onChange={(v) => setFormValues((prev) => ({ ...prev, resolution: v }))} />
        </div>
      </div>
      <div>
        <Label>Additional Instructions (optional)</Label>
        <Textarea
          rows={2}
          placeholder="Any specific instructions for the AI..."
          value={formValues.additionalInstructions}
          onChange={(e) => setFormValues((prev) => ({ ...prev, additionalInstructions: e.target.value }))}
        />
      </div>
      <div>
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border-light px-3 py-2.5">
          <div>
            <Label className="mb-0.5">Avatar Overlay</Label>
            <FieldHint>
              {formValues.avatarEnabled
                ? "On: a talking-head overlay is generated automatically, using a default portrait matching the selected voice's gender."
                : "Off: no avatar is generated for this video."}
            </FieldHint>
          </div>
          <Switch checked={formValues.avatarEnabled} onChange={onAvatarEnabledChange} />
        </div>

        {formValues.avatarEnabled && (
          <div className="mt-3">
            <Label>Avatar position</Label>
            <Select
              options={AVATAR_POSITION_OPTIONS}
              value={formValues.avatarPosition || "bottom-right"}
              onChange={(v) => setFormValues((prev) => ({ ...prev, avatarPosition: v }))}
            />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border-light px-3 py-2.5">
        <div>
          <Label className="mb-0.5">Fast Audio (0.6B)</Label>
          <FieldHint>Smaller, faster TTS model - quicker narration, lower quality</FieldHint>
        </div>
        <Switch checked={formValues.fastAudio} onChange={(v) => setFormValues((prev) => ({ ...prev, fastAudio: v }))} />
      </div>
    </div>
  </Modal>
);
