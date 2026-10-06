import { useState } from "react";
import { createCourseVideo, updateCourseVideo } from "../../../services/api";
import { loadSettings } from "../../../shared/settingsStorage";
import { toast } from "../../../components/ui/toastBus";
import { EMPTY_FORM } from "./constants";

/** State and submit handlers for the Create Video and Edit Video modals. */
export function useVideoForms({ id, pickDefaultVoice, fetchVideos, fetchCourse }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [formValues, setFormValues] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editingVideoId, setEditingVideoId] = useState(null);
  const [videoEditForm, setVideoEditForm] = useState(EMPTY_FORM);
  const [videoEditError, setVideoEditError] = useState("");
  const [videoEditSubmitting, setVideoEditSubmitting] = useState(false);

  const showCreateModal = () => {
    const prefs = loadSettings();
    setFormValues({
      ...EMPTY_FORM,
      voice: pickDefaultVoice(prefs.defaultVoice),
      style: prefs.defaultCourseStyle || EMPTY_FORM.style,
      duration: prefs.defaultCourseDuration || EMPTY_FORM.duration,
      fastAudio: prefs.fastAudioGeneration ?? EMPTY_FORM.fastAudio,
    });
    setFormError("");
    setCreateOpen(true);
  };

  const handleCreateVideo = async () => {
    if (!formValues.title.trim()) return setFormError("Please enter a video title");
    if (!formValues.topic.trim()) return setFormError("Please enter a topic");
    try {
      setSubmitting(true);
      await createCourseVideo(id, formValues);
      toast.success("Video created successfully");
      setCreateOpen(false);
      fetchVideos();
      fetchCourse();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to create video");
    } finally {
      setSubmitting(false);
    }
  };

  const showVideoEditModal = (video) => {
    setEditingVideoId(video._id);
    setVideoEditForm({
      title: video.title || "",
      topic: video.topic || "",
      duration: video.duration || EMPTY_FORM.duration,
      voice: video.voice || EMPTY_FORM.voice,
      style: video.style || EMPTY_FORM.style,
      resolution: video.resolution || EMPTY_FORM.resolution,
      quality: video.quality || EMPTY_FORM.quality,
      additionalInstructions: video.additionalInstructions || "",
      fastAudio: video.fastAudio ?? EMPTY_FORM.fastAudio,
    });
    setVideoEditError("");
    setEditOpen(true);
  };

  const handleSaveVideoEdit = async () => {
    if (!videoEditForm.title.trim()) return setVideoEditError("Please enter a video title");
    if (!videoEditForm.topic.trim()) return setVideoEditError("Please enter a topic");
    try {
      setVideoEditSubmitting(true);
      await updateCourseVideo(editingVideoId, videoEditForm);
      toast.success("Video details updated");
      setEditOpen(false);
      fetchVideos();
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to update video");
    } finally {
      setVideoEditSubmitting(false);
    }
  };

  return {
    create: {
      open: createOpen,
      onClose: () => setCreateOpen(false),
      formValues,
      setFormValues,
      formError,
      submitting,
      onSubmit: handleCreateVideo,
    },
    edit: {
      open: editOpen,
      onClose: () => setEditOpen(false),
      videoEditForm,
      setVideoEditForm,
      videoEditError,
      videoEditSubmitting,
      onSubmit: handleSaveVideoEdit,
    },
    showCreateModal,
    showVideoEditModal,
  };
}
