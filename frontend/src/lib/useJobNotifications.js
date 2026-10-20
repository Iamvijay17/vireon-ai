import { useEffect, useRef } from "react";
import { useActiveJobs } from "./useActiveJobs";
import { jobPhase, isJobOpen } from "./jobStatus";
import { loadSettings } from "../shared/settingsStorage";
import { toast } from "../components/ui/toastBus";

/**
 * Which jobs just finished since the last look. `previous` maps job id ->
 * phase from the last snapshot; only a job we SAW still open and now see
 * completed/failed counts, so opening the app on an old list stays silent.
 */
export function detectFinished(previous, jobs) {
  const finished = [];
  for (const job of jobs) {
    const before = previous.get(job._id);
    if (before === undefined) continue; // not seen before: no transition to report
    const now = jobPhase(job.status);
    if (isJobOpen(before) && (now === "completed" || now === "failed")) {
      finished.push({ id: job._id, topic: job.topic, phase: now, error: job.error?.message });
    }
  }
  return finished;
}

const notifyDesktop = (title, body) => {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted" || !document.hidden) return;
    new Notification(title, { body, tag: "vireon-job" });
  } catch {
    // Some browsers throw for Notification outside a service worker; the toast still shows.
  }
};

/**
 * App-wide "your video finished / failed" notices.
 *
 * Socket completion events only reach clients that joined that job's room, so
 * a listener here would miss jobs started elsewhere. The jobs feed does not
 * have that limit (it polls while anything is active), so this watches it
 * for open -> completed/failed transitions instead.
 */
export function useJobNotifications() {
  const { jobs } = useActiveJobs();
  const previous = useRef(null);

  useEffect(() => {
    if (!jobs.length && previous.current === null) return;
    const snapshot = new Map(jobs.map((j) => [j._id, jobPhase(j.status)]));

    if (previous.current) {
      const prefs = loadSettings();
      for (const job of detectFinished(previous.current, jobs)) {
        const label = job.topic ? `“${job.topic}”` : "A video";
        if (job.phase === "completed" && prefs.notifyOnComplete) {
          toast.success(`${label} finished rendering`);
          if (prefs.desktopNotifications) notifyDesktop("Video ready", job.topic || "A video finished rendering");
        } else if (job.phase === "failed" && prefs.notifyOnFail) {
          toast.error(`${label} failed${job.error ? `: ${job.error}` : ""}`);
          if (prefs.desktopNotifications) notifyDesktop("Video failed", job.topic || "A video failed");
        }
      }
    }
    previous.current = snapshot;
  }, [jobs]);
}

export default useJobNotifications;
