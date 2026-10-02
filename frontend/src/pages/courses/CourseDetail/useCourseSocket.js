import {
  joinCourseRoom,
  leaveCourseRoom,
  onCourseVideoCreated,
  onCourseVideoDeleted,
  onCourseVideoProgress,
  onCourseVideoScriptReady,
  onCourseVideoAudioReady,
  onCourseVideoRenderReady,
  onCourseVideoUpdated,
  onJobFailed,
} from "../../../services/socket";
import { useSocketRoom } from "../../../shared/useSocketRoom";

/**
 * Joins the course's socket room and keeps the video list/course record in
 * sync with every course-video event, refreshing on both the lightweight
 * patchVideo() merge and (for events that can touch fields not carried in
 * the payload, like per-stage status) a full refetch. Returns the current
 * connection status for the header's Live/Offline badge.
 *
 * The connect/join/status/cleanup lifecycle lives in useSocketRoom; what
 * remains here is only this page's event map.
 */
export function useCourseSocket(id, fetchVideos, fetchCourse, patchVideo) {
  return useSocketRoom(id, {
    join: joinCourseRoom,
    leave: leaveCourseRoom,

    // Rooms aren't remembered across a reconnect - resync in case events
    // fired while we were disconnected.
    onReconnect: () => {
      fetchVideos();
      fetchCourse();
    },

    // The table shows per-stage (Script/Audio/Video) status columns that
    // aren't threaded through every socket payload - simplest correct fix
    // is to also refetch the list on any event that could touch a stage
    // field, in addition to the lightweight patchVideo() merges.
    subscribe: () => [
      onCourseVideoCreated(() => {
        fetchVideos();
        fetchCourse();
      }),
      onCourseVideoDeleted(() => {
        fetchVideos();
        fetchCourse();
      }),
      onCourseVideoProgress((data) => {
        patchVideo(data.videoId, { status: data.status });
        fetchVideos();
      }),
      onCourseVideoScriptReady((data) => {
        patchVideo(data.videoId, { status: data.status, script: data.script });
        fetchVideos();
      }),
      onCourseVideoAudioReady((data) => {
        patchVideo(data.videoId, {
          status: data.status,
          audioUrl: data.audioUrl,
          audioDuration: data.audioDuration,
        });
        fetchVideos();
      }),
      onCourseVideoRenderReady((data) => {
        patchVideo(data.videoId, { status: data.status, renderUrl: data.renderUrl });
        fetchVideos();
        fetchCourse();
      }),
      onCourseVideoUpdated((data) => {
        // Cloud upload can swap script/audioUrl/renderUrl together - just
        // refetch the list rather than partially merging.
        patchVideo(data.videoId, { status: data.status });
        fetchVideos();
      }),
      onJobFailed((data) => {
        if (!data.videoId) return;
        patchVideo(data.videoId, { status: data.status });
        fetchVideos();
      }),
    ],
  });
}
