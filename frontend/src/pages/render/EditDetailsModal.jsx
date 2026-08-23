import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { VoiceSelect } from "../../components/ui/VoiceSelect";
import { Textarea, Label, FieldHint } from "../../components/ui/Input";
import { DURATIONS, SHORTS_DURATIONS, RESOLUTIONS, VERTICAL_RESOLUTIONS, LANGUAGES } from "./constants";

export const EditDetailsModal = ({
  open,
  onClose,
  job,
  editForm,
  setEditForm,
  editError,
  editSubmitting,
  onSave,
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
        <Button variant="primary" loading={editSubmitting} onClick={onSave}>
          Save Changes
        </Button>
      </>
    }
  >
    {editForm && (
      <div className="space-y-4">
        <div>
          <Label required>Topic</Label>
          <Textarea
            rows={2}
            value={editForm.topic}
            onChange={(e) => setEditForm((prev) => ({ ...prev, topic: e.target.value }))}
            error={Boolean(editError) && editForm.topic.trim().length < 3}
          />
        </div>
        {editError && <p className="text-xs text-danger-500">{editError}</p>}
        <FieldHint>
          Changing these fields won't touch an already-generated script, audio, or render - regenerate the
          relevant stage afterward if you want it to reflect the new values.
        </FieldHint>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Duration</Label>
            <Select
              options={job?.type === "youtube_shorts" ? SHORTS_DURATIONS : DURATIONS}
              value={editForm.duration}
              onChange={(v) => setEditForm((prev) => ({ ...prev, duration: v }))}
            />
          </div>
          <div>
            <Label>Resolution</Label>
            <Select
              options={job?.type === "youtube_shorts" ? VERTICAL_RESOLUTIONS : RESOLUTIONS}
              value={editForm.resolution}
              onChange={(v) => setEditForm((prev) => ({ ...prev, resolution: v }))}
            />
          </div>
        </div>

        <div>
          <Label>Language</Label>
          <Select options={LANGUAGES} value={editForm.language} onChange={(v) => setEditForm((prev) => ({ ...prev, language: v }))} />
        </div>

        {job?.type === "podcast" ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label required>Host Voice</Label>
              <VoiceSelect
                options={voiceOptions}
                value={editForm.hostVoice}
                onChange={(v) => setEditForm((prev) => ({ ...prev, hostVoice: v }))}
                isFavorite={isFavorite}
                onToggleFavorite={toggleFavorite}
              />
            </div>
            <div>
              <Label required>Guest Voice</Label>
              <VoiceSelect
                options={voiceOptions}
                value={editForm.guestVoice}
                onChange={(v) => setEditForm((prev) => ({ ...prev, guestVoice: v }))}
                isFavorite={isFavorite}
                onToggleFavorite={toggleFavorite}
              />
            </div>
          </div>
        ) : (
          <div>
            <Label>Voice</Label>
            <VoiceSelect
              options={voiceOptions}
              value={editForm.voice}
              onChange={(v) => setEditForm((prev) => ({ ...prev, voice: v }))}
              isFavorite={isFavorite}
              onToggleFavorite={toggleFavorite}
            />
          </div>
        )}
      </div>
    )}
  </Modal>
);
