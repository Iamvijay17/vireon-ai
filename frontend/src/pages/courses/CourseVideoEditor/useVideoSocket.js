import { useEffect } from "react";
import {
  joinCourseRoom,
  leaveCourseRoom,
  onCourseVideoProgress,
  onCourseVideoScriptReady,
  onCourseVideoAudioReady,
  onCourseVideoSceneAudioReady,
  onCourseVideoRenderReady,
  onCourseVideoUpdated,
  onJobFailed,
} from "../../../services/socket";
import { toast } from "../../../components/ui/toastBus";
import { useSocketRoom } from "../../../shared/useSocketRoom";
import { scriptToText } from "./constants";

/**
 * Joins the course's socket room and keeps this one video's local state in
 * sync with every event that can touch it, resetting actionLoading (the
 * per-step button spinners) whenever a step actually finishes so the UI
 * doesn't get stuck showing a spinner after the real work is done.
 *
 * Note the room is the *course*, while the events are filtered down to a
 * single video - hence the videoId guard on every handler.
 */
export function useVideoSocket({
  videoId,
  courseId,
  fetchVideo,
  fetchActivityLogs,
  addActivity,
  setVideo,
  setScriptText,
  setActionLoading,
}) {
  const socketStatus = useSocketRoom(videoId && courseId ? courseId : null, {
    join: joinCourseRoom,
    leave: leaveCourseRoom,

    onReconnect: () => {
      fetchVideo();
      fetchActivityLogs();
    },

    subscribe: () => {
      // Every event on this room is for some video in the course; only
      // this page's video should touch its state.
      const forThisVideo = (handler) => (data) => {
        if (data.videoId === videoId) handler(data);
      };

      return [
        onCourseVideoProgress(
          forThisVideo((data) => {
            setVideo((prev) => (prev ? { ...prev, status: data.status } : prev));
            if (data.message) addActivity(data.message);
          })
        ),

        onCourseVideoScriptReady(
          forThisVideo((data) => {
            setVideo((prev) => (prev ? { ...prev, status: data.status, script: data.script } : prev));
            setScriptText(scriptToText(data.script));
            setActionLoading({});
            addActivity(data.message || "Script ready", data.updatedAt);
            fetchActivityLogs();
          })
        ),

        onCourseVideoSceneAudioReady(
          forThisVideo((data) => {
            setVideo((prev) => {
              if (!prev?.script?.scenes) return prev;
              const scenes = prev.script.scenes.map((scene) =>
                scene.sceneNumber === data.sceneNumber
                  ? { ...scene, audio: { ...scene.audio, ...data.audio } }
                  : scene
              );
              return { ...prev, script: { ...prev.script, scenes } };
            });
            addActivity(`Scene ${data.sceneNumber} audio generated`);
            fetchActivityLogs();
          })
        ),

        onCourseVideoAudioReady(
          forThisVideo((data) => {
            setVideo((prev) =>
              prev
                ? { ...prev, status: data.status, audioUrl: data.audioUrl, audioDuration: data.audioDuration }
                : prev
            );
            setActionLoading({});
            addActivity(data.message || "Audio ready");
            fetchActivityLogs();
          })
        ),

        onCourseVideoRenderReady(
          forThisVideo((data) => {
            setVideo((prev) =>
              prev
                ? {
                    ...prev,
                    status: data.status,
                    renderUrl: data.renderUrl,
                    renderedAt: data.renderedAt || new Date().toISOString(),
                  }
                : prev
            );
            setActionLoading({});
            addActivity(data.message || "Render ready");
            fetchActivityLogs();
          })
        ),

        onCourseVideoUpdated(
          forThisVideo((data) => {
            // Cloud upload can touch script/audioUrl/renderUrl together, so
            // just refetch the full record rather than partially merging.
            fetchVideo();
            addActivity(data.message || "Video updated");
            fetchActivityLogs();
          })
        ),

        onJobFailed(
          forThisVideo((data) => {
            setVideo((prev) =>
              prev ? { ...prev, status: data.status, error: { message: data.error, step: data.step } } : prev
            );
            setActionLoading({});
            toast.error(data.error || "Step failed");
            addActivity(`Failed: ${data.error || "Unknown error"}`);
            fetchActivityLogs();
          })
        ),
      ];
    },
  });

  // Initial load, kept out of the socket lifecycle - a one-shot REST
  // fetch, not a subscription.
  useEffect(() => {
    if (!videoId || !courseId) return;
    fetchVideo();
    fetchActivityLogs();
  }, [videoId, courseId, fetchVideo, fetchActivityLogs]);

  return socketStatus;
}
