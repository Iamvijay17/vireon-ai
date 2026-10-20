import { useState, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { RefreshCw, Redo2, Square, Pencil, Settings2 } from "lucide-react";
import { getVideoJob, getVideoJobActivityLogs } from "../../services/api";
import { LoadingState, ErrorState, PageHeader, StatusBadge, ConnectionIndicator } from "../../components";
import ProjectWorkspaceNav from "../../components/ProjectWorkspaceNav";
import { useSetBreadcrumbLabel } from "../../shared/breadcrumbContextValue";
import RenderQueue from "./RenderQueue";
import { Button } from "../../components/ui/Button";
import { Tooltip } from "../../components/ui/Tooltip";
import { useJobEvents } from "../../shared/useJobEvents";
import { useFavoriteVoices } from "../../shared/useFavoriteVoices";
import { useActivityLog } from "../../shared/useActivityLog";
import { useJobSocket } from "./useJobSocket";
import { useRenderActions } from "./useRenderActions";
import { useEditDetails } from "./useEditDetails";
import { deriveJobView } from "./jobView";
import { PipelineCard } from "./PipelineCard";
import { QualityReportCard } from "./QualityReportCard";
import { SceneAudioCard } from "./SceneAudioCard";
import { SpeechProgressCard } from "./SpeechProgressCard";
import { SpeechTimelineDebug } from "../../components/speech/SpeechTimelineDebug";
import { VideoPlayerCard } from "./VideoPlayerCard";
import { JobSidebar } from "./JobSidebar";
import { EditDetailsModal } from "./EditDetailsModal";

// The speech timing preview is for developers: dev builds, or ?dev=1 on any build.
const showSpeechDebug = (searchParams) => import.meta.env.DEV || searchParams.has("dev");

/**
 * One video job's live progress page (or, with no ?id=, the render queue).
 * What is shown for the job's status comes from deriveJobView; the actions
 * and the edit modal live in their own hooks.
 */
const RenderPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const jobId = searchParams.get("id");

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { isFavorite, toggleFavorite } = useFavoriteVoices();

  const videoRef = useRef(null);

  // The id is passed per call (the socket hook re-fetches for whichever
  // job it is handling), so the fetcher takes it as an argument.
  const { activityLog, fetchActivityLogs } = useActivityLog(getVideoJobActivityLogs);
  const { events: jobEvents, loading: eventsLoading } = useJobEvents("video", jobId);

  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    try {
      setLoading(true);
      const res = await getVideoJob(jobId);
      setJob(res.data.job);
      setError(null);
    } catch (err) {
      setError(err.friendlyMessage || "Failed to fetch job");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  const socketStatus = useJobSocket(jobId, fetchJob, fetchActivityLogs, setJob, setLoading);
  useSetBreadcrumbLabel(job?.topic);
  const actions = useRenderActions({ jobId, navigate, fetchJob, setJob });
  const edit = useEditDetails({ jobId, job, fetchJob });

  if (!jobId) return <RenderQueue />;

  if (loading) return <LoadingState label="Loading job details..." />;

  if (error && !job) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <ErrorState message="Error" description={error} />
        <Button className="mt-4" onClick={() => navigate("/projects")}>
          Back to My Projects
        </Button>
      </div>
    );
  }

  const v = deriveJobView(job);

  return (
    <div>
      <PageHeader
        title={job?.topic || "Render progress"}
        meta={
          <>
            <StatusBadge status={job?.status} />
            <ConnectionIndicator status={socketStatus} />
          </>
        }
        extra={
          <>
            <Button variant="secondary" icon={<RefreshCw className="size-4" />} loading={loading} onClick={fetchJob}>
              Refresh
            </Button>
            <Tooltip content={v.editDisabledReason || "Edit topic, duration, language, voice, or resolution"}>
              <Button variant="secondary" icon={<Settings2 className="size-4" />} disabled={!v.canEditDetails} onClick={edit.openEditModal}>
                Edit details
              </Button>
            </Tooltip>
            {(v.showGenericStudio || v.isComplete) && (
              <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => navigate(`/studio?id=${jobId}`)}>
                {v.isComplete ? "Open editor" : "Open Studio"}
              </Button>
            )}
            {(v.isFailed || v.canRestartCancelled) && (
              <Button variant="danger" icon={<Redo2 className="size-4" />} loading={actions.restartLoading} onClick={() => actions.handleRestart(false)}>
                Restart job
              </Button>
            )}
            {v.canRegenerateStuck && (
              <Button variant="secondary" icon={<Redo2 className="size-4" />} loading={actions.restartLoading} onClick={() => actions.handleRestart(true)}>
                Regenerate
              </Button>
            )}
            {v.canStop && (
              <Button variant="danger" icon={<Square className="size-4" />} loading={actions.stopLoading} onClick={actions.handleStop}>
                Stop
              </Button>
            )}
          </>
        }
      />

      <ProjectWorkspaceNav jobId={jobId} active="progress" hasScript={v.hasScript} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Left column: the result first when there is one, then the pipeline and what it produced */}
        <div className="flex min-w-0 flex-col gap-4">
          {v.isComplete && job?.videoUrl && <VideoPlayerCard job={job} videoRef={videoRef} />}

          <PipelineCard
            job={job}
            v={v}
            actions={actions}
            onReviewApprove={() => navigate(`/studio?id=${jobId}`)}
            onGenerateOrRerender={v.showGenerateRender ? actions.handleGenerateRender : actions.handleRerender}
          />

          <QualityReportCard report={job?.qualityReport} />

          {v.isActive && <SpeechProgressCard events={jobEvents} />}

          {v.hasScript && (
            <SceneAudioCard
              job={job}
              isActive={v.isActive}
              regeneratingScene={actions.regeneratingScene}
              onRegenerateScene={actions.handleRegenerateScene}
            />
          )}

          {v.hasScript && showSpeechDebug(searchParams) && <SpeechTimelineDebug jobId={jobId} />}
        </div>

        {/* Right Column - details + activity log */}
        <JobSidebar job={job} jobEvents={jobEvents} eventsLoading={eventsLoading} activityLog={activityLog} />
      </div>

      <EditDetailsModal {...edit.modalProps} isFavorite={isFavorite} toggleFavorite={toggleFavorite} />
    </div>
  );
};

export default RenderPage;
