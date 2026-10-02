import { useQueryClient } from "@tanstack/react-query";
import {
  joinJobRoom, leaveJobRoom, requestJobStatus,
  onJobProgress, onJobCompleted, onJobFailed, onSceneAudioReady, onJobStatus,
} from "../../services/socket";
import { useSocketRoom } from "../../shared/useSocketRoom";
import { queryKeys } from "../../lib/queryClient";

/**
 * Keeps one job's cached record live.
 *
 * v1's equivalent merged socket payloads into component state by hand,
 * which meant a partial event (`{ jobId, progress, status }`) could clobber
 * fields it didn't carry. Here the cache is the single source of truth and
 * events only *invalidate* it - except for progress, which is high-frequency
 * and safe to patch in place because it is a strict subset of the record.
 *
 * Returns the socket status for the header's live indicator.
 */
export function useJobLive(jobId) {
  const queryClient = useQueryClient();

  return useSocketRoom(jobId, {
    join: joinJobRoom,
    leave: leaveJobRoom,

    // Ask for a fresh snapshot after a drop rather than waiting for the next
    // event, which may be minutes away on a long render.
    onReconnect: (id) => {
      requestJobStatus(id);
      queryClient.invalidateQueries({ queryKey: queryKeys.videos.detail(id) });
    },

    subscribe: (id) => {
      const key = queryKeys.videos.detail(id);
      const forThisJob = (handler) => (data) => {
        if (String(data.jobId) === String(id)) handler(data);
      };

      const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: key });
        // The lists show this job too; a terminal transition changes both.
        queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      };

      /** Patch only the fields an event actually carries. */
      const patch = (fields) =>
        queryClient.setQueryData(key, (prev) => (prev ? { ...prev, ...fields } : prev));

      return [
        onJobProgress(
          forThisJob((data) =>
            patch({
              progress: data.progress,
              status: data.status,
              currentStep: data.currentStep,
              currentScene: data.currentScene,
            })
          )
        ),

        onJobStatus(
          forThisJob((data) =>
            patch({
              progress: data.progress,
              status: data.status,
              currentStep: data.currentStep,
              currentScene: data.currentScene,
            })
          )
        ),

        // These change the record's shape (urls, scene audio, error), so a
        // refetch is safer than guessing what else moved.
        onJobCompleted(forThisJob(invalidate)),
        onJobFailed(forThisJob(invalidate)),
        onSceneAudioReady(forThisJob(invalidate)),
      ];
    },
  });
}
