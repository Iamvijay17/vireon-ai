import { useState, useEffect, useCallback } from "react";
import { getVideoJob } from "../../services/api";
import {
  connect,
  joinJobRoom,
  leaveJobRoom,
  onJobProgress,
  onJobCompleted,
  onJobFailed,
  onConnect,
  onDisconnect,
  onJobStatus,
  isConnected,
} from "../../services/socket";
import { toast } from "../../components/ui/toastBus";

/**
 * Fetches the job and keeps its status/progress in sync over the socket.
 * `onLoaded(scenes)` is called with the freshly-fetched job's scenes so
 * the caller (useSceneEditor) can (re)hydrate its draft - kept as a
 * callback rather than this hook owning the scene draft itself, since
 * the two concerns (job status vs. scene editing) are independent.
 */
export function useStudioJob(jobId, onLoaded) {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [socketStatus, setSocketStatus] = useState(() => (isConnected() ? "connected" : "disconnected"));

  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    try {
      setLoading(true);
      const res = await getVideoJob(jobId);
      setJob(res.data.job);
      onLoaded(res.data.job.script?.scenes || []);
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to fetch job");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  useEffect(() => {
    if (!jobId) return;
    connect();
    joinJobRoom(jobId);

    const unsubProgress = onJobProgress((data) => {
      if (data.jobId === jobId) {
        setJob((prev) => (prev ? { ...prev, progress: data.progress, status: data.status } : prev));
      }
    });
    const unsubCompleted = onJobCompleted((data) => {
      if (data.jobId === jobId) {
        setJob((prev) => (prev ? { ...prev, progress: 100, status: "COMPLETED" } : prev));
        toast.success("Render completed!");
      }
    });
    const unsubFailed = onJobFailed((data) => {
      if (data.jobId === jobId) {
        setJob((prev) => (prev ? { ...prev, status: "FAILED", error: data.error } : prev));
        toast.error("Render failed");
      }
    });
    const unsubStatus = onJobStatus((data) => {
      if (data.jobId === jobId) {
        setJob((prev) => ({ ...(prev || {}), ...data }));
      }
    });
    const unsubConnect = onConnect(() => setSocketStatus("connected"));
    const unsubDisconnect = onDisconnect(() => setSocketStatus("disconnected"));

    return () => {
      leaveJobRoom(jobId);
      unsubProgress();
      unsubCompleted();
      unsubFailed();
      unsubStatus();
      unsubConnect();
      unsubDisconnect();
    };
  }, [jobId]);

  return { job, setJob, loading, socketStatus, fetchJob };
}
