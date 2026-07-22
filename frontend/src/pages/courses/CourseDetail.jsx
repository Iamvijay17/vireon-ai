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
} from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { EmptyState, LoadingState } from "../../components";
import { useSetBreadcrumbLabel } from "../../shared/breadcrumbContextValue";
import { Card, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Tooltip } from "../../components/ui/Tooltip";
import { Modal } from "../../components/ui/Modal";
import { Dropdown, DropdownItem } from "../../components/ui/Dropdown";
import { DescriptionList } from "../../components/ui/DescriptionList";
import { CircularProgress } from "../../components/ui/CircularProgress";
import { Select } from "../../components/ui/Select";
import { Input, Textarea, Label, FieldHint } from "../../components/ui/Input";
import { toast } from "../../components/ui/toastBus";
import { confirmDialog } from "../../components/ui/confirmBus";
import { getCourse, deleteCourse, getCourseVideos, createCourseVideo, deleteCourseVideo, getVoices } from "../../services/api";
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
  const [voiceCatalog, setVoiceCatalog] = useState({ custom: [], clone: [] });
  const [socketStatus, setSocketStatus] = useState(() => (isConnected() ? "connected" : "disconnected"));
  const unsubscribesRef = useRef([]);

  const fetchCourse = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCourse(id);
      setCourse(res.data.course);
      setVideoStatusSummary(res.data.videoStatusSummary || {});
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to load course");
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
      toast.error(err.response?.data?.error || "Failed to load videos");
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
      onCourseVideoProgress((data) => patchVideo(data.videoId, { status: data.status }))
    );
    unsubscribesRef.current.push(
      onCourseVideoScriptReady((data) => patchVideo(data.videoId, { status: data.status, script: data.script }))
    );
    unsubscribesRef.current.push(
      onCourseVideoAudioReady((data) =>
        patchVideo(data.videoId, { status: data.status, audioUrl: data.audioUrl, audioDuration: data.audioDuration })
      )
    );
    unsubscribesRef.current.push(
      onCourseVideoRenderReady((data) => {
        patchVideo(data.videoId, { status: data.status, renderUrl: data.renderUrl });
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
      })
    );
    unsubscribesRef.current.push(onConnect(() => setSocketStatus("connected")));
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
    ...voiceCatalog.custom.map((v) => ({ value: v.id, label: v.label, description: "Custom" })),
    ...voiceCatalog.clone.map((v) => ({ value: v.id, label: v.label, description: "Clone" })),
  ];
  if (voiceOptions.length === 0) voiceOptions.push(...FALLBACK_VOICE_OPTIONS);

  const showCreateModal = () => {
    setFormValues({ ...EMPTY_FORM, voice: voiceOptions[0]?.value || EMPTY_FORM.voice });
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

  const handleDeleteVideo = async (video) => {
    const ok = await confirmDialog({ title: "Delete Video", content: `Are you sure you want to delete "${video.title}"?`, confirmText: "Delete", danger: true });
    if (!ok) return;
    try {
      await deleteCourseVideo(video._id);
      toast.success("Video deleted");
      fetchVideos();
      fetchCourse();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to delete video");
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
      toast.error(err.response?.data?.error || "Failed to delete course");
    }
  };

  const totalVideos = course?.videoCount || 0;
  const completedVideos = course?.completedVideoCount || 0;
  const progressPercent = totalVideos > 0 ? Math.round((completedVideos / totalVideos) * 100) : 0;

  if (loading) return <LoadingState label="Loading course..." />;

  const infoItems = [
    { label: "Category", value: course?.category || "—" },
    { label: "Difficulty", value: course?.difficulty || "—" },
    { label: "Language", value: course?.language || "—" },
    { label: "Status", value: <Badge>{course?.status}</Badge> },
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
        </div>
        <div className="flex items-center gap-2">
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
                <DropdownItem icon={<Pencil className="size-4" />} onClick={() => navigate(`/courses/${id}/edit`)}>
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
          <div className="flex flex-col items-center gap-2 justify-self-center">
            <CircularProgress percent={progressPercent} size={80} stroke={7} label={`${completedVideos}/${totalVideos}`} />
            <p className="text-[13px] text-text-secondary">
              {completedVideos} of {totalVideos} videos completed
            </p>
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

      {/* Videos List */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Video className="size-4 text-text-tertiary" /> Videos
            </span>
          }
        />
        <div className="p-2">
          {videosLoading ? (
            <LoadingState label="Loading videos..." />
          ) : videos.length === 0 ? (
            <EmptyState description="No videos yet" actionLabel="Create Your First Video" onAction={showCreateModal} />
          ) : (
            <ul>
              {videos.map((video) => {
                const statusMeta = VIDEO_STATUS[video.status] || VIDEO_STATUS.Draft;
                const StatusIcon = statusMeta.icon;
                return (
                  <li key={video._id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/courses/${id}/videos/${video._id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/courses/${id}/videos/${video._id}`);
                        }
                      }}
                      className="flex w-full cursor-pointer items-center gap-4 rounded-lg border-b border-border-light px-3 py-3.5 text-left transition-colors last:border-0 hover:bg-surface-hover"
                    >
                      <Badge variant={statusMeta.variant} icon={<StatusIcon className="size-3" />} className="shrink-0">
                        {video.status}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-text-primary">
                          {video.order + 1}. {video.title}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-text-tertiary">
                          {video.duration} min • {video.topic?.substring(0, 60)}
                          {video.audioDuration > 0 && ` • ${Math.round(video.audioDuration)}s audio`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Tooltip content="Open Video">
                          <Button
                            variant="ghost"
                            size="sm"
                            iconOnly
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/courses/${id}/videos/${video._id}`);
                            }}
                            icon={<PlayCircle className="size-4" />}
                          />
                        </Tooltip>
                        <Tooltip content="Delete">
                          <Button
                            variant="ghost"
                            size="sm"
                            iconOnly
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteVideo(video);
                            }}
                            icon={<Trash2 className="size-4 text-danger-500" />}
                          />
                        </Tooltip>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
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
              <Select options={voiceOptions} value={formValues.voice} onChange={(v) => setFormValues((prev) => ({ ...prev, voice: v }))} />
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
    </div>
  );
};

export default CourseDetail;
