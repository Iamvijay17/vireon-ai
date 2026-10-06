import { useState } from "react";
import {
  updateVideoScenes,
  rerenderVideoJob,
  regenerateVideoSceneImage,
  approveVideoJob,
  generateVideoAudio,
  generateVideoRender,
  updateVideoJob,
  regenerateVideoSceneAudio,
} from "../../services/api";
import { toast } from "../../components/ui/toastBus";

/**
 * Every server action the Studio toolbar and inspector can trigger, with a
 * busy flag each. Pipeline actions (approve, generate audio/render,
 * re-render) save the draft first, then hand off to the render page.
 */
export function useStudioActions({ jobId, job, setJob, editor, navigate }) {
  const { editedScenes, hasChanges, setHasChanges } = editor;

  const [saving, setSaving] = useState(false);
  const [rerendering, setRerendering] = useState(false);
  const [approving, setApproving] = useState(false);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [generatingRender, setGeneratingRender] = useState(false);
  const [regeneratingScene, setRegeneratingScene] = useState(null);
  const [regeneratingImage, setRegeneratingImage] = useState(false);

  const handleVoiceChange = async (field, value) => {
    if (!jobId) return;
    try {
      await updateVideoJob(jobId, { [field]: value });
      setJob((prev) => (prev ? { ...prev, [field]: value } : prev));
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to update voice");
    }
  };

  const handleRegenerateScene = async (sceneNumber) => {
    if (!jobId) return;
    setRegeneratingScene(sceneNumber);
    try {
      const res = await regenerateVideoSceneAudio(jobId, sceneNumber);
      setJob((prev) => {
        if (!prev?.script?.scenes) return prev;
        const scenes = prev.script.scenes.map((s) =>
          s.sceneNumber === sceneNumber ? { ...s, audio: { ...s.audio, ...res.data.audio } } : s,
        );
        return { ...prev, script: { ...prev.script, scenes } };
      });
      toast.success(`Scene ${sceneNumber} audio regenerated`);
    } catch (err) {
      toast.error(err.friendlyMessage || `Failed to regenerate scene ${sceneNumber}`);
    } finally {
      setRegeneratingScene(null);
    }
  };

  // Re-rolls the selected scene's picture on the server (queued, then re-rendered).
  // Uses the scene's current prompt, so a prompt edited here is what gets drawn.
  const handleRegenerateImage = async (sceneNumber, prompt) => {
    if (!jobId) return;
    setRegeneratingImage(true);
    try {
      await regenerateVideoSceneImage(jobId, sceneNumber, prompt);
      toast.success(`Regenerating the image for scene ${sceneNumber}`);
      navigate(`/render?id=${jobId}`);
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to regenerate the image");
    } finally {
      setRegeneratingImage(false);
    }
  };

  // Saving can move the job to another status (see SceneController.updateScenes), and the
  // toolbar's action button follows job.status - without this it would keep offering
  // "Generate Render" for a job the server has already sent back to SCRIPT_COMPLETED.
  const syncStatus = (saved) => {
    if (!saved?.status) return;
    setJob((prev) => (prev ? { ...prev, status: saved.status, progress: saved.progress, currentStep: saved.currentStep } : prev));
  };

  const handleSave = async () => {
    if (!jobId) return;
    try {
      setSaving(true);
      const res = await updateVideoScenes(jobId, editedScenes);
      setHasChanges(false);
      syncStatus(res.data?.job);
      toast.success("Scenes saved successfully!");
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to save scenes");
    } finally {
      setSaving(false);
    }
  };

  // Approve, Generate Audio, Generate Render and Re-render all act on what is stored, not on
  // the draft in this tab - without saving first, an edit (a scene type change, say) was
  // silently left out. Returns the saved job, or null when there was nothing to save.
  const saveDraft = async () => {
    if (!hasChanges) return null;
    const res = await updateVideoScenes(jobId, editedScenes);
    setHasChanges(false);
    syncStatus(res.data?.job);
    return res.data?.job || null;
  };

  const handleApprove = async () => {
    if (!jobId) return;
    try {
      setApproving(true);
      await saveDraft();
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
      await saveDraft();
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
      const saved = await saveDraft();
      if (saved && saved.status !== "AUDIO_COMPLETED") {
        // A saved scene that has no audio sends the job back to SCRIPT_COMPLETED (see
        // SceneController.updateScenes), so rendering has to wait for the audio step.
        toast.info("Changes saved. A scene still needs audio - click Generate Audio first.");
        return;
      }
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
      await saveDraft();
      await rerenderVideoJob(jobId);
      toast.success("Re-render started!");
      navigate(`/render?id=${jobId}`);
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to start re-render");
    } finally {
      setRerendering(false);
    }
  };

  return {
    busy: { saving, rerendering, approving, generatingAudio, generatingRender },
    regeneratingScene,
    regeneratingImage,
    handleVoiceChange,
    handleRegenerateScene,
    handleRegenerateImage,
    handleSave,
    handleApprove,
    handleGenerateAudio,
    handleGenerateRender,
    handleRerender,
  };
}
