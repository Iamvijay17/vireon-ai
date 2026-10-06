import { useState } from "react";
import {
  generateCourseVideoScript,
  approveCourseVideoScript,
  updateCourseVideoScript,
  regenerateCourseVideoScript,
  generateCourseVideoAudio,
  renderCourseVideo,
  retryCourseVideo,
  stopCourseVideo,
  regenerateCourseVideoSceneAudio,
} from "../../../services/api";
import { toast } from "../../../components/ui/toastBus";
import { confirmDialog } from "../../../components/ui/confirmBus";

/**
 * Every action on the lesson page. `actionLoading` is keyed by step; a
 * stage that starts work in the worker keeps its spinner until the socket
 * reports back (see useVideoSocket), so only failures clear it here.
 */
export function useLessonActions({ videoId, video, setVideo, scriptText, setEditingScript, fetchVideo, fetchActivityLogs, addActivity }) {
  const [actionLoading, setActionLoading] = useState({});
  const [regeneratingScene, setRegeneratingScene] = useState(null);

  const setStepLoading = (step, val) => setActionLoading((prev) => ({ ...prev, [step]: val }));

  // Queue a stage in the worker. Loading stays on after success - the socket
  // clears it when the stage reports progress or finishes.
  const startStage = async (step, call, { confirm, started, failure }) => {
    if (confirm && !(await confirmDialog(confirm))) return;
    setStepLoading(step, true);
    try {
      await call();
      toast.info(started);
      addActivity(started);
      fetchActivityLogs();
    } catch (err) {
      toast.error(err.friendlyMessage || failure);
      setStepLoading(step, false);
    }
  };

  const handleGenerateScript = () =>
    startStage("script", () => generateCourseVideoScript(videoId), {
      started: "Script generation started",
      failure: "Failed to start script generation",
    });

  const handleRegenerateScript = () =>
    startStage("script", () => regenerateCourseVideoScript(videoId), {
      confirm: { title: "Regenerate Script", content: "This will replace the current script. Are you sure?" },
      started: "Script regeneration started",
      failure: "Failed to regenerate script",
    });

  const handleGenerateAudio = () =>
    startStage("audio", () => generateCourseVideoAudio(videoId), {
      started: "Audio generation started",
      failure: "Failed to start audio generation",
    });

  const handleRegenerateAudio = () =>
    startStage("audio", () => generateCourseVideoAudio(videoId), {
      confirm: { title: "Regenerate Audio", content: "This will regenerate all audio for this video. Are you sure?" },
      started: "Audio regeneration started",
      failure: "Failed to regenerate audio",
    });

  const handleRender = () =>
    startStage("render", () => renderCourseVideo(videoId), {
      started: "Rendering started",
      failure: "Failed to start rendering",
    });

  const handleReRender = () =>
    startStage("render", () => renderCourseVideo(videoId), {
      confirm: { title: "Re-Render Video", content: "This will re-render the video from scratch. Are you sure?" },
      started: "Re-rendering started",
      failure: "Failed to re-render",
    });

  const handleRetry = () => {
    const failedStep = video?.error?.step || "Script Generation";
    return startStage("retry", () => retryCourseVideo(videoId), {
      started: `Retrying ${failedStep}...`,
      failure: "Failed to retry",
    });
  };

  const handleApproveScript = async () => {
    setStepLoading("approve", true);
    try {
      await approveCourseVideoScript(videoId);
      toast.success("Script approved");
      addActivity("Script approved");
      fetchVideo();
      fetchActivityLogs();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to approve script");
    } finally {
      setStepLoading("approve", false);
    }
  };

  const handleSaveScript = async () => {
    let parsed;
    try {
      parsed = JSON.parse(scriptText);
    } catch {
      toast.error("Invalid JSON - please fix before saving");
      return;
    }
    setStepLoading("save", true);
    try {
      await updateCourseVideoScript(videoId, parsed);
      toast.success("Script updated");
      setEditingScript(false);
      addActivity("Script edited and saved");
      fetchVideo();
      fetchActivityLogs();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save script");
    } finally {
      setStepLoading("save", false);
    }
  };

  const handleStop = async () => {
    const ok = await confirmDialog({
      title: "Stop this lesson?",
      content:
        "This will be marked cancelled. If it's still queued this stops it immediately; if it's actively processing, it stops as soon as the current step finishes checking in (may take a moment).",
      confirmText: "Stop",
      danger: true,
    });
    if (!ok) return;

    setStepLoading("stop", true);
    try {
      await stopCourseVideo(videoId);
      toast.success("Lesson stopped");
      addActivity("Stopped by user");
      fetchActivityLogs();
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to stop");
    } finally {
      setStepLoading("stop", false);
    }
  };

  const handleRegenerateSceneAudio = async (sceneNumber) => {
    setRegeneratingScene(sceneNumber);
    try {
      const res = await regenerateCourseVideoSceneAudio(videoId, sceneNumber);
      setVideo((prev) => {
        if (!prev?.script?.scenes) return prev;
        const scenes = prev.script.scenes.map((scene) =>
          scene.sceneNumber === sceneNumber
            ? { ...scene, audio: { ...scene.audio, ...res.data.audio } }
            : scene
        );
        return { ...prev, script: { ...prev.script, scenes } };
      });
      toast.success(`Scene ${sceneNumber} audio regenerated`);
      fetchActivityLogs();
    } catch (err) {
      toast.error(err.friendlyMessage || `Failed to regenerate scene ${sceneNumber}`);
    } finally {
      setRegeneratingScene(null);
    }
  };

  const handleManualRefresh = () => {
    fetchVideo();
    fetchActivityLogs();
    toast.info("Refreshed video data");
  };

  return {
    actionLoading,
    setActionLoading,
    regeneratingScene,
    handleGenerateScript,
    handleApproveScript,
    handleSaveScript,
    handleRegenerateScript,
    handleGenerateAudio,
    handleRegenerateAudio,
    handleRender,
    handleReRender,
    handleRetry,
    handleStop,
    handleRegenerateSceneAudio,
    handleManualRefresh,
  };
}
