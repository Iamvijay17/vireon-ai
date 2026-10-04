import { useQueryClient } from "@tanstack/react-query";
import {
  joinJobRoom,
  leaveJobRoom,
  requestJobStatus,
  onJobProgress,
  onJobStatus,
  onJobCompleted,
  onJobFailed,
  onSceneAudioReady,
} from "../../services/socket";
import { useSocketRoom } from "../../shared/useSocketRoom";
import { queryKeys } from "../../lib/queryClient";

/**
 * Keeps the selected job's cached record live while the canvas shows it.
 *
 * Progress and status events are strict subsets of the job record, so they
 * are patched straight into the cache; events that change its shape
 * (completion, failure, scene audio) just invalidate it. A falsy `jobId`
 * (blueprint mode) joins no room at all.
 */
export function useWorkflowJobLive(jobId) {
  const queryClient = useQueryClient();

  return useSocketRoom(jobId, {
    join: joinJobRoom,
    leave: leaveJobRoom,

    onReconnect: (id) => {
      requestJobStatus(id);
      queryClient.invalidateQueries({ queryKey: queryKeys.videos.detail(id) });
    },

    subscribe: (id) => {
      const key = queryKeys.videos.detail(id);
      const forThisJob = (handler) => (data) => {
        if (String(data.jobId) === String(id)) handler(data);
      };
      // The cache holds the job record itself (same shape as the v2 detail
      // page, which shares this key), so fields patch in flat.
      const patch = (data) =>
        queryClient.setQueryData(key, (prev) =>
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
      const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: key });
        queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      };

      return [
        onJobProgress(forThisJob(patch)),
        onJobStatus(forThisJob(patch)),
        onJobCompleted(forThisJob(invalidate)),
        onJobFailed(forThisJob(invalidate)),
        onSceneAudioReady(forThisJob(invalidate)),
      ];
    },
  });
}
