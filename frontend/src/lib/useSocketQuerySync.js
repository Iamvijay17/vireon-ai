import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  connect,
  onJobCreated, onJobProgress, onJobCompleted, onJobFailed,
  onCourseVideoCreated, onCourseVideoDeleted, onCourseVideoUpdated,
  onCourseVideoProgress, onCourseVideoRenderReady,
  onAudioStudioCompleted, onAudioStudioFailed,
} from '../services/socket';
import { queryKeys } from './queryClient';

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

    const invalidate = (key) => queryClient.invalidateQueries({ queryKey: key });

    // Any video-job event changes both the unified jobs console and the
    // video-specific lists.
    const invalidateJob = (payload) => {
      invalidate(queryKeys.jobs.all);
      invalidate(queryKeys.videos.all);
      const id = payload?.jobId || payload?._id;
      if (id) invalidate(queryKeys.videos.detail(String(id)));
    };

    const invalidateCourseVideo = (payload) => {
      invalidate(queryKeys.jobs.all);
      invalidate(queryKeys.courses.all);
      const courseId = payload?.courseId;
      if (courseId) invalidate(queryKeys.courses.videos(String(courseId)));
    };

    const invalidateAudio = () => {
      invalidate(queryKeys.audio.all);
      invalidate(queryKeys.jobs.all);
    };

    // Every listener returns its own unsubscribe (see services/socket.js),
    // so cleanup is just calling them all - no socket.off name-matching.
    const unsubscribers = [
      onJobCreated(invalidateJob),
      onJobProgress(invalidateJob),
      onJobCompleted(invalidateJob),
      onJobFailed(invalidateJob),

      onCourseVideoCreated(invalidateCourseVideo),
      onCourseVideoDeleted(invalidateCourseVideo),
      onCourseVideoUpdated(invalidateCourseVideo),
      onCourseVideoProgress(invalidateCourseVideo),
      onCourseVideoRenderReady(invalidateCourseVideo),

      onAudioStudioCompleted(invalidateAudio),
      onAudioStudioFailed(invalidateAudio),
    ];

    return () => unsubscribers.forEach((off) => off());
  }, [queryClient]);
}
