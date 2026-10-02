import { useEffect } from "react";
import {
  joinJobRoom,
  leaveJobRoom,
  onJobProgress,
  onJobCompleted,
  onJobFailed,
  onSceneAudioReady,
  requestJobStatus,
  onJobStatus,
} from "../../services/socket";
import { toast } from "../../components/ui/toastBus";
import { useSocketRoom } from "../../shared/useSocketRoom";

/**
 * Joins the job's socket room and keeps `job` in sync with every event
 * that can touch it. Also runs the initial fetchJob/fetchActivityLogs
 * pair on mount/jobId-change.
 *
 * The connect/join/status/cleanup lifecycle lives in useSocketRoom, which
 * also fixes a leak this hook used to have: listeners were only torn down
 * when the job id changed, never on unmount, so navigating away from a
 * render page left its handlers subscribed for the life of the tab.
 */
export function useJobSocket(jobId, fetchJob, fetchActivityLogs, setJob, setLoading) {
  const socketStatus = useSocketRoom(jobId, {
    join: joinJobRoom,
    leave: leaveJobRoom,

    // A reconnect may have missed events; ask the server for the job's
    // current state rather than guessing from what arrives next.
    onReconnect: (id) => requestJobStatus(id),

    subscribe: (currentJobId) => {
      // Every payload is filtered by job id: socket rooms are joined per
      // job, but a reconnect can briefly deliver events for a job this
      // page is no longer showing.
      const forThisJob = (handler) => (data) => {
        if (data.jobId === currentJobId) handler(data);
      };

      return [
        onJobProgress(
          forThisJob((data) => {
            setJob((prev) =>
              prev
                ? {
                    ...prev,
                    progress: data.progress,
                    status: data.status,
                    currentStep: data.currentStep,
                    currentScene: data.currentScene,
                  }
                : prev
            );
            fetchActivityLogs(currentJobId);
          })
        ),

        onJobCompleted(
          forThisJob((data) => {
            setJob((prev) =>
              prev
                ? {
                    ...prev,
                    progress: 100,
                    status: "COMPLETED",
                    videoUrl: data.videoUrl,
                    thumbnailUrl: data.thumbnailUrl,
                  }
                : prev
            );
            fetchActivityLogs(currentJobId);
            toast.success("Video generation completed!");
          })
        ),

        onJobFailed(
          forThisJob((data) => {
            setJob((prev) => (prev ? { ...prev, status: "FAILED", error: data.error } : prev));
            fetchActivityLogs(currentJobId);
            toast.error("Video generation failed");
          })
        ),

        onSceneAudioReady(
          forThisJob((data) => {
            setJob((prev) => {
              if (!prev?.script?.scenes) return prev;
              const scenes = prev.script.scenes.map((scene) =>
                scene.sceneNumber === data.sceneNumber
                  ? { ...scene, audio: { ...scene.audio, ...data.audio } }
                  : scene
              );
              return { ...prev, script: { ...prev.script, scenes } };
            });
          })
        ),

        // The snapshot the server sends in reply to requestJobStatus.
        onJobStatus(
          forThisJob((data) => {
            setJob((prev) => ({
              ...(prev || {}),
              progress: data.progress,
              status: data.status,
              currentStep: data.currentStep,
              currentScene: data.currentScene,
              videoUrl: data.videoUrl || prev?.videoUrl,
              thumbnailUrl: data.thumbnailUrl || prev?.thumbnailUrl,
            }));
          })
        ),
      ];
    },
  });

  // Initial load, kept separate from the socket lifecycle: this is a
  // one-shot REST fetch, not a subscription.
  useEffect(() => {
    if (!jobId) {
      setLoading(false);
      return;
    }
    fetchJob();
    fetchActivityLogs(jobId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, fetchJob, fetchActivityLogs]);

  return socketStatus;
}
