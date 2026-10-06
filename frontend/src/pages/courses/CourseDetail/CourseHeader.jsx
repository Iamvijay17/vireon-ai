import { Plus, ArrowLeft, Pencil, Trash2, MoreHorizontal, Sparkles, Square, Download } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Tooltip } from "../../../components/ui/Tooltip";
import { Dropdown, DropdownItem } from "../../../components/ui/Dropdown";
import { getCourseDownloadAllUrl } from "../../../services/api";

/** Title, live/worker status badges and the course-level action buttons. */
export function CourseHeader({
  id,
  course,
  videos,
  socketStatus,
  workerRunning,
  stopLoading,
  onBack,
  onStopCourse,
  onGenerateStructure,
  onCreateVideo,
  onEditCourse,
  onDeleteCourse,
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <Button variant="ghost" size="md" iconOnly aria-label="Back to courses" onClick={onBack} icon={<ArrowLeft className="size-4" />} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-text-primary [overflow-wrap:anywhere]">{course?.title}</h1>
          <p className="mt-1 text-sm text-text-secondary">{course?.description || "No description"}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
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
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {videos.some((v) => v.status !== "Draft" && !["Completed", "Failed", "Cancelled"].includes(v.status)) && (
          <Button variant="danger" icon={<Square className="size-4" />} loading={stopLoading} onClick={onStopCourse}>
            Stop Course
          </Button>
        )}
        <Button variant="secondary" icon={<Sparkles className="size-4" />} onClick={onGenerateStructure}>
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
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={onCreateVideo}>
          Create Video
        </Button>
        <Dropdown
          trigger={({ toggle }) => (
            <Button variant="secondary" iconOnly aria-label="More course actions" onClick={toggle} icon={<MoreHorizontal className="size-4" />} />
          )}
        >
          {() => (
            <>
              <DropdownItem icon={<Pencil className="size-4" />} onClick={onEditCourse}>
                Edit Course
              </DropdownItem>
              <DropdownItem danger icon={<Trash2 className="size-4" />} onClick={onDeleteCourse}>
                Delete Course
              </DropdownItem>
            </>
          )}
        </Dropdown>
      </div>
    </div>
  );
}
