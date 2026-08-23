import { useState, useEffect, useRef, useCallback } from "react";
import {
  connect,
  joinCourseRoom,
  leaveCourseRoom,
  onCourseVideoProgress,
  onCourseVideoScriptReady,
  onCourseVideoAudioReady,
  onCourseVideoSceneAudioReady,
  onCourseVideoRenderReady,
  onCourseVideoUpdated,
  onJobFailed,
  onConnect,
  onDisconnect,
  isConnected,
} from "../../../services/socket";
import { toast } from "../../../components/ui/toastBus";
import { scriptToText } from "./constants";

/**
 * Joins the course's socket room and keeps this one video's local state in
 * sync with every event that can touch it, resetting actionLoading (the
 * per-step button spinners) whenever a step actually finishes so the UI
 * doesn't get stuck showing a spinner after the real work is done.
 */
export function useVideoSocket({ videoId, courseId, fetchVideo, fetchActivityLogs, addActivity, setVideo, setScriptText, setActionLoading }) {
  const [socketStatus, setSocketStatus] = useState(() => (isConnected() ? "connected" : "disconnected"));
  const unsubscribesRef = useRef([]);

  const cleanup = useCallback(() => {
    unsubscribesRef.current.forEach((unsubscribe) => unsubscribe && unsubscribe());
    unsubscribesRef.current = [];
  }, []);

  useEffect(() => {
    if (!videoId || !courseId) return undefined;

    fetchVideo();
    fetchActivityLogs();
    cleanup();
    connect();
    joinCourseRoom(courseId);
    setSocketStatus(isConnected() ? "connected" : "disconnected");

    unsubscribesRef.current.push(
      onCourseVideoProgress((data) => {
        if (data.videoId !== videoId) return;
        setVideo((prev) => (prev ? { ...prev, status: data.status } : prev));
        if (data.message) addActivity(data.message);
      })
    );

    unsubscribesRef.current.push(
      onCourseVideoScriptReady((data) => {
        if (data.videoId !== videoId) return;
        setVideo((prev) => (prev ? { ...prev, status: data.status, script: data.script } : prev));
        setScriptText(scriptToText(data.script));
        setActionLoading({});
        addActivity(data.message || "Script ready", data.updatedAt);
        fetchActivityLogs();
      })
    );

    unsubscribesRef.current.push(
      onCourseVideoSceneAudioReady((data) => {
        if (data.videoId !== videoId) return;
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
    );

    unsubscribesRef.current.push(
      onCourseVideoAudioReady((data) => {
        if (data.videoId !== videoId) return;
        setVideo((prev) =>
          prev ? { ...prev, status: data.status, audioUrl: data.audioUrl, audioDuration: data.audioDuration } : prev
        );
        setActionLoading({});
        addActivity(data.message || "Audio ready");
        fetchActivityLogs();
      })
    );

    unsubscribesRef.current.push(
      onCourseVideoRenderReady((data) => {
        if (data.videoId !== videoId) return;
        setVideo((prev) =>
          prev ? { ...prev, status: data.status, renderUrl: data.renderUrl, renderedAt: data.renderedAt || new Date().toISOString() } : prev
        );
        setActionLoading({});
        addActivity(data.message || "Render ready");
        fetchActivityLogs();
      })
    );

    unsubscribesRef.current.push(
      onCourseVideoUpdated((data) => {
        if (data.videoId !== videoId) return;
        // Cloud upload can touch script/audioUrl/renderUrl together, so
        // just refetch the full record rather than partially merging.
        fetchVideo();
        addActivity(data.message || "Video updated");
        fetchActivityLogs();
      })
    );

    unsubscribesRef.current.push(
      onJobFailed((data) => {
        if (data.videoId !== videoId) return;
        setVideo((prev) => (prev ? { ...prev, status: data.status, error: { message: data.error, step: data.step } } : prev));
        setActionLoading({});
        toast.error(data.error || "Step failed");
        addActivity(`Failed: ${data.error || "Unknown error"}`);
        fetchActivityLogs();
      })
    );

    unsubscribesRef.current.push(
      onConnect(() => {
        setSocketStatus("connected");
        // Rooms aren't remembered across a reconnect - rejoin and resync
        // in case events fired while we were disconnected.
        joinCourseRoom(courseId);
        fetchVideo();
        fetchActivityLogs();
      })
    );
    unsubscribesRef.current.push(
      onDisconnect((reason) => setSocketStatus(reason === "io client disconnect" ? "disconnected" : "reconnecting"))
    );

    return () => {
      leaveCourseRoom(courseId);
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, courseId, fetchVideo, fetchActivityLogs, cleanup]);

  return socketStatus;
}
