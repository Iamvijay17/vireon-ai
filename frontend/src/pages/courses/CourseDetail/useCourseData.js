import { useState, useEffect, useCallback } from "react";
import { getCourse, getCourseVideos } from "../../../services/api";
import { toast } from "../../../components/ui/toastBus";

const recalcSummary = (list) =>
  list.reduce((acc, v) => {
    acc[v.status] = (acc[v.status] || 0) + 1;
    return acc;
  }, {});

/**
 * The course and its lesson videos: loads both on mount, and exposes the
 * refetchers plus `patchVideo`, which the socket uses to apply a live update
 * to one row (and keep the status summary in step) without a refetch.
 */
export function useCourseData(id, navigate) {
  const [course, setCourse] = useState(null);
  const [videos, setVideos] = useState([]);
  const [videoStatusSummary, setVideoStatusSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [videosLoading, setVideosLoading] = useState(true);

  const fetchCourse = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCourse(id);
      setCourse(res.data.course);
      setVideoStatusSummary(res.data.videoStatusSummary || {});
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to load course");
      navigate("/courses");
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  const fetchVideos = useCallback(async () => {
    setVideosLoading(true);
    try {
      const res = await getCourseVideos(id);
      setVideos(res.data.videos);
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to load videos");
    } finally {
      setVideosLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCourse();
    fetchVideos();
  }, [fetchCourse, fetchVideos]);

  const patchVideo = (videoId, patch) => {
    setVideos((prev) => {
      const updated = prev.map((v) => (v._id === videoId ? { ...v, ...patch } : v));
      setVideoStatusSummary(recalcSummary(updated));
      return updated;
    });
  };

  return { course, videos, videoStatusSummary, loading, videosLoading, fetchCourse, fetchVideos, patchVideo };
}
