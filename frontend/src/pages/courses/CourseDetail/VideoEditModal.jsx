import { Modal } from "../../../components/ui/Modal";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Select";
import { Switch } from "../../../components/ui/Switch";
import { VoiceSelect } from "../../../components/ui/VoiceSelect";
import { Input, Textarea, Label, FieldHint } from "../../../components/ui/Input";
import { DURATION_OPTIONS, STYLE_OPTIONS, RESOLUTION_OPTIONS, QUALITY_OPTIONS } from "./constants";

export const VideoEditModal = ({
  open,
  onClose,
  videoEditForm,
  setVideoEditForm,
  videoEditError,
  videoEditSubmitting,
  onSubmit,
  voiceOptions,
  isFavorite,
  toggleFavorite,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    title="Edit Video Details"
    width="lg"
    footer={
      <>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" loading={videoEditSubmitting} onClick={onSubmit}>
          Save Changes
        </Button>
      </>
    }
  >
    <div className="space-y-4">
      <div>
        <Label required>Video Title</Label>
        <Input
          placeholder="e.g., Introduction to React"
          value={videoEditForm.title}
          onChange={(e) => setVideoEditForm((prev) => ({ ...prev, title: e.target.value }))}
          error={Boolean(videoEditError) && !videoEditForm.title.trim()}
        />
      </div>
      <div>
        <Label required>Topic</Label>
        <Textarea
          rows={2}
          placeholder="e.g., Explain React from scratch for beginners."
          value={videoEditForm.topic}
          onChange={(e) => setVideoEditForm((prev) => ({ ...prev, topic: e.target.value }))}
          error={Boolean(videoEditError) && !videoEditForm.topic.trim()}
        />
      </div>
      {videoEditError && <p className="text-xs text-danger-500">{videoEditError}</p>}
      <FieldHint>
        Changing these fields won't touch an already-generated script, audio, or render - regenerate the
        relevant stage afterward if you want it to reflect the new title/topic.
      </FieldHint>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Duration</Label>
          <Select options={DURATION_OPTIONS} value={videoEditForm.duration} onChange={(v) => setVideoEditForm((prev) => ({ ...prev, duration: v }))} />
        </div>
        <div>
          <Label>Voice</Label>
          <VoiceSelect
            options={voiceOptions}
            value={videoEditForm.voice}
            onChange={(v) => setVideoEditForm((prev) => ({ ...prev, voice: v }))}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
          />
        </div>
        <div>
          <Label>Style</Label>
          <Select options={STYLE_OPTIONS} value={videoEditForm.style} onChange={(v) => setVideoEditForm((prev) => ({ ...prev, style: v }))} />
        </div>
        <div>
          <Label>Resolution</Label>
          <Select options={RESOLUTION_OPTIONS} value={videoEditForm.resolution} onChange={(v) => setVideoEditForm((prev) => ({ ...prev, resolution: v }))} />
        </div>
        <div>
          <Label>Render Quality</Label>
          <Select options={QUALITY_OPTIONS} value={videoEditForm.quality} onChange={(v) => setVideoEditForm((prev) => ({ ...prev, quality: v }))} />
        </div>
      </div>
      <div>
        <Label>Additional Instructions (optional)</Label>
        <Textarea
          rows={2}
          placeholder="Any specific instructions for the AI..."
          value={videoEditForm.additionalInstructions}
          onChange={(e) => setVideoEditForm((prev) => ({ ...prev, additionalInstructions: e.target.value }))}
        />
      </div>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border-light px-3 py-2.5">
        <div>
          <Label className="mb-0.5">Fast Audio (0.6B)</Label>
          <FieldHint>Smaller, faster TTS model - quicker narration, lower quality</FieldHint>
        </div>
        <Switch checked={videoEditForm.fastAudio} onChange={(v) => setVideoEditForm((prev) => ({ ...prev, fastAudio: v }))} />
      </div>
    </div>
  </Modal>
);
