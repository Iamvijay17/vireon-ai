import { useState, useEffect, useCallback } from "react";
import { Plus, ArrowLeft, Pencil, Trash2, AudioLines, Video, CheckCircle2, FileText, MoreHorizontal, Sparkles, Square, Download } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { EmptyState, LoadingState } from "../../../components";
import { useSetBreadcrumbLabel } from "../../../shared/breadcrumbContextValue";
import { loadSettings } from "../../../shared/settingsStorage";
import { useFavoriteVoices } from "../../../shared/useFavoriteVoices";
import { Card, CardHeader } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Tooltip } from "../../../components/ui/Tooltip";
import { Dropdown, DropdownItem } from "../../../components/ui/Dropdown";
import { DescriptionList } from "../../../components/ui/DescriptionList";
import { CircularProgress } from "../../../components/ui/CircularProgress";
import { Progress } from "../../../components/ui/Progress";
import { Table } from "../../../components/ui/Table";
import { toast } from "../../../components/ui/toastBus";
import { confirmDialog } from "../../../components/ui/confirmBus";
import {
  getCourse,
  updateCourse,
  deleteCourse,
  stopCourse,
  stopCourseVideo,
  getCourseVideos,
  createCourseVideo,
  updateCourseVideo,
  deleteCourseVideo,
  getVoices,
  generateCourseCurriculum,
  createCourseVideosFromCurriculum,
  clearCourseCurriculumDraft,
  bulkGenerateCourseVideos,
  bulkApproveCourseVideoScripts,
  bulkDeleteCourseVideos,
  getCourseDownloadAllUrl,
} from "../../../services/api";
import { VIDEO_STATUS, EMPTY_FORM, EMPTY_PROMO, FALLBACK_VOICE_OPTIONS, COURSE_EDIT_EMPTY_FORM, BULK_ACTIONS } from "./constants";
import { videoCanApprove, ACTION_GATES } from "./helpers";
import { useCourseWorkerStatus } from "../../../shared/useCourseWorkerStatus";
import { useCourseSocket } from "./useCourseSocket";
import { useCurriculumDraft } from "./useCurriculumDraft";
import { buildVideoColumns } from "./videoTableColumns";
import { CreateVideoModal } from "./CreateVideoModal";
import { VideoEditModal } from "./VideoEditModal";
import { CurriculumModal } from "./CurriculumModal";
import { CourseEditModal } from "./CourseEditModal";

const CourseDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [course, setCourse] = useState(null);
  useSetBreadcrumbLabel(course?.title);
  const [videos, setVideos] = useState([]);
  const [videoStatusSummary, setVideoStatusSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [videosLoading, setVideosLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [formValues, setFormValues] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [videoEditModalVisible, setVideoEditModalVisible] = useState(false);
  const [editingVideoId, setEditingVideoId] = useState(null);
  const [videoEditForm, setVideoEditForm] = useState(EMPTY_FORM);
  const [videoEditError, setVideoEditError] = useState("");
  const [videoEditSubmitting, setVideoEditSubmitting] = useState(false);
  const [voiceCatalog, setVoiceCatalog] = useState({ custom: [], clone: [] });
  const { isFavorite, toggleFavorite } = useFavoriteVoices();
  const workerRunning = useCourseWorkerStatus();

  const [curriculumModalVisible, setCurriculumModalVisible] = useState(false);
  const [curriculumError, setCurriculumError] = useState("");
  const [curriculumPreviewLoading, setCurriculumPreviewLoading] = useState(false);
  const [curriculumCreating, setCurriculumCreating] = useState(false);
  const curriculum = useCurriculumDraft(course, id);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(null);

  const [courseEditModalVisible, setCourseEditModalVisible] = useState(false);
  const [courseEditForm, setCourseEditForm] = useState(COURSE_EDIT_EMPTY_FORM);
  const [courseEditError, setCourseEditError] = useState("");
  const [courseEditSubmitting, setCourseEditSubmitting] = useState(false);

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

  const recalcSummary = (list) =>
    list.reduce((acc, v) => {
      acc[v.status] = (acc[v.status] || 0) + 1;
      return acc;
    }, {});

  const patchVideo = (videoId, patch) => {
    setVideos((prev) => {
      const updated = prev.map((v) => (v._id === videoId ? { ...v, ...patch } : v));
      setVideoStatusSummary(recalcSummary(updated));
      return updated;
    });
  };

  const socketStatus = useCourseSocket(id, fetchVideos, fetchCourse, patchVideo);

  useEffect(() => {
    let cancelled = false;
    getVoices()
      .then((res) => {
        if (!cancelled) setVoiceCatalog(res.data || { custom: [], clone: [] });
      })
      .catch(() => {
        // Keep FALLBACK_VOICE_OPTIONS if the catalog can't be loaded.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const voiceOptions = [
    ...voiceCatalog.custom.map((v) => ({ value: v.id, label: v.label, description: "Custom", previewUrl: v.previewUrl })),
    ...voiceCatalog.clone.map((v) => ({ value: v.id, label: v.label, description: "Clone", previewUrl: v.previewUrl })),
  ];
  if (voiceOptions.length === 0) voiceOptions.push(...FALLBACK_VOICE_OPTIONS);

  // Preferred voice comes from the Settings page if it's still a valid
  // option, otherwise falls back to whatever's first in the catalog.
  const pickDefaultVoice = (preferred) =>
    (preferred && voiceOptions.some((o) => o.value === preferred) ? preferred : voiceOptions[0]?.value) || EMPTY_FORM.voice;

  const handleCreateAvatarEnabledChange = (enabled) =>
    setFormValues((prev) => ({ ...prev, avatarEnabled: enabled, avatarPosition: enabled ? prev.avatarPosition || "bottom-right" : undefined }));

  const handleEditAvatarEnabledChange = (enabled) =>
    setVideoEditForm((prev) => ({ ...prev, avatarEnabled: enabled, avatarPosition: enabled ? prev.avatarPosition || "bottom-right" : undefined }));

  const showCreateModal = () => {
    const prefs = loadSettings();
    setFormValues({
      ...EMPTY_FORM,
      voice: pickDefaultVoice(prefs.defaultVoice),
      style: prefs.defaultCourseStyle || EMPTY_FORM.style,
      duration: prefs.defaultCourseDuration || EMPTY_FORM.duration,
      fastAudio: prefs.fastAudioGeneration ?? EMPTY_FORM.fastAudio,
    });
    setFormError("");
    setModalVisible(true);
  };

  const handleCreateVideo = async () => {
    if (!formValues.title.trim()) return setFormError("Please enter a video title");
    if (!formValues.topic.trim()) return setFormError("Please enter a topic");
    try {
      setSubmitting(true);
      await createCourseVideo(id, formValues);
      toast.success("Video created successfully");
      setModalVisible(false);
      fetchVideos();
      fetchCourse();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to create video");
    } finally {
      setSubmitting(false);
    }
  };

  const showVideoEditModal = (video) => {
    setEditingVideoId(video._id);
    setVideoEditForm({
      title: video.title || "",
      topic: video.topic || "",
      duration: video.duration || EMPTY_FORM.duration,
      voice: video.voice || EMPTY_FORM.voice,
      style: video.style || EMPTY_FORM.style,
      resolution: video.resolution || EMPTY_FORM.resolution,
      additionalInstructions: video.additionalInstructions || "",
      fastAudio: video.fastAudio ?? EMPTY_FORM.fastAudio,
      avatarEnabled: video.avatarEnabled ?? false,
      avatarPosition: video.avatarPosition || undefined,
    });
    setVideoEditError("");
    setVideoEditModalVisible(true);
  };

  const handleSaveVideoEdit = async () => {
    if (!videoEditForm.title.trim()) return setVideoEditError("Please enter a video title");
    if (!videoEditForm.topic.trim()) return setVideoEditError("Please enter a topic");
    try {
      setVideoEditSubmitting(true);
      await updateCourseVideo(editingVideoId, videoEditForm);
      toast.success("Video details updated");
      setVideoEditModalVisible(false);
      fetchVideos();
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to update video");
    } finally {
      setVideoEditSubmitting(false);
    }
  };

  const showCurriculumModal = () => {
    // A previously generated (LLM-call-expensive) preview is still sitting
    // in state - reopen straight back into it instead of discarding it and
    // forcing a full regeneration. Only start a blank form when there's
    // nothing to resume.
    if (curriculum.lessons.length > 0) {
      setCurriculumModalVisible(true);
      return;
    }
    const prefs = loadSettings();
    curriculum.setForm({
      ...EMPTY_FORM,
      title: course?.title || "",
      // The course's own description already says what it's about - reuse
      // it as the default topic instead of asking the user to retype it.
      topic: course?.description || "",
      voice: pickDefaultVoice(prefs.defaultVoice),
      style: prefs.defaultCourseStyle || EMPTY_FORM.style,
      duration: prefs.defaultCourseDuration || EMPTY_FORM.duration,
      fastAudio: prefs.fastAudioGeneration ?? EMPTY_FORM.fastAudio,
    });
    setCurriculumError("");
    curriculum.setStep("form");
    setCurriculumModalVisible(true);
  };

  // Just hides the modal - deliberately keeps curriculum step/lessons
  // intact so closing (X, backdrop, Escape, Cancel) doesn't throw away an
  // already-generated structure. Full reset only happens once videos are
  // actually created (see handleCreateCurriculumVideos).
  const closeCurriculumModal = () => {
    setCurriculumModalVisible(false);
  };

  const handlePreviewCurriculum = async () => {
    if (!curriculum.form.title.trim()) return setCurriculumError("Please enter a course title");
    if (!curriculum.form.topic.trim()) return setCurriculumError("Please enter a topic");
    try {
      setCurriculumPreviewLoading(true);
      const res = await generateCourseCurriculum(id, curriculum.form);
      curriculum.setLessons(
        (res.data.lessons || []).map((l) => ({ title: l.title || "", topic: l.topic || "", description: l.description || "" }))
      );
      curriculum.setSubtitle(res.data.subtitle || "");
      curriculum.setPromo(res.data.promo ? { ...EMPTY_PROMO, ...res.data.promo } : EMPTY_PROMO);
      curriculum.setStep("preview");
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to generate curriculum");
    } finally {
      setCurriculumPreviewLoading(false);
    }
  };

  const handleRegenerateCurriculum = async () => {
    const ok = await confirmDialog({
      title: "Regenerate Structure",
      content: "This will replace the current lesson list, discarding any edits you've made. Are you sure?",
    });
    if (!ok) return;
    await handlePreviewCurriculum();
  };

  const updateLessonField = (index, field, value) => {
    curriculum.setLessons((prev) => prev.map((lesson, i) => (i === index ? { ...lesson, [field]: value } : lesson)));
  };

  const removeLessonRow = (index) => {
    curriculum.setLessons((prev) => prev.filter((_, i) => i !== index));
  };

  const addLessonRow = () => {
    curriculum.setLessons((prev) => [...prev, { title: "", topic: "", description: "" }]);
  };

  const updatePromoField = (field, value) => {
    curriculum.setPromo((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateCurriculumVideos = async () => {
    if (curriculum.lessons.length === 0) return toast.error("Add at least one lesson before creating videos");
    if (curriculum.lessons.some((l) => !l.title.trim())) return toast.error("Every lesson needs a title");
    try {
      setCurriculumCreating(true);
      const res = await createCourseVideosFromCurriculum(id, {
        lessons: curriculum.lessons,
        promo: curriculum.promo.topic.trim() ? curriculum.promo : undefined,
        ...curriculum.form,
      });
      const createdCount = res.data.videos?.length || 0;
      const promoCreated = Boolean(res.data.promoVideo);
      toast.success(`Created ${createdCount} lesson${createdCount === 1 ? "" : "s"}${promoCreated ? " + 1 promo video" : ""}`);
      // Videos are created now, so the preview is consumed - fully reset
      // (unlike closeCurriculumModal, which preserves it for resuming).
      setCurriculumModalVisible(false);
      curriculum.setStep("form");
      curriculum.setLessons([]);
      curriculum.setSubtitle("");
      curriculum.setPromo(EMPTY_PROMO);
      clearTimeout(curriculum.draftSaveTimeoutRef.current);
      clearCourseCurriculumDraft(id).catch(() => {});
      // The backend also emits courseVideoCreated (which triggers a
      // refetch), but refresh directly too in case the socket missed it.
      fetchVideos();
      fetchCourse();
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to create videos");
    } finally {
      setCurriculumCreating(false);
    }
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

  const showCourseEditModal = () => {
    setCourseEditForm({ ...COURSE_EDIT_EMPTY_FORM, ...course });
    setCourseEditError("");
    setCourseEditModalVisible(true);
  };

  const handleSaveCourseEdit = async () => {
    if (!courseEditForm.title.trim()) return setCourseEditError("Please enter a course name");
    try {
      setCourseEditSubmitting(true);
      await updateCourse(id, courseEditForm);
      toast.success("Course updated successfully");
      setCourseEditModalVisible(false);
      fetchCourse();
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to update course");
    } finally {
      setCourseEditSubmitting(false);
    }
  };

  const handleDeleteCourse = async () => {
    const ok = await confirmDialog({
      title: "Delete Course",
      content: `Are you sure you want to delete "${course?.title}"? All videos will be deleted.`,
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteCourse(id);
      toast.success("Course deleted");
      navigate("/courses");
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to delete course");
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
      if (bulk) setSelectedIds(new Set());
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
      setSelectedIds(new Set());
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
      setSelectedIds(new Set());
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
      setSelectedIds(new Set());
      fetchVideos();
      fetchCourse();
    } catch (err) {
      toast.error(err.friendlyMessage || "Failed to delete videos");
    } finally {
      setBulkActionLoading(null);
    }
  };

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

  const selectedVideos = videos.filter((v) => selectedIds.has(v._id));
  const canApproveSelected = selectedVideos.some(videoCanApprove);

  const totalVideos = course?.videoCount || 0;
  const completedVideos = course?.completedVideoCount || 0;
  const progressPercent = totalVideos > 0 ? Math.round((completedVideos / totalVideos) * 100) : 0;
  const scriptCompletedCount = videos.filter((v) => v.scriptStatus === "Completed").length;
  const audioCompletedCount = videos.filter((v) => v.audioStatus === "Completed").length;
  const scriptPercent = totalVideos > 0 ? Math.round((scriptCompletedCount / totalVideos) * 100) : 0;
  const audioPercent = totalVideos > 0 ? Math.round((audioCompletedCount / totalVideos) * 100) : 0;

  if (loading) return <LoadingState label="Loading course..." />;

  const infoItems = [
    { label: "Category", value: course?.category || "—" },
    { label: "Difficulty", value: course?.difficulty || "—" },
    { label: "Language", value: course?.language || "—" },
    { label: "Status", value: <Badge>{course?.status}</Badge> },
  ];

  const columns = buildVideoColumns({
    videos,
    selectedIds,
    toggleSelectAll,
    toggleSelect,
    navigate,
    courseId: id,
    showVideoEditModal,
    runGenerateAction,
    handleBulkApprove,
    handleStopVideo,
    handleDeleteVideo,
  });

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="md" iconOnly aria-label="Back to courses" onClick={() => navigate("/courses")} icon={<ArrowLeft className="size-4" />} />
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-text-primary">{course?.title}</h1>
            <p className="mt-1 text-sm text-text-secondary">{course?.description || "No description"}</p>
          </div>
          <Badge variant={socketStatus === "connected" ? "success" : "neutral"} dot>
            {socketStatus === "connected" ? "Live" : socketStatus === "reconnecting" ? "Reconnecting..." : "Offline"}
          </Badge>
          {workerRunning !== null && (
            <Tooltip
              content={
                workerRunning
                  ? "The course worker is running - generation jobs will process."
                  : "The course worker is not running. Start it (npm run course-worker) before generating scripts, audio, or video - otherwise generation requests will be rejected."
              }
            >
              <Badge variant={workerRunning ? "success" : "danger"} dot>
                {workerRunning ? "Worker Running" : "Worker Offline"}
              </Badge>
            </Tooltip>
          )}
        </div>
        <div className="flex items-center gap-2">
          {videos.some((v) => v.status !== "Draft" && !["Completed", "Failed", "Cancelled"].includes(v.status)) && (
            <Button
              variant="danger"
              icon={<Square className="size-4" />}
              loading={bulkActionLoading === "stop-course"}
              onClick={handleStopCourse}
            >
              Stop Course
            </Button>
          )}
          <Button variant="secondary" icon={<Sparkles className="size-4" />} onClick={showCurriculumModal}>
            Generate Udemy Course Structure
          </Button>
          {videos.some((v) => v.renderUrl) && (
            <Button
              variant="secondary"
              icon={<Download className="size-4" />}
              onClick={() => {
                window.location.href = getCourseDownloadAllUrl(id);
              }}
            >
              Download All
            </Button>
          )}
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={showCreateModal}>
            Create Video
          </Button>
          <Dropdown
            trigger={({ toggle }) => (
              <Button variant="secondary" iconOnly aria-label="More course actions" onClick={toggle} icon={<MoreHorizontal className="size-4" />} />
            )}
          >
            {() => (
              <>
                <DropdownItem icon={<Pencil className="size-4" />} onClick={showCourseEditModal}>
                  Edit Course
                </DropdownItem>
                <DropdownItem danger icon={<Trash2 className="size-4" />} onClick={handleDeleteCourse}>
                  Delete Course
                </DropdownItem>
              </>
            )}
          </Dropdown>
        </div>
      </div>

      {/* Course Info */}
      <Card className="mb-4 p-6">
        <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-2">
          <DescriptionList items={infoItems} columns={2} />
          <div className="flex items-center gap-6 justify-self-center">
            <div className="flex flex-col items-center gap-2">
              <CircularProgress percent={progressPercent} size={80} stroke={7} label={`${completedVideos}/${totalVideos}`} />
              <p className="text-[13px] text-text-secondary">
                {completedVideos} of {totalVideos} videos completed
              </p>
            </div>
            <div className="flex w-44 flex-col gap-3">
              <div>
                <div className="mb-1 flex items-center justify-between text-[13px] text-text-secondary">
                  <span className="flex items-center gap-1.5">
                    <FileText className="size-3.5" /> Script
                  </span>
                  <span className="tabular-nums">
                    {scriptCompletedCount}/{totalVideos}
                  </span>
                </div>
                <Progress percent={scriptPercent} showLabel={false} size="sm" />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-[13px] text-text-secondary">
                  <span className="flex items-center gap-1.5">
                    <AudioLines className="size-3.5" /> Audio
                  </span>
                  <span className="tabular-nums">
                    {audioCompletedCount}/{totalVideos}
                  </span>
                </div>
                <Progress percent={audioPercent} showLabel={false} size="sm" />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Video Status Summary */}
      {Object.keys(videoStatusSummary).length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {Object.entries(videoStatusSummary).map(([status, count]) => (
            <Badge key={status} variant={VIDEO_STATUS[status]?.variant || "neutral"}>
              {status} · {count}
            </Badge>
          ))}
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <Card className="mb-4 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] font-semibold text-text-primary">{selectedIds.size} selected</span>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<CheckCircle2 className="size-3.5" />}
                loading={bulkActionLoading === "approve-script"}
                disabled={!canApproveSelected}
                title={!canApproveSelected ? "None of the selected lessons have a script ready to approve" : undefined}
                onClick={() => handleBulkApprove(Array.from(selectedIds))}
              >
                Approve Scripts
              </Button>
              {BULK_ACTIONS.map(({ action, label, icon: Icon }) => {
                const eligible = selectedVideos.some(ACTION_GATES[action].eligible);
                return (
                  <Button
                    key={action}
                    variant="secondary"
                    size="sm"
                    icon={<Icon className="size-3.5" />}
                    loading={bulkActionLoading === action}
                    disabled={!eligible}
                    title={!eligible ? "None of the selected lessons are eligible for this step" : undefined}
                    onClick={() => runGenerateAction(Array.from(selectedIds), action, { bulk: true })}
                  >
                    {label}
                  </Button>
                );
              })}
              <Button
                variant="danger"
                size="sm"
                icon={<Square className="size-3.5" />}
                loading={bulkActionLoading === "bulk-stop"}
                onClick={() => handleBulkStop(Array.from(selectedIds))}
              >
                Stop
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 className="size-3.5" />}
                loading={bulkActionLoading === "bulk-delete"}
                onClick={() => handleBulkDelete(Array.from(selectedIds))}
              >
                Delete
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Videos Table */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Video className="size-4 text-text-tertiary" /> Videos
            </span>
          }
        />
        <Table
          columns={columns}
          data={videos}
          rowKey="_id"
          loading={videosLoading}
          onRowClick={(video) => navigate(`/courses/${id}/videos/${video._id}`)}
          emptyContent={<EmptyState description="No videos yet" actionLabel="Create Your First Video" onAction={showCreateModal} />}
        />
      </Card>

      <CreateVideoModal
        open={modalVisible}
        onClose={() => setModalVisible(false)}
        formValues={formValues}
        setFormValues={setFormValues}
        formError={formError}
        submitting={submitting}
        onSubmit={handleCreateVideo}
        voiceOptions={voiceOptions}
        isFavorite={isFavorite}
        toggleFavorite={toggleFavorite}
        onAvatarEnabledChange={handleCreateAvatarEnabledChange}
      />

      <VideoEditModal
        open={videoEditModalVisible}
        onClose={() => setVideoEditModalVisible(false)}
        videoEditForm={videoEditForm}
        setVideoEditForm={setVideoEditForm}
        videoEditError={videoEditError}
        videoEditSubmitting={videoEditSubmitting}
        onSubmit={handleSaveVideoEdit}
        voiceOptions={voiceOptions}
        isFavorite={isFavorite}
        toggleFavorite={toggleFavorite}
        onAvatarEnabledChange={handleEditAvatarEnabledChange}
      />

      <CurriculumModal
        open={curriculumModalVisible}
        onClose={closeCurriculumModal}
        step={curriculum.step}
        setStep={curriculum.setStep}
        form={curriculum.form}
        setForm={curriculum.setForm}
        error={curriculumError}
        previewLoading={curriculumPreviewLoading}
        onPreview={handlePreviewCurriculum}
        onRegenerate={handleRegenerateCurriculum}
        lessons={curriculum.lessons}
        onUpdateLesson={updateLessonField}
        onRemoveLesson={removeLessonRow}
        onAddLesson={addLessonRow}
        subtitle={curriculum.subtitle}
        onSubtitleChange={curriculum.setSubtitle}
        promo={curriculum.promo}
        onUpdatePromoField={updatePromoField}
        creating={curriculumCreating}
        onCreateVideos={handleCreateCurriculumVideos}
        voiceOptions={voiceOptions}
        isFavorite={isFavorite}
        toggleFavorite={toggleFavorite}
        courseId={id}
        navigate={navigate}
      />

      <CourseEditModal
        open={courseEditModalVisible}
        onClose={() => setCourseEditModalVisible(false)}
        form={courseEditForm}
        setForm={setCourseEditForm}
        error={courseEditError}
        submitting={courseEditSubmitting}
        onSubmit={handleSaveCourseEdit}
      />
    </div>
  );
};

export default CourseDetail;
