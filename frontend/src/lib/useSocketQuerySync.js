import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  connect,
  onJobCreated, onJobProgress, onJobCompleted, onJobFailed,
  onCourseVideoCreated, onCourseVideoDeleted, onCourseVideoUpdated,
  onCourseVideoProgress, onCourseVideoRenderReady,
  onAudioStudioCompleted, onAudioStudioFailed,
  onPublishingJobUpdated, onPublishingAccountUpdated, onSocialPostUpdated,
} from '../services/socket';
import { queryKeys } from './queryClient';
import { createThrottle } from './throttle';

// A video job emits dozens of `*Progress` events over its life (37 for one
// real job). Each used to refetch the job lists and detail immediately; now the
// first refetches at once and the rest of a burst collapses into one more per
// window. Anything that changes what the lists show for good (created,
// completed, failed, deleted, ...) is never delayed.
export const PROGRESS_REFETCH_WINDOW_MS = 1500;

/**
 * Collects the query keys to invalidate and applies them in batches.
 * `queue(keys)` is for high-frequency events (leading + trailing throttle);
 * `now(keys)` flushes everything pending immediately. `cancel()` on unmount.
 */
export function createInvalidationBatcher(invalidate, windowMs = PROGRESS_REFETCH_WINDOW_MS) {
  const pending = new Map(); // serialized key -> key, so duplicates collapse
  const add = (keys) => keys.forEach((k) => pending.set(JSON.stringify(k), k));
  const flush = () => {
    const keys = [...pending.values()];
    pending.clear();
    keys.forEach(invalidate);
  };
  const throttledFlush = createThrottle(flush, windowMs);

  return {
    queue(keys) {
      add(keys);
      throttledFlush();
    },
    now(keys) {
      add(keys);
      throttledFlush.cancel();
      flush();
    },
    cancel() {
      throttledFlush.cancel();
      pending.clear();
    },
  };
}

/**
 * Bridges the socket to the query cache: one place that translates "the
 * backend says something changed" into "these cached queries are stale".
 *
 * This is what replaces the per-page `setInterval` + manual `setJobs(...)`
 * reconciliation. Those had two sources of truth for the same rows - a poll
 * that overwrote state wholesale and a socket handler that patched it - and
 * every page implemented the merge slightly differently.
 *
 * Invalidation rather than direct cache writes is deliberate: a progress
 * event carries a partial job (`{ _id, progress, status, currentStep }`),
 * not the full row the list renders, so writing it into the cache would
 * blank out fields the event does not include. Invalidating lets the server
 * remain the shape authority. React Query dedupes the refetches that result
 * from a burst of events.
 */
export function useSocketQuerySync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Individual pages call connect() for their own live views, but this
    // hook is the only app-level subscriber - without connecting here, a
    // page that never opened a socket would silently get no invalidations.
    // connect() is idempotent and nothing in the app calls disconnect(),
    // so this does not fight the per-page connections.
    connect();

    const batcher = createInvalidationBatcher((key) => queryClient.invalidateQueries({ queryKey: key }));

    // Keys a video-job event makes stale: the unified jobs console, the
    // video-specific lists and that job's own detail.
    const jobKeys = (payload) => {
      const keys = [queryKeys.jobs.all, queryKeys.videos.all];
      const id = payload?.jobId || payload?._id;
      if (id) keys.push(queryKeys.videos.detail(String(id)));
      return keys;
    };

    const courseVideoKeys = (payload) => {
      const keys = [queryKeys.jobs.all, queryKeys.courses.all];
      const courseId = payload?.courseId;
      if (courseId) keys.push(queryKeys.courses.videos(String(courseId)));
      return keys;
    };

    const audioKeys = () => [queryKeys.audio.all, queryKeys.jobs.all];

    // Progress events are batched; every other event flushes immediately.
    // Every listener returns its own unsubscribe (see services/socket.js),
    // so cleanup is just calling them all - no socket.off name-matching.
    const unsubscribers = [
      onJobCreated((p) => batcher.now(jobKeys(p))),
      onJobProgress((p) => batcher.queue(jobKeys(p))),
      onJobCompleted((p) => batcher.now(jobKeys(p))),
      onJobFailed((p) => batcher.now(jobKeys(p))),

      onCourseVideoCreated((p) => batcher.now(courseVideoKeys(p))),
      onCourseVideoDeleted((p) => batcher.now(courseVideoKeys(p))),
      onCourseVideoUpdated((p) => batcher.now(courseVideoKeys(p))),
      onCourseVideoProgress((p) => batcher.queue(courseVideoKeys(p))),
      onCourseVideoRenderReady((p) => batcher.now(courseVideoKeys(p))),

      // Upload progress is frequent (batched); a status change that ends a run is not.
      onPublishingJobUpdated((p) =>
        (['COMPLETED', 'FAILED', 'CANCELLED'].includes(p?.status) ? batcher.now : batcher.queue)([queryKeys.publishing.all])
      ),
      onPublishingAccountUpdated(() => batcher.now([queryKeys.publishing.accounts, queryKeys.publishing.capabilities, queryKeys.social.accounts, queryKeys.social.overview])),

      // Promotion Studio: progress is frequent (batched); a status that ends a run is not.
      onSocialPostUpdated((p) =>
        (['COMPLETED', 'FAILED', 'CANCELLED', 'SCHEDULED'].includes(p?.status) ? batcher.now : batcher.queue)([queryKeys.social.all])
      ),

      onAudioStudioCompleted(() => batcher.now(audioKeys())),
      onAudioStudioFailed(() => batcher.now(audioKeys())),

      () => batcher.cancel(),
    ];

    return () => unsubscribers.forEach((off) => off());
  }, [queryClient]);
}
