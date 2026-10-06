import { useState } from "react";
import {
  stopCourse,
  stopCourseVideo,
  deleteCourseVideo,
  bulkGenerateCourseVideos,
  bulkApproveCourseVideoScripts,
  bulkDeleteCourseVideos,
} from "../../../services/api";
import { toast } from "../../../components/ui/toastBus";
import { confirmDialog } from "../../../components/ui/confirmBus";

/**
 * Row selection plus every per-lesson and bulk action (generate, approve,
 * stop, delete). `bulkActionLoading` names the one action in flight, so the
 * button that started it can show a spinner.
 */
export function useLessonActions({ id, videos, fetchVideos, fetchCourse }) {
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(null);

  const clearSelection = () => setSelectedIds(new Set());

  const toggleSelect = (videoId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.size === videos.length ? new Set() : new Set(videos.map((v) => v._id))));
  };

  const handleDeleteVideo = async (video) => {
    const ok = await confirmDialog({ title: "Delete Video", content: `Are you sure you want to delete "${video.title}"?`, confirmText: "Delete", danger: true });
    if (!ok) return;
    try {
      await deleteCourseVideo(video._id);
      toast.success("Video deleted");
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(video._id);
        return next;
      });
      fetchVideos();
      fetchCourse();
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to delete video");
    }
  };

  const runGenerateAction = async (videoIds, action, { bulk = false } = {}) => {
    setBulkActionLoading(action);
    try {
      const res = await bulkGenerateCourseVideos(videoIds, action);
      const queued = res.data.queued ?? videoIds.length;
      const skipped = res.data.skipped || [];
      if (queued > 0) toast.success(bulk ? `${queued} lesson(s) queued` : "Queued");
      if (skipped.length > 0) {
        toast.error(
          bulk
            ? `Skipped ${skipped.length} lesson(s) - not ready for this step`
            : skipped[0]?.reason || "Not ready for this step"
        );
      }
      fetchVideos();
      if (bulk) clearSelection();
      return res;
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to queue generation");
      return null;
    } finally {
      setBulkActionLoading(null);
    }
  };

  const handleBulkApprove = async (videoIds) => {
    setBulkActionLoading("approve-script");
    try {
      const res = await bulkApproveCourseVideoScripts(videoIds);
      const { approved = [], skipped = [] } = res.data;
      if (approved.length > 0) toast.success(`Approved ${approved.length} script${approved.length === 1 ? "" : "s"}`);
      if (skipped.length > 0) toast.error(`Skipped ${skipped.length} video${skipped.length === 1 ? "" : "s"} (script not ready or already approved)`);
      fetchVideos();
      clearSelection();
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to approve scripts");
    } finally {
      setBulkActionLoading(null);
    }
  };

  const handleStopCourse = async () => {
    const ok = await confirmDialog({
      title: "Stop this course?",
      content: "This stops every lesson that isn't already completed, failed, or cancelled. Actively-processing lessons stop as soon as their current step finishes checking in.",
      confirmText: "Stop Course",
      danger: true,
    });
    if (!ok) return;

    setBulkActionLoading("stop-course");
    try {
      const res = await stopCourse(id);
      toast.success(`Stopped ${res.data.stopped} lesson${res.data.stopped === 1 ? "" : "s"}`);
      fetchVideos();
      fetchCourse();
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to stop course");
    } finally {
      setBulkActionLoading(null);
    }
  };

  const handleStopVideo = async (videoId) => {
    setBulkActionLoading(`stop-${videoId}`);
    try {
      await stopCourseVideo(videoId);
      toast.success("Lesson stopped");
      fetchVideos();
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to stop lesson");
    } finally {
      setBulkActionLoading(null);
    }
  };

  const handleBulkStop = async (videoIds) => {
    setBulkActionLoading("bulk-stop");
    try {
      const results = await Promise.allSettled(videoIds.map((vid) => stopCourseVideo(vid)));
      const stopped = results.filter((r) => r.status === "fulfilled").length;
      toast.success(`Stopped ${stopped} lesson${stopped === 1 ? "" : "s"}`);
      clearSelection();
      fetchVideos();
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to stop lessons");
    } finally {
      setBulkActionLoading(null);
    }
  };

  const handleBulkDelete = async (videoIds) => {
    const selectedVideosForDelete = videos.filter((v) => videoIds.includes(v._id));
    const names = selectedVideosForDelete
      .slice(0, 3)
      .map((v) => `"${v.title}"`)
      .join(", ");
    const more = selectedVideosForDelete.length - 3;
    const ok = await confirmDialog({
      title: "Delete Videos",
      content: `Are you sure you want to delete ${selectedVideosForDelete.length} selected video${selectedVideosForDelete.length === 1 ? "" : "s"} (${names}${more > 0 ? ` and ${more} more` : ""})? This cannot be undone.`,
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBulkActionLoading("bulk-delete");
    try {
      const res = await bulkDeleteCourseVideos(videoIds);
      toast.success(`Deleted ${res.data.deleted || videoIds.length} video${(res.data.deleted || videoIds.length) === 1 ? "" : "s"}`);
      clearSelection();
      fetchVideos();
      fetchCourse();
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to delete videos");
    } finally {
      setBulkActionLoading(null);
    }
  };

  return {
    selectedIds,
    bulkActionLoading,
    clearSelection,
    toggleSelect,
    toggleSelectAll,
    handleDeleteVideo,
    runGenerateAction,
    handleBulkApprove,
    handleStopCourse,
    handleStopVideo,
    handleBulkStop,
    handleBulkDelete,
  };
}
