import { useState } from "react";
import {
  restartVideoJob,
  regenerateVideoJobScript,
  rerenderVideoJob,
  stopVideoJob,
  generateVideoAudio,
  generateVideoRender,
  regenerateVideoSceneAudio,
} from "../../services/api";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";

/**
 * The render page's job actions (restart, stop, regenerate, re-render,
 * manual-mode generate steps, per-scene audio), each with its own loading
 * flag. Status changes arrive over the socket, so most actions don't refetch.
 */
export function useRenderActions({ jobId, navigate, fetchJob, setJob }) {
  const [restartLoading, setRestartLoading] = useState(false);
  const [regenerateScriptLoading, setRegenerateScriptLoading] = useState(false);
  const [rerenderLoading, setRerenderLoading] = useState(false);
  const [stopLoading, setStopLoading] = useState(false);
  const [generateAudioLoading, setGenerateAudioLoading] = useState(false);
  const [generateRenderLoading, setGenerateRenderLoading] = useState(false);
  const [regeneratingScene, setRegeneratingScene] = useState(null);

  const handleRestart = async (isStuckActive) => {
    if (!jobId) return;
    if (isStuckActive) {
      const ok = await confirmDialog({
        title: "Regenerate stuck job?",
        content:
          "Only do this if the job has stopped making progress (e.g. no change for several minutes). Retriggering a job that's actually still processing can cause conflicting writes to the same files.",
        confirmText: "Regenerate",
        danger: true,
      });
      if (!ok) return;
    }
    try {
      setRestartLoading(true);
      await restartVideoJob(jobId);
      toast.success("Job restarted successfully");
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to restart job");
    } finally {
      setRestartLoading(false);
    }
  };

  const handleStop = async () => {
    if (!jobId) return;
    const ok = await confirmDialog({
      title: "Stop this job?",
      content:
        "This will be marked cancelled. If it's still queued this stops it immediately; if it's actively processing, it stops as soon as the current step finishes checking in (may take a moment).",
      confirmText: "Stop Job",
      danger: true,
    });
    if (!ok) return;
    try {
      setStopLoading(true);
      await stopVideoJob(jobId);
      toast.success("Job stopped");
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to stop job");
    } finally {
      setStopLoading(false);
    }
  };

  const handleRegenerateScene = async (sceneNumber) => {
    if (!jobId) return;
    setRegeneratingScene(sceneNumber);
    try {
      const res = await regenerateVideoSceneAudio(jobId, sceneNumber);
      setJob((prev) => {
        if (!prev?.script?.scenes) return prev;
        const scenes = prev.script.scenes.map((scene) =>
          scene.sceneNumber === sceneNumber
            ? { ...scene, audio: { ...scene.audio, ...res.data.audio } }
            : scene
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

  const handleRegenerateScript = async () => {
    if (!jobId) return;
    const ok = await confirmDialog({
      title: "Regenerate script?",
      content:
        "This throws away the current script and any generated audio/render output, then re-generates the script from scratch. This can't be undone.",
      confirmText: "Regenerate Script",
      danger: true,
    });
    if (!ok) return;
    try {
      setRegenerateScriptLoading(true);
      await regenerateVideoJobScript(jobId);
      toast.success("Script regeneration started");
      navigate(`/render?id=${jobId}`);
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to regenerate script");
    } finally {
      setRegenerateScriptLoading(false);
    }
  };

  const handleRerender = async () => {
    if (!jobId) return;
    try {
      setRerenderLoading(true);
      await rerenderVideoJob(jobId);
      toast.success("Re-render started successfully");
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to re-render job");
    } finally {
      setRerenderLoading(false);
    }
  };

  const handleGenerateAudio = async () => {
    if (!jobId) return;
    try {
      setGenerateAudioLoading(true);
      await generateVideoAudio(jobId);
      toast.success("Audio generation started");
      fetchJob();
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to generate audio");
    } finally {
      setGenerateAudioLoading(false);
    }
  };

  const handleGenerateRender = async () => {
    if (!jobId) return;
    try {
      setGenerateRenderLoading(true);
      await generateVideoRender(jobId);
      toast.success("Render started");
      fetchJob();
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to start render");
    } finally {
      setGenerateRenderLoading(false);
    }
  };

  return {
    restartLoading,
    regenerateScriptLoading,
    rerenderLoading,
    stopLoading,
    generateAudioLoading,
    generateRenderLoading,
    regeneratingScene,
    handleRestart,
    handleStop,
    handleRegenerateScene,
    handleRegenerateScript,
    handleRerender,
    handleGenerateAudio,
    handleGenerateRender,
  };
}
