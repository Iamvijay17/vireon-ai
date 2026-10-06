import { useState } from "react";
import { updateVideoJob } from "../../services/api";
import { toast } from "../../components/ui/toastBus";
import { FALLBACK_VOICES } from "./constants";
import { useVoiceOptions } from "../../shared/useVoiceOptions";

/**
 * The Edit Details modal: form state seeded from the job, validation, and the
 * save (podcasts send host/guest voices and names, everything else one voice).
 * Also loads the voice catalog the modal's pickers offer.
 */
export function useEditDetails({ jobId, job, fetchJob }) {
  const [open, setOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");

  const { voiceOptions } = useVoiceOptions(FALLBACK_VOICES);

  const openEditModal = () => {
    if (!job) return;
    setEditForm({
      topic: job.topic || "",
      duration: job.duration,
      language: job.language || "english",
      resolution: job.resolution || "1920x1080",
      quality: job.quality || "standard",
      voice: job.voice || "",
      hostVoice: job.hostVoice || "",
      guestVoice: job.guestVoice || "",
      hostName: job.hostName || "",
      guestName: job.guestName || "",
    });
    setEditError("");
    setOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!jobId || !editForm) return;
    if (!editForm.topic.trim() || editForm.topic.trim().length < 3) {
      setEditError("Topic must be at least 3 characters");
      return;
    }
    if (job?.type === "podcast" && (!editForm.hostVoice || !editForm.guestVoice)) {
      setEditError("Host and guest voice are both required for podcasts");
      return;
    }
    try {
      setEditSubmitting(true);
      const payload =
        job?.type === "podcast"
          ? {
              topic: editForm.topic.trim(),
              duration: editForm.duration,
              language: editForm.language,
              resolution: editForm.resolution,
              quality: editForm.quality,
              hostVoice: editForm.hostVoice,
              guestVoice: editForm.guestVoice,
              hostName: editForm.hostName,
              guestName: editForm.guestName,
            }
          : {
              topic: editForm.topic.trim(),
              duration: editForm.duration,
              language: editForm.language,
              resolution: editForm.resolution,
              quality: editForm.quality,
              voice: editForm.voice,
            };
      await updateVideoJob(jobId, payload);
      toast.success("Job details updated");
      setOpen(false);
      fetchJob();
    } catch (err) {
      setEditError(err.friendlyMessage || "Failed to update job details");
    } finally {
      setEditSubmitting(false);
    }
  };

  return {
    openEditModal,
    modalProps: {
      open,
      onClose: () => setOpen(false),
      job,
      editForm,
      setEditForm,
      editError,
      editSubmitting,
      onSave: handleSaveEdit,
      voiceOptions,
    },
  };
}
