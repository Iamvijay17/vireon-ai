import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  ArrowLeft,
  Pencil,
  Trash2,
  PlayCircle,
  FileText,
  AudioLines,
  Video,
  CheckCircle2,
  Clock,
  MoreHorizontal,
  Sparkles,
  Zap,
  RotateCw,
  Square,
  Ban,
} from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { EmptyState, LoadingState } from "../../components";
import { useSetBreadcrumbLabel } from "../../shared/breadcrumbContextValue";
import { loadSettings } from "../../shared/settingsStorage";
import { useFavoriteVoices } from "../../shared/useFavoriteVoices";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Tooltip } from "../../components/ui/Tooltip";
import { Modal } from "../../components/ui/Modal";
import { Dropdown, DropdownItem } from "../../components/ui/Dropdown";
import { DescriptionList } from "../../components/ui/DescriptionList";
import { CircularProgress } from "../../components/ui/CircularProgress";
import { Progress } from "../../components/ui/Progress";
import { Select } from "../../components/ui/Select";
import { VoiceSelect } from "../../components/ui/VoiceSelect";
import { Input, Textarea, Label, FieldHint } from "../../components/ui/Input";
import { Table } from "../../components/ui/Table";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";
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
  saveCourseCurriculumDraft,
  clearCourseCurriculumDraft,
  bulkGenerateCourseVideos,
  bulkApproveCourseVideoScripts,
  bulkDeleteCourseVideos,
  getCourseWorkerStatus,
} from "../../services/api";
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
  onCourseWorkerStatus,
  onConnect,
  onDisconnect,
  isConnected,
} from "../../services/socket";

const VIDEO_STATUS = {
  Draft: { variant: "neutral", icon: FileText },
  "Generating Script": { variant: "accent", icon: FileText },
  "Script Generated": { variant: "info", icon: FileText },
  "Waiting for Approval": { variant: "warning", icon: FileText },
  Approved: { variant: "accent", icon: CheckCircle2 },
  "Generating Audio": { variant: "accent", icon: AudioLines },
  "Audio Generated": { variant: "info", icon: AudioLines },
  "Generating Scenes": { variant: "accent", icon: FileText },
  "Scenes Generated": { variant: "info", icon: FileText },
  "Generating Images": { variant: "accent", icon: FileText },
  "Images Generated": { variant: "warning", icon: FileText },
  "Rendering Video": { variant: "accent", icon: Video },
  Uploading: { variant: "accent", icon: Video },
  Completed: { variant: "success", icon: CheckCircle2 },
  Failed: { variant: "danger", icon: Clock },
  Cancelled: { variant: "neutral", icon: Ban },
};

// Independent per-stage status (Script/Audio/Video), shown as a compact icon
// chip in the table's Pipeline column instead of a separate column each.
const STAGE_DOT_CLASSES = {
  Pending: "border-border text-text-tertiary",
  Queued: "border-accent/40 bg-accent/10 text-accent",
  Processing: "border-accent bg-accent/10 text-accent animate-pulse",
  Completed: "border-success-500/40 bg-success-500/10 text-success-600",
  Failed: "border-danger-500/40 bg-danger-500/10 text-danger-500",
  Cancelled: "border-border text-text-tertiary",
};

const DURATION_OPTIONS = [
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 15, label: "15 minutes" },
];

// Shown while the real voice catalog is loading (or if it fails to load).
const FALLBACK_VOICE_OPTIONS = [
  { value: "female-1", label: "Female Voice 1" },
  { value: "male-1", label: "Male Voice 1" },
];

const STYLE_OPTIONS = [
  { value: "educational", label: "Educational" },
  { value: "story", label: "Story" },
  { value: "motivational", label: "Motivational" },
  { value: "business", label: "Business" },
];

const EMPTY_FORM = { title: "", topic: "", duration: 5, voice: "female-1", style: "educational", additionalInstructions: "" };

const CATEGORY_OPTIONS = [
  { value: "Web Development", label: "Web Development" },
  { value: "Mobile Development", label: "Mobile Development" },
  { value: "Data Science", label: "Data Science" },
  { value: "Machine Learning", label: "Machine Learning" },
  { value: "DevOps", label: "DevOps" },
  { value: "Design", label: "Design" },
  { value: "Business", label: "Business" },
  { value: "Marketing", label: "Marketing" },
  { value: "Other", label: "Other" },
];

const DIFFICULTY_OPTIONS = [
  { value: "Beginner", label: "Beginner" },
  { value: "Intermediate", label: "Intermediate" },
  { value: "Advanced", label: "Advanced" },
];

const LANGUAGE_OPTIONS = [
  { value: "english", label: "English" },
  { value: "hindi", label: "Hindi" },
  { value: "spanish", label: "Spanish" },
  { value: "french", label: "French" },
  { value: "german", label: "German" },
  { value: "japanese", label: "Japanese" },
  { value: "korean", label: "Korean" },
];

const COURSE_EDIT_EMPTY_FORM = { title: "", description: "", category: "Other", difficulty: "Beginner", language: "english" };

const BULK_ACTIONS = [
  { action: "generate-script", label: "Generate Scripts", icon: FileText },
  { action: "generate-audio", label: "Generate Audio", icon: AudioLines },
  { action: "render", label: "Render Videos", icon: Video },
  { action: "generate-full", label: "Generate Everything", icon: Zap },
];

const StageDot = ({ label, status, error, icon: Icon }) => {
  const cls = STAGE_DOT_CLASSES[status] || STAGE_DOT_CLASSES.Pending;
  const tooltip = `${label}: ${status}${status === "Failed" && error?.message ? ` — ${error.message}` : ""}`;
  return (
    <Tooltip content={tooltip}>
      <span className={`flex size-6 items-center justify-center rounded-md border ${cls}`}>
        <Icon className="size-3.5" />
      </span>
    </Tooltip>
  );
};

const stageActionLabel = (stageLabel, status) => {
  if (status === "Failed") return `Retry ${stageLabel}`;
  if (status === "Completed") return `Regenerate ${stageLabel}`;
  return `Generate ${stageLabel}`;
};

// A video mid-pipeline can't be re-queued into another stage until its
// current job finishes (or is stopped) - matches the backend's
// concurrency:1 course-video queue and CourseVideoService's per-stage
// PROCESSING/QUEUED handling.
const BUSY_STATUSES = [
  "Generating Script",
  "Generating Audio",
  "Generating Scenes",
  "Generating Images",
  "Rendering Video",
  "Uploading",
];
const isVideoBusy = (video) => BUSY_STATUSES.includes(video.status);
const videoHasApprovedScript = (video) => Boolean(video.approved);
const videoHasAudio = (video) => Boolean(video.audioUrl);
const videoCanApprove = (video) => ["Script Generated", "Waiting for Approval"].includes(video.status) && !video.approved;

// Per-video eligibility for each pipeline action, mirroring the same
// prerequisites CourseVideoService enforces server-side (approveScript,
// generateAudio, renderVideo, prepareBulkJobs) so the buttons never invite a
// request the backend will just reject. `reason` is a function (not a fixed
// string) so a busy video shows "already processing" rather than a stale
// prerequisite message that no longer matches why the button is disabled.
const ACTION_GATES = {
  "generate-script": {
    eligible: (v) => !isVideoBusy(v),
    reason: () => "This lesson is already processing",
  },
  "generate-audio": {
    eligible: (v) => !isVideoBusy(v) && videoHasApprovedScript(v),
    reason: (v) => (isVideoBusy(v) ? "This lesson is already processing" : "Approve the script before generating audio"),
  },
  render: {
    eligible: (v) => !isVideoBusy(v) && videoHasAudio(v),
    reason: (v) => (isVideoBusy(v) ? "This lesson is already processing" : "Generate audio before rendering the video"),
  },
  "generate-full": {
    eligible: (v) => !isVideoBusy(v),
    reason: () => "This lesson is already processing",
  },
};

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
  const [socketStatus, setSocketStatus] = useState(() => (isConnected() ? "connected" : "disconnected"));
  const [workerRunning, setWorkerRunning] = useState(null); // null = unknown, boolean once checked
  const unsubscribesRef = useRef([]);

  const [curriculumModalVisible, setCurriculumModalVisible] = useState(false);
  const [curriculumStep, setCurriculumStep] = useState("form"); // "form" | "preview"
  const [curriculumForm, setCurriculumForm] = useState(EMPTY_FORM);
  const [curriculumError, setCurriculumError] = useState("");
  const [curriculumPreviewLoading, setCurriculumPreviewLoading] = useState(false);
  const [curriculumLessons, setCurriculumLessons] = useState([]);
  const [curriculumCreating, setCurriculumCreating] = useState(false);
  // Tracks which course id the curriculum draft has been hydrated from the
  // server for, so the autosave effect below doesn't fire (and stomp the
  // server copy with blank pre-hydration state) before hydration runs.
  const hydratedDraftIdRef = useRef(null);
  const draftSaveTimeoutRef = useRef(null);

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

  // Restore a server-saved curriculum draft (if any) once per course, so
  // navigating away mid-review and coming back doesn't lose the generated
  // lessons. Marks hydration done (hydratedDraftIdRef) *before* the autosave
  // effect below is allowed to run, so that effect can't fire on stale
  // pre-hydration state and overwrite the draft it's about to restore.
  useEffect(() => {
    if (!course?._id) return;
    if (hydratedDraftIdRef.current === course._id) return;
    hydratedDraftIdRef.current = course._id;
    const draft = course.curriculumDraft;
    if (draft?.lessons?.length > 0) {
      setCurriculumForm(draft.form || EMPTY_FORM);
      setCurriculumLessons(draft.lessons);
      setCurriculumStep(draft.step || "preview");
    }
  }, [course]);

  // Autosave the curriculum draft to the course document (debounced) so it
  // survives navigating away and coming back. Gated on hydratedDraftIdRef so
  // it never fires before the effect above has had a chance to restore any
  // existing draft first.
  useEffect(() => {
    if (!id || hydratedDraftIdRef.current !== id) return;
    clearTimeout(draftSaveTimeoutRef.current);
    if (curriculumLessons.length === 0) return undefined;
    draftSaveTimeoutRef.current = setTimeout(() => {
      saveCourseCurriculumDraft(id, { form: curriculumForm, lessons: curriculumLessons, step: curriculumStep }).catch(() => {
        // Best-effort autosave - a failure here shouldn't interrupt the user.
      });
    }, 600);
    return () => clearTimeout(draftSaveTimeoutRef.current);
  }, [id, curriculumForm, curriculumLessons, curriculumStep]);

  // Worker liveness for the "Generate/Render" buttons' running/offline
  // indicator: one REST call for the initial value, then the backend
  // pushes courseWorkerStatus over the socket whenever it changes (see
  // SocketService._pollWorkerStatus) instead of this tab polling on its own.
  useEffect(() => {
    let cancelled = false;
    getCourseWorkerStatus()
      .then((res) => {
        if (!cancelled) setWorkerRunning(res.data.running);
      })
      .catch(() => {
        if (!cancelled) setWorkerRunning(false);
      });
    const unsubscribe = onCourseWorkerStatus((data) => setWorkerRunning(data.running));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

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

    // The new table shows per-stage (Script/Audio/Video) status columns that
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
  }, [id, fetchVideos, fetchCourse, cleanupSockets]);

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

  const showCreateModal = () => {
    const prefs = loadSettings();
    setFormValues({
      ...EMPTY_FORM,
      voice: pickDefaultVoice(prefs.defaultVoice),
      style: prefs.defaultCourseStyle || EMPTY_FORM.style,
      duration: prefs.defaultCourseDuration || EMPTY_FORM.duration,
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
      additionalInstructions: video.additionalInstructions || "",
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
    if (curriculumLessons.length > 0) {
      setCurriculumModalVisible(true);
      return;
    }
    const prefs = loadSettings();
    setCurriculumForm({
      ...EMPTY_FORM,
      title: course?.title || "",
      // The course's own description already says what it's about - reuse
      // it as the default topic instead of asking the user to retype it.
      topic: course?.description || "",
      voice: pickDefaultVoice(prefs.defaultVoice),
      style: prefs.defaultCourseStyle || EMPTY_FORM.style,
      duration: prefs.defaultCourseDuration || EMPTY_FORM.duration,
    });
    setCurriculumError("");
    setCurriculumStep("form");
    setCurriculumModalVisible(true);
  };

  // Just hides the modal - deliberately keeps curriculumStep/curriculumLessons
  // intact so closing (X, backdrop, Escape, Cancel) doesn't throw away an
  // already-generated structure. Full reset only happens once videos are
  // actually created (see handleCreateCurriculumVideos).
  const closeCurriculumModal = () => {
    setCurriculumModalVisible(false);
  };

  const handlePreviewCurriculum = async () => {
    if (!curriculumForm.title.trim()) return setCurriculumError("Please enter a course title");
    if (!curriculumForm.topic.trim()) return setCurriculumError("Please enter a topic");
    try {
      setCurriculumPreviewLoading(true);
      const res = await generateCourseCurriculum(id, curriculumForm);
      setCurriculumLessons(
        (res.data.lessons || []).map((l) => ({ title: l.title || "", topic: l.topic || "", description: l.description || "" }))
      );
      setCurriculumStep("preview");
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
    setCurriculumLessons((prev) => prev.map((lesson, i) => (i === index ? { ...lesson, [field]: value } : lesson)));
  };

  const removeLessonRow = (index) => {
    setCurriculumLessons((prev) => prev.filter((_, i) => i !== index));
  };

  const addLessonRow = () => {
    setCurriculumLessons((prev) => [...prev, { title: "", topic: "", description: "" }]);
  };

  const handleCreateCurriculumVideos = async () => {
    if (curriculumLessons.length === 0) return toast.error("Add at least one lesson before creating videos");
    if (curriculumLessons.some((l) => !l.title.trim())) return toast.error("Every lesson needs a title");
    try {
      setCurriculumCreating(true);
      const res = await createCourseVideosFromCurriculum(id, { lessons: curriculumLessons, ...curriculumForm });
      toast.success(`Created ${res.data.videos?.length || 0} lessons`);
      // Videos are created now, so the preview is consumed - fully reset
      // (unlike closeCurriculumModal, which preserves it for resuming).
      setCurriculumModalVisible(false);
      setCurriculumStep("form");
      setCurriculumLessons([]);
      clearTimeout(draftSaveTimeoutRef.current);
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
    const selectedVideos = videos.filter((v) => videoIds.includes(v._id));
    const names = selectedVideos
      .slice(0, 3)
      .map((v) => `"${v.title}"`)
      .join(", ");
    const more = selectedVideos.length - 3;
    const ok = await confirmDialog({
      title: "Delete Videos",
      content: `Are you sure you want to delete ${selectedVideos.length} selected video${selectedVideos.length === 1 ? "" : "s"} (${names}${more > 0 ? ` and ${more} more` : ""})? This cannot be undone.`,
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

  const columns = [
    {
      key: "_select",
      title: (
        <input
          type="checkbox"
          className="size-4 cursor-pointer accent-accent"
          checked={videos.length > 0 && selectedIds.size === videos.length}
          onChange={toggleSelectAll}
        />
      ),
      width: 36,
      render: (video) => (
        <input
          type="checkbox"
          className="size-4 cursor-pointer accent-accent"
          checked={selectedIds.has(video._id)}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleSelect(video._id)}
        />
      ),
    },
    {
      key: "title",
      title: "Lesson",
      render: (video) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-text-primary">
            {video.order + 1}. {video.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-text-tertiary">
            {video.duration} min • {video.topic?.substring(0, 60)}
            {video.audioDuration > 0 && ` • ${Math.round(video.audioDuration)}s audio`}
          </p>
        </div>
      ),
    },
    {
      key: "pipeline",
      title: "Pipeline",
      render: (video) => (
        <div className="flex items-center gap-1">
          <StageDot label="Script" status={video.scriptStatus || "Pending"} error={video.scriptError} icon={FileText} />
          <StageDot label="Audio" status={video.audioStatus || "Pending"} error={video.audioError} icon={AudioLines} />
          <StageDot label="Video" status={video.videoStatus || "Pending"} error={video.videoError} icon={Video} />
        </div>
      ),
    },
    {
      key: "status",
      title: "Status",
      render: (video) => {
        const statusMeta = VIDEO_STATUS[video.status] || VIDEO_STATUS.Draft;
        const StatusIcon = statusMeta.icon;
        return (
          <Badge variant={statusMeta.variant} icon={<StatusIcon className="size-3" />}>
            {video.status}
          </Badge>
        );
      },
    },
    {
      key: "_actions",
      title: "",
      width: 48,
      render: (video) => (
        <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
          <Dropdown
            trigger={({ toggle }) => (
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label="Lesson actions"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle();
                }}
                icon={<MoreHorizontal className="size-4" />}
              />
            )}
          >
            {() => (
              <>
                <DropdownItem icon={<PlayCircle className="size-4" />} onClick={() => navigate(`/courses/${id}/videos/${video._id}`)}>
                  Open Video
                </DropdownItem>
                <DropdownItem
                  icon={<Pencil className="size-4" />}
                  disabled={isVideoBusy(video)}
                  title={isVideoBusy(video) ? "This lesson is already processing" : undefined}
                  onClick={() => showVideoEditModal(video)}
                >
                  Edit Details
                </DropdownItem>
                <DropdownItem
                  icon={<FileText className="size-4" />}
                  disabled={!ACTION_GATES["generate-script"].eligible(video)}
                  title={!ACTION_GATES["generate-script"].eligible(video) ? ACTION_GATES["generate-script"].reason(video) : undefined}
                  onClick={() => runGenerateAction([video._id], "generate-script")}
                >
                  {stageActionLabel("Script", video.scriptStatus || "Pending")}
                </DropdownItem>
                <DropdownItem
                  icon={<CheckCircle2 className="size-4" />}
                  disabled={!videoCanApprove(video)}
                  title={
                    !videoCanApprove(video)
                      ? video.approved
                        ? "Script is already approved"
                        : "Generate a script first"
                      : undefined
                  }
                  onClick={() => handleBulkApprove([video._id])}
                >
                  Approve Script
                </DropdownItem>
                <DropdownItem
                  icon={<AudioLines className="size-4" />}
                  disabled={!ACTION_GATES["generate-audio"].eligible(video)}
                  title={!ACTION_GATES["generate-audio"].eligible(video) ? ACTION_GATES["generate-audio"].reason(video) : undefined}
                  onClick={() => runGenerateAction([video._id], "generate-audio")}
                >
                  {stageActionLabel("Audio", video.audioStatus || "Pending")}
                </DropdownItem>
                <DropdownItem
                  icon={<Video className="size-4" />}
                  disabled={!ACTION_GATES.render.eligible(video)}
                  title={!ACTION_GATES.render.eligible(video) ? ACTION_GATES.render.reason(video) : undefined}
                  onClick={() => runGenerateAction([video._id], "render")}
                >
                  {stageActionLabel("Video", video.videoStatus || "Pending")}
                </DropdownItem>
                <DropdownItem
                  icon={<Zap className="size-4" />}
                  disabled={!ACTION_GATES["generate-full"].eligible(video)}
                  title={!ACTION_GATES["generate-full"].eligible(video) ? ACTION_GATES["generate-full"].reason(video) : undefined}
                  onClick={() => runGenerateAction([video._id], "generate-full")}
                >
                  Generate Everything
                </DropdownItem>
                {video.status !== "Draft" && !["Completed", "Failed", "Cancelled"].includes(video.status) && (
                  <DropdownItem danger icon={<Square className="size-4" />} onClick={() => handleStopVideo(video._id)}>
                    Stop
                  </DropdownItem>
                )}
                <DropdownItem danger icon={<Trash2 className="size-4" />} onClick={() => handleDeleteVideo(video)}>
                  Delete
                </DropdownItem>
              </>
            )}
          </Dropdown>
        </div>
      ),
    },
  ];

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

      {/* Create Video Modal */}
      <Modal
        open={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Create Video"
        width="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalVisible(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={submitting} onClick={handleCreateVideo}>
              Create Video
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label required>Video Title</Label>
            <Input
              placeholder="e.g., Introduction to React"
              value={formValues.title}
              onChange={(e) => setFormValues((prev) => ({ ...prev, title: e.target.value }))}
              error={Boolean(formError) && !formValues.title.trim()}
            />
          </div>
          <div>
            <Label required>Topic</Label>
            <Textarea
              rows={2}
              placeholder="e.g., Explain React from scratch for beginners."
              value={formValues.topic}
              onChange={(e) => setFormValues((prev) => ({ ...prev, topic: e.target.value }))}
              error={Boolean(formError) && !formValues.topic.trim()}
            />
          </div>
          {formError && <p className="text-xs text-danger-500">{formError}</p>}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Duration</Label>
              <Select options={DURATION_OPTIONS} value={formValues.duration} onChange={(v) => setFormValues((prev) => ({ ...prev, duration: v }))} />
            </div>
            <div>
              <Label>Voice</Label>
              <VoiceSelect
                options={voiceOptions}
                value={formValues.voice}
                onChange={(v) => setFormValues((prev) => ({ ...prev, voice: v }))}
                isFavorite={isFavorite}
                onToggleFavorite={toggleFavorite}
              />
              <FieldHint>Custom presets or cloned from your reference .wav files</FieldHint>
            </div>
            <div>
              <Label>Style</Label>
              <Select options={STYLE_OPTIONS} value={formValues.style} onChange={(v) => setFormValues((prev) => ({ ...prev, style: v }))} />
            </div>
          </div>
          <div>
            <Label>Additional Instructions (optional)</Label>
            <Textarea
              rows={2}
              placeholder="Any specific instructions for the AI..."
              value={formValues.additionalInstructions}
              onChange={(e) => setFormValues((prev) => ({ ...prev, additionalInstructions: e.target.value }))}
            />
          </div>
        </div>
      </Modal>

      {/* Edit Video Details Modal */}
      <Modal
        open={videoEditModalVisible}
        onClose={() => setVideoEditModalVisible(false)}
        title="Edit Video Details"
        width="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setVideoEditModalVisible(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={videoEditSubmitting} onClick={handleSaveVideoEdit}>
              Save Changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label required>Video Title</Label>
            <Input
              placeholder="e.g., Introduction to React"
              value={videoEditForm.title}
              onChange={(e) => setVideoEditForm((prev) => ({ ...prev, title: e.target.value }))}
              error={Boolean(videoEditError) && !videoEditForm.title.trim()}
            />
          </div>
          <div>
            <Label required>Topic</Label>
            <Textarea
              rows={2}
              placeholder="e.g., Explain React from scratch for beginners."
              value={videoEditForm.topic}
              onChange={(e) => setVideoEditForm((prev) => ({ ...prev, topic: e.target.value }))}
              error={Boolean(videoEditError) && !videoEditForm.topic.trim()}
            />
          </div>
          {videoEditError && <p className="text-xs text-danger-500">{videoEditError}</p>}
          <FieldHint>
            Changing these fields won't touch an already-generated script, audio, or render - regenerate the
            relevant stage afterward if you want it to reflect the new title/topic.
          </FieldHint>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Duration</Label>
              <Select options={DURATION_OPTIONS} value={videoEditForm.duration} onChange={(v) => setVideoEditForm((prev) => ({ ...prev, duration: v }))} />
            </div>
            <div>
              <Label>Voice</Label>
              <VoiceSelect
                options={voiceOptions}
                value={videoEditForm.voice}
                onChange={(v) => setVideoEditForm((prev) => ({ ...prev, voice: v }))}
                isFavorite={isFavorite}
                onToggleFavorite={toggleFavorite}
              />
            </div>
            <div>
              <Label>Style</Label>
              <Select options={STYLE_OPTIONS} value={videoEditForm.style} onChange={(v) => setVideoEditForm((prev) => ({ ...prev, style: v }))} />
            </div>
          </div>
          <div>
            <Label>Additional Instructions (optional)</Label>
            <Textarea
              rows={2}
              placeholder="Any specific instructions for the AI..."
              value={videoEditForm.additionalInstructions}
              onChange={(e) => setVideoEditForm((prev) => ({ ...prev, additionalInstructions: e.target.value }))}
            />
          </div>
        </div>
      </Modal>

      {/* Generate Udemy Course Structure Modal */}
      <Modal
        open={curriculumModalVisible}
        onClose={closeCurriculumModal}
        title={curriculumStep === "form" ? "Generate Udemy Course Structure" : "Review Lesson Structure"}
        description={
          curriculumStep === "form"
            ? "AI generates a full lesson outline. Scripts, audio, and video are not generated yet - you choose when to generate them, individually or in bulk."
            : "Review and edit the generated lessons before creating them. Nothing is saved until you click Create Videos."
        }
        width="xl"
        footer={
          curriculumStep === "form" ? (
            <>
              <Button variant="secondary" onClick={closeCurriculumModal}>
                Cancel
              </Button>
              <Button variant="primary" icon={<Sparkles className="size-4" />} loading={curriculumPreviewLoading} onClick={handlePreviewCurriculum}>
                Preview Structure
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setCurriculumStep("form")}>
                Back
              </Button>
              <Button variant="secondary" icon={<RotateCw className="size-4" />} loading={curriculumPreviewLoading} onClick={handleRegenerateCurriculum}>
                Regenerate
              </Button>
              <Button variant="primary" icon={<CheckCircle2 className="size-4" />} loading={curriculumCreating} onClick={handleCreateCurriculumVideos}>
                Create {curriculumLessons.length} Video{curriculumLessons.length === 1 ? "" : "s"}
              </Button>
            </>
          )
        }
      >
        {curriculumStep === "form" ? (
          <div className="space-y-4">
            <div>
              <Label required>Course Title</Label>
              <Input
                placeholder="e.g., Complete React Developer Course"
                value={curriculumForm.title}
                onChange={(e) => setCurriculumForm((prev) => ({ ...prev, title: e.target.value }))}
                error={Boolean(curriculumError) && !curriculumForm.title.trim()}
              />
            </div>
            <div>
              <Label required>Topic</Label>
              <Textarea
                rows={2}
                placeholder="e.g., React"
                value={curriculumForm.topic}
                onChange={(e) => setCurriculumForm((prev) => ({ ...prev, topic: e.target.value }))}
                error={Boolean(curriculumError) && !curriculumForm.topic.trim()}
              />
              <FieldHint>
                Pre-filled from the course description. Edit it to steer the AI - it designs 12-20 lessons covering
                this topic, from introduction through a practical summary.
              </FieldHint>
            </div>
            {curriculumError && <p className="text-xs text-danger-500">{curriculumError}</p>}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Duration per lesson</Label>
                <Select options={DURATION_OPTIONS} value={curriculumForm.duration} onChange={(v) => setCurriculumForm((prev) => ({ ...prev, duration: v }))} />
              </div>
              <div>
                <Label>Voice</Label>
                <VoiceSelect
                  options={voiceOptions}
                  value={curriculumForm.voice}
                  onChange={(v) => setCurriculumForm((prev) => ({ ...prev, voice: v }))}
                  isFavorite={isFavorite}
                  onToggleFavorite={toggleFavorite}
                />
              </div>
              <div>
                <Label>Style</Label>
                <Select options={STYLE_OPTIONS} value={curriculumForm.style} onChange={(v) => setCurriculumForm((prev) => ({ ...prev, style: v }))} />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="max-h-[50vh] space-y-2.5 overflow-y-auto pr-1">
              {curriculumLessons.map((lesson, index) => (
                <div key={index} className="rounded-lg border border-border-light p-3">
                  <div className="flex items-start gap-2">
                    <Badge variant="neutral" className="mt-2 shrink-0">
                      {index + 1}
                    </Badge>
                    <div className="min-w-0 flex-1 space-y-2">
                      <Input
                        placeholder="Lesson title"
                        value={lesson.title}
                        onChange={(e) => updateLessonField(index, "title", e.target.value)}
                        error={curriculumLessons.length > 0 && !lesson.title.trim()}
                      />
                      <Textarea
                        rows={2}
                        placeholder="What this lesson's video should teach"
                        value={lesson.topic}
                        onChange={(e) => updateLessonField(index, "topic", e.target.value)}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      aria-label={`Remove ${lesson.title || "lesson"}`}
                      onClick={() => removeLessonRow(index)}
                      icon={<Trash2 className="size-4 text-danger-500" />}
                    />
                  </div>
                </div>
              ))}
              {curriculumLessons.length === 0 && (
                <p className="py-6 text-center text-sm text-text-tertiary">No lessons - add one below or regenerate.</p>
              )}
            </div>
            <Button variant="secondary" size="sm" icon={<Plus className="size-3.5" />} onClick={addLessonRow}>
              Add Lesson
            </Button>
          </div>
        )}
      </Modal>

      {/* Edit Course Modal */}
      <Modal
        open={courseEditModalVisible}
        onClose={() => setCourseEditModalVisible(false)}
        title="Edit Course"
        width="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCourseEditModalVisible(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={courseEditSubmitting} onClick={handleSaveCourseEdit}>
              Save Changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label required>Course Name</Label>
            <Input
              placeholder="e.g., React Basics"
              value={courseEditForm.title}
              onChange={(e) => setCourseEditForm((prev) => ({ ...prev, title: e.target.value }))}
              error={Boolean(courseEditError)}
            />
            {courseEditError && <p className="mt-1.5 text-xs text-danger-500">{courseEditError}</p>}
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              rows={3}
              placeholder="Brief description of the course"
              value={courseEditForm.description}
              onChange={(e) => setCourseEditForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Category</Label>
              <Select options={CATEGORY_OPTIONS} value={courseEditForm.category} onChange={(v) => setCourseEditForm((prev) => ({ ...prev, category: v }))} />
            </div>
            <div>
              <Label>Difficulty</Label>
              <Select options={DIFFICULTY_OPTIONS} value={courseEditForm.difficulty} onChange={(v) => setCourseEditForm((prev) => ({ ...prev, difficulty: v }))} />
            </div>
          </div>
          <div>
            <Label>Language</Label>
            <Select options={LANGUAGE_OPTIONS} value={courseEditForm.language} onChange={(v) => setCourseEditForm((prev) => ({ ...prev, language: v }))} />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CourseDetail;
