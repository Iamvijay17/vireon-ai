import { useState, useEffect, useRef, useCallback } from "react";
import {
  connect,
  joinJobRoom,
  leaveJobRoom,
  onJobProgress,
  onJobCompleted,
  onJobFailed,
  onSceneAudioReady,
  onConnect,
  onDisconnect,
  requestJobStatus,
  onJobStatus,
  isConnected,
} from "../../services/socket";
import { toast } from "../../components/ui/toastBus";

/**
 * Joins the job's socket room and keeps `job` in sync with every event
 * that can touch it. Also runs the initial fetchJob/fetchActivityLogs
 * pair on mount/jobId-change, matching the page's original single effect.
 */
export function useJobSocket(jobId, fetchJob, fetchActivityLogs, setJob, setLoading) {
  const [socketStatus, setSocketStatus] = useState(() => (isConnected() ? "connected" : "disconnected"));
  const unsubscribesRef = useRef([]);

  const cleanup = useCallback(() => {
    unsubscribesRef.current.forEach((unsubscribe) => unsubscribe && unsubscribe());
    unsubscribesRef.current = [];
  }, []);

  const setupListeners = useCallback(
    (currentJobId) => {
      cleanup();

      unsubscribesRef.current.push(
        onJobProgress((data) => {
          if (data.jobId === currentJobId) {
            setJob((prev) =>
              prev ? { ...prev, progress: data.progress, status: data.status, currentStep: data.currentStep, currentScene: data.currentScene } : prev
            );
            fetchActivityLogs(currentJobId);
          }
        })
      );

      unsubscribesRef.current.push(
        onJobCompleted((data) => {
          if (data.jobId === currentJobId) {
            setJob((prev) => (prev ? { ...prev, progress: 100, status: "COMPLETED", videoUrl: data.videoUrl, thumbnailUrl: data.thumbnailUrl } : prev));
            fetchActivityLogs(currentJobId);
            toast.success("Video generation completed!");
          }
        })
      );

      unsubscribesRef.current.push(
        onJobFailed((data) => {
          if (data.jobId === currentJobId) {
            setJob((prev) => (prev ? { ...prev, status: "FAILED", error: data.error } : prev));
            fetchActivityLogs(currentJobId);
            toast.error("Video generation failed");
          }
        })
      );

      unsubscribesRef.current.push(
        onSceneAudioReady((data) => {
          if (data.jobId === currentJobId) {
            setJob((prev) => {
              if (!prev?.script?.scenes) return prev;
              const scenes = prev.script.scenes.map((scene) =>
                scene.sceneNumber === data.sceneNumber
                  ? { ...scene, audio: { ...scene.audio, ...data.audio } }
                  : scene
              );
              return { ...prev, script: { ...prev.script, scenes } };
            });
          }
        })
      );

      unsubscribesRef.current.push(
        onJobStatus((data) => {
          if (data.jobId === currentJobId) {
            setJob((prev) => ({
              ...(prev || {}),
              progress: data.progress,
              status: data.status,
              currentStep: data.currentStep,
              currentScene: data.currentScene,
              videoUrl: data.videoUrl || prev?.videoUrl,
              thumbnailUrl: data.thumbnailUrl || prev?.thumbnailUrl,
            }));
          }
        })
      );

      unsubscribesRef.current.push(
        onConnect(() => {
          setSocketStatus("connected");
          if (jobId) {
            joinJobRoom(jobId);
            requestJobStatus(jobId);
          }
        })
      );

      unsubscribesRef.current.push(
        onDisconnect((reason) => {
          setSocketStatus(reason === "io client disconnect" ? "disconnected" : "reconnecting");
        })
      );
    },
    [cleanup, jobId, fetchActivityLogs, setJob]
  );

  useEffect(() => {
    if (!jobId) {
      setLoading(false);
      return undefined;
    }

    fetchJob();
    fetchActivityLogs(jobId);
    connect();
    setupListeners(jobId);
    joinJobRoom(jobId);
    setSocketStatus(isConnected() ? "connected" : "disconnected");

    return () => {
      leaveJobRoom(jobId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, fetchJob, fetchActivityLogs, setupListeners]);

  return socketStatus;
}
