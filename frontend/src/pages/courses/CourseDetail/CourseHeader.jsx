import { Plus, Pencil, Trash2, MoreHorizontal, Sparkles, Square, Download } from "lucide-react";
import { PageHeader } from "../../../components";
import ConnectionIndicator from "../../../components/ConnectionIndicator";
import StatusBadge from "../../../components/StatusBadge";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Tooltip } from "../../../components/ui/Tooltip";
import { Dropdown, DropdownItem, DropdownDivider } from "../../../components/ui/Dropdown";
import { getCourseDownloadAllUrl } from "../../../services/api";

/** Title, live/worker state and the course-level actions. Rarer actions sit in the menu. */
export function CourseHeader({
  id,
  course,
  videos,
  socketStatus,
  workerRunning,
  stopLoading,
  onStopCourse,
  onGenerateStructure,
  onCreateVideo,
  onEditCourse,
  onDeleteCourse,
}) {
  const hasRender = videos.some((v) => v.renderUrl);
  const running = videos.some((v) => v.status !== "Draft" && !["Completed", "Failed", "Cancelled"].includes(v.status));

  return (
    <PageHeader
      title={<span className="[overflow-wrap:anywhere]">{course?.title}</span>}
      description={course?.description || "No description"}
      meta={
        <>
          {course?.status && <StatusBadge status={course.status} />}
          <ConnectionIndicator status={socketStatus} />
          {workerRunning !== null && (
            <Tooltip
              content={
                workerRunning
                  ? "The course worker is running - generation jobs will process."
                  : "The course worker is not running. Start it (npm run course-worker) before generating scripts, audio, or video - otherwise generation requests will be rejected."
              }
            >
              <Badge variant={workerRunning ? "success" : "danger"} dot>
                {workerRunning ? "Worker running" : "Worker offline"}
              </Badge>
            </Tooltip>
          )}
        </>
      }
      extra={
        <>
          {running && (
            <Button variant="danger" icon={<Square className="size-4" />} loading={stopLoading} onClick={onStopCourse}>
              Stop course
            </Button>
          )}
          <Button variant="secondary" icon={<Sparkles className="size-4" />} onClick={onGenerateStructure}>
            Generate structure
          </Button>
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={onCreateVideo}>
            Add lesson video
          </Button>
          <Dropdown
            trigger={({ toggle, open, id: menuId }) => (
              <Button
                variant="secondary"
                iconOnly
                aria-label="More course actions"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
                onClick={toggle}
                icon={<MoreHorizontal className="size-4" />}
              />
            )}
          >
            {({ close }) => (
              <>
                {hasRender && (
                  <DropdownItem
                    icon={<Download />}
                    onClick={() => {
                      close();
                      window.location.href = getCourseDownloadAllUrl(id);
                    }}
                  >
                    Download all videos
                  </DropdownItem>
                )}
                <DropdownItem
                  icon={<Pencil />}
                  onClick={() => {
                    close();
                    onEditCourse();
                  }}
                >
                  Edit course
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem
                  danger
                  icon={<Trash2 />}
                  onClick={() => {
                    close();
                    onDeleteCourse();
                  }}
                >
                  Delete course…
                </DropdownItem>
              </>
            )}
          </Dropdown>
        </>
      }
    />
  );
}
