import { Video } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { EmptyState, LoadingState } from "../../../components";
import { useSetBreadcrumbLabel } from "../../../shared/breadcrumbContextValue";
import { useFavoriteVoices } from "../../../shared/useFavoriteVoices";
import { useCourseWorkerStatus } from "../../../shared/useCourseWorkerStatus";
import { Card, CardHeader } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { Table } from "../../../components/ui/Table";
import { VIDEO_STATUS } from "./constants";
import { useCourseData } from "./useCourseData";
import { useCourseSocket } from "./useCourseSocket";
import { useVoiceOptions } from "./useVoiceOptions";
import { useVideoForms } from "./useVideoForms";
import { useCurriculumFlow } from "./useCurriculumFlow";
import { useCourseActions } from "./useCourseActions";
import { useLessonActions } from "./useLessonActions";
import { buildVideoColumns } from "./videoTableColumns";
import { CourseHeader } from "./CourseHeader";
import { CourseProgressCard } from "./CourseProgressCard";
import { BulkActionBar } from "./BulkActionBar";
import { CreateVideoModal } from "./CreateVideoModal";
import { VideoEditModal } from "./VideoEditModal";
import { CurriculumModal } from "./CurriculumModal";
import { CourseEditModal } from "./CourseEditModal";

/**
 * One course: its lessons table, bulk actions and the create / edit /
 * curriculum modals. State and handlers live in the use* hooks next to this
 * file, one per feature; this component only wires them to the UI.
 */
const CourseDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const { course, videos, videoStatusSummary, loading, videosLoading, fetchCourse, fetchVideos, patchVideo } = useCourseData(id, navigate);
  useSetBreadcrumbLabel(course?.title);
  const socketStatus = useCourseSocket(id, fetchVideos, fetchCourse, patchVideo);
  const workerRunning = useCourseWorkerStatus();

  const { isFavorite, toggleFavorite } = useFavoriteVoices();
  const { voiceOptions, pickDefaultVoice } = useVoiceOptions();
  const voiceProps = { voiceOptions, isFavorite, toggleFavorite };

  const videoForms = useVideoForms({ id, pickDefaultVoice, fetchVideos, fetchCourse });
  const curriculum = useCurriculumFlow({ id, course, pickDefaultVoice, fetchVideos, fetchCourse });
  const courseActions = useCourseActions({ id, course, navigate, fetchCourse });
  const lessons = useLessonActions({ id, videos, fetchVideos, fetchCourse });

  if (loading) return <LoadingState label="Loading course..." />;

  const columns = buildVideoColumns({
    videos,
    selectedIds: lessons.selectedIds,
    toggleSelectAll: lessons.toggleSelectAll,
    toggleSelect: lessons.toggleSelect,
    navigate,
    courseId: id,
    showVideoEditModal: videoForms.showVideoEditModal,
    runGenerateAction: lessons.runGenerateAction,
    handleBulkApprove: lessons.handleBulkApprove,
    handleStopVideo: lessons.handleStopVideo,
    handleDeleteVideo: lessons.handleDeleteVideo,
  });

  return (
    <div>
      <CourseHeader
        id={id}
        course={course}
        videos={videos}
        socketStatus={socketStatus}
        workerRunning={workerRunning}
        stopLoading={lessons.bulkActionLoading === "stop-course"}
        onBack={() => navigate("/courses")}
        onStopCourse={lessons.handleStopCourse}
        onGenerateStructure={curriculum.showCurriculumModal}
        onCreateVideo={videoForms.showCreateModal}
        onEditCourse={courseActions.showCourseEditModal}
        onDeleteCourse={courseActions.handleDeleteCourse}
      />

      <CourseProgressCard course={course} videos={videos} />

      {Object.keys(videoStatusSummary).length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {Object.entries(videoStatusSummary).map(([status, count]) => (
            <Badge key={status} variant={VIDEO_STATUS[status]?.variant || "neutral"}>
              {status} · {count}
            </Badge>
          ))}
        </div>
      )}

      <BulkActionBar videos={videos} actions={lessons} />

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
          emptyContent={<EmptyState description="No videos yet" actionLabel="Create Your First Video" onAction={videoForms.showCreateModal} />}
        />
      </Card>

      <CreateVideoModal {...videoForms.create} {...voiceProps} />
      <VideoEditModal {...videoForms.edit} {...voiceProps} />
      <CurriculumModal {...curriculum.modalProps} {...voiceProps} courseId={id} navigate={navigate} />
      <CourseEditModal {...courseActions.editModalProps} />
    </div>
  );
};

export default CourseDetail;
