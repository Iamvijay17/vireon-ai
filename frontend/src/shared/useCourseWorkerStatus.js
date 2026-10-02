import { useState, useEffect } from "react";
import { getCourseWorkerStatus } from "../services/api";
import { onCourseWorkerStatus } from "../services/socket";

/**
 * Worker liveness for the course pipeline's Generate/Render buttons'
 * running/offline indicator: one REST call for the initial value, then
 * the backend pushes courseWorkerStatus over the socket whenever it
 * changes (see SocketService's worker-status polling) instead of this
 * tab polling on its own. Returns null until the initial check resolves.
 * Shared by CourseDetail and CourseVideoEditor, which both show this
 * badge.
 */
export function useCourseWorkerStatus() {
  const [workerRunning, setWorkerRunning] = useState(null); // null = unknown, boolean once checked

  useEffect(() => {
    let cancelled = false;
    getCourseWorkerStatus()
      .then((res) => {
        if (!cancelled) setWorkerRunning(res.data.running);
      })
      .catch(() => {
        if (!cancelled) setWorkerRunning(false);
      });
    const unsubscribe = onCourseWorkerStatus((data) => setWorkerRunning(data.running));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return workerRunning;
}
