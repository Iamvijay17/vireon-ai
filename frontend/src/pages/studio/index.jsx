import { useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { LoadingState, EmptyState } from "../../components";
import { ScenePreview } from "../../components/video/ScenePreview";
import { useForceSidebarCollapsed } from "../../shared/sidebarContextValue";
import { useFavoriteVoices } from "../../shared/useFavoriteVoices";
import { useVoiceOptions } from "../../shared/useVoiceOptions";
import { Card } from "../../components/ui/Card";
import { useStudioJob } from "./useStudioJob";
import { useSceneEditor } from "./useSceneEditor";
import { useStudioActions } from "./useStudioActions";
import { StudioToolbar } from "./StudioToolbar";
import { getStudioStage } from "./stage";
import { SceneTimeline } from "./SceneTimeline";
import { InspectorPanel } from "./InspectorPanel";
import { FALLBACK_VOICES } from "./constants";

const StudioPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const jobId = searchParams.get("id");

  // Full-width editor - collapse the global nav sidebar while this is open,
  // restoring whatever the user had on the way out.
  useForceSidebarCollapsed(true);

  const editor = useSceneEditor(jobId);
  const { job, setJob, loading, socketStatus } = useStudioJob(jobId, editor.resetScenes);
  const actions = useStudioActions({ jobId, job, setJob, editor, navigate });

  const [inspectorTab, setInspectorTab] = useState("content");
  const { isFavorite, toggleFavorite } = useFavoriteVoices();
  const { voiceOptions } = useVoiceOptions(FALLBACK_VOICES);

  const { editedScenes, hasChanges, selectedSceneIndex, setSelectedSceneIndex } = editor;

  const totalSeconds = useMemo(
    () => editedScenes.reduce((sum, s) => sum + (s.duration || 8), 0),
    [editedScenes],
  );

  if (loading) return <LoadingState label="Loading studio..." />;

  if (!job) {
    return <EmptyState description="Job not found" actionLabel="Back to Dashboard" onAction={() => navigate("/")} />;
  }

  const stage = getStudioStage(job);
  const scene = editedScenes[selectedSceneIndex];

  // Fixed-height three-pane workspace only from lg up; below that the panes
  // stack at natural height and the page itself scrolls, instead of
  // squeezing each pane into a few rows of nested scroll.
  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100dvh-8rem)] lg:min-h-[560px]">
      <StudioToolbar
        job={job}
        stage={stage}
        socketStatus={socketStatus}
        hasChanges={hasChanges}
        actions={actions}
        onBack={() => navigate("/")}
      />

      {editedScenes.length === 0 ? (
        <EmptyState description="No scenes found" />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[220px_minmax(0,1fr)_340px]">
          <SceneTimeline
            editedScenes={editedScenes}
            selectedSceneIndex={selectedSceneIndex}
            setSelectedSceneIndex={setSelectedSceneIndex}
            totalSeconds={totalSeconds}
            canEdit={stage.canEdit}
            dragIndexRef={editor.dragIndexRef}
            dragOverIndex={editor.dragOverIndex}
            setDragOverIndex={editor.setDragOverIndex}
            onDrop={editor.handleDrop}
            jobId={jobId}
          />

          {/* CENTER: LIVE PREVIEW */}
          <Card className="flex min-h-0 flex-col overflow-hidden max-lg:order-first">
            <div className="flex flex-1 flex-col justify-center p-2.5 sm:p-4">
              <ScenePreview
                scenes={editedScenes}
                focusIndex={selectedSceneIndex}
                onActiveSceneChange={setSelectedSceneIndex}
                hideChips
                videoId={jobId}
              />
            </div>
          </Card>

          <InspectorPanel
            scene={scene}
            selectedSceneIndex={selectedSceneIndex}
            setSelectedSceneIndex={setSelectedSceneIndex}
            sceneCount={editedScenes.length}
            canEdit={stage.canEdit}
            editor={editor}
            inspectorTab={inspectorTab}
            setInspectorTab={setInspectorTab}
            job={job}
            voiceOptions={voiceOptions}
            isFavorite={isFavorite}
            toggleFavorite={toggleFavorite}
            onVoiceChange={actions.handleVoiceChange}
            regeneratingScene={actions.regeneratingScene}
            onRegenerateScene={actions.handleRegenerateScene}
            // Only a finished job can re-roll a picture, and only from what is saved -
            // unsaved edits would be silently left behind when the page moves on.
            canRegenerateImage={["COMPLETED", "FAILED", "AUDIO_COMPLETED"].includes(job.status) && !hasChanges}
            regeneratingImage={actions.regeneratingImage}
            onRegenerateImage={actions.handleRegenerateImage}
            hasChanges={hasChanges}
            onRegenerationQueued={() => navigate(`/render?id=${jobId}`)}
          />
        </div>
      )}
    </div>
  );
};

export default StudioPage;
