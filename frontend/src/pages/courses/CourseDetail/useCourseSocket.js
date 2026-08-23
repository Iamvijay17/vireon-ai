import { useState, useEffect, useCallback, useRef } from "react";
import {
  connect,
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
  onConnect,
  onDisconnect,
  isConnected,
} from "../../../services/socket";

/**
 * Joins the course's socket room and keeps the video list/course record in
 * sync with every course-video event, refreshing on both the lightweight
 * patchVideo() merge and (for events that can touch fields not carried in
 * the payload, like per-stage status) a full refetch. Returns the current
 * connection status for the header's Live/Offline badge.
 */
export function useCourseSocket(id, fetchVideos, fetchCourse, patchVideo) {
  const [socketStatus, setSocketStatus] = useState(() => (isConnected() ? "connected" : "disconnected"));
  const unsubscribesRef = useRef([]);

  const cleanupSockets = useCallback(() => {
    unsubscribesRef.current.forEach((unsubscribe) => unsubscribe && unsubscribe());
    unsubscribesRef.current = [];
  }, []);

  useEffect(() => {
    if (!id) return undefined;

    cleanupSockets();
    connect();
    joinCourseRoom(id);
    setSocketStatus(isConnected() ? "connected" : "disconnected");

    // The table shows per-stage (Script/Audio/Video) status columns that
    // aren't threaded through every socket payload - simplest correct fix is
    // to also refetch the list on any event that could touch a stage field,
    // in addition to the existing lightweight patchVideo() merges below.
    unsubscribesRef.current.push(
      onCourseVideoCreated(() => {
        fetchVideos();
        fetchCourse();
      })
    );
    unsubscribesRef.current.push(
      onCourseVideoDeleted(() => {
        fetchVideos();
        fetchCourse();
      })
    );
    unsubscribesRef.current.push(
      onCourseVideoProgress((data) => {
        patchVideo(data.videoId, { status: data.status });
        fetchVideos();
      })
    );
    unsubscribesRef.current.push(
      onCourseVideoScriptReady((data) => {
        patchVideo(data.videoId, { status: data.status, script: data.script });
        fetchVideos();
      })
    );
    unsubscribesRef.current.push(
      onCourseVideoAudioReady((data) => {
        patchVideo(data.videoId, { status: data.status, audioUrl: data.audioUrl, audioDuration: data.audioDuration });
        fetchVideos();
      })
    );
    unsubscribesRef.current.push(
      onCourseVideoRenderReady((data) => {
        patchVideo(data.videoId, { status: data.status, renderUrl: data.renderUrl });
        fetchVideos();
        fetchCourse();
      })
    );
    unsubscribesRef.current.push(
      onCourseVideoUpdated((data) => {
        // Cloud upload can swap script/audioUrl/renderUrl together - just
        // refetch the list rather than partially merging.
        patchVideo(data.videoId, { status: data.status });
        fetchVideos();
      })
    );
    unsubscribesRef.current.push(
      onJobFailed((data) => {
        if (!data.videoId) return;
        patchVideo(data.videoId, { status: data.status });
        fetchVideos();
      })
    );
    unsubscribesRef.current.push(
      onConnect(() => {
        setSocketStatus("connected");
        // Rooms aren't remembered across a reconnect - rejoin and resync
        // in case events fired while we were disconnected.
        joinCourseRoom(id);
        fetchVideos();
        fetchCourse();
      })
    );
    unsubscribesRef.current.push(
      onDisconnect((reason) => setSocketStatus(reason === "io client disconnect" ? "disconnected" : "reconnecting"))
    );

    return () => {
      leaveCourseRoom(id);
      cleanupSockets();
    };
    // patchVideo is intentionally not a dependency here, matching the
    // original inline effect.
  }, [id, fetchVideos, fetchCourse, cleanupSockets]);

  return socketStatus;
}
