import { Pencil, Trash2, PlayCircle, FileText, AudioLines, Video, CheckCircle2, MoreHorizontal, Zap, Square, Download } from "lucide-react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Dropdown, DropdownItem } from "../../../components/ui/Dropdown";
import { getCourseVideoDownloadUrl } from "../../../services/api";
import { VIDEO_STATUS } from "./constants";
import { isVideoBusy, videoCanApprove, stageActionLabel, ACTION_GATES } from "./helpers";
import { StageDot } from "./StageDot";

/**
 * Builds the videos table's column definitions. A plain function (not a
 * component) since Table expects a columns array, not JSX - kept in its
 * own file since the per-row actions dropdown is the single largest,
 * most self-contained chunk of CourseDetail's original JSX.
 */
export function buildVideoColumns({
  videos,
  selectedIds,
  toggleSelectAll,
  toggleSelect,
  navigate,
  courseId,
  showVideoEditModal,
  runGenerateAction,
  handleBulkApprove,
  handleStopVideo,
  handleDeleteVideo,
}) {
  return [
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
          <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-text-primary">
            {video.isPromo ? (
              <Badge variant="accent" className="shrink-0">
                Promo
              </Badge>
            ) : (
              <span>{video.order + 1}.</span>
            )}
            <span className="truncate">{video.title}</span>
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
                <DropdownItem icon={<PlayCircle className="size-4" />} onClick={() => navigate(`/courses/${courseId}/videos/${video._id}`)}>
                  Open Video
                </DropdownItem>
                {video.renderUrl && (
                  <DropdownItem
                    icon={<Download className="size-4" />}
                    onClick={() => {
                      window.location.href = getCourseVideoDownloadUrl(video._id);
                    }}
                  >
                    Download Video
                  </DropdownItem>
                )}
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
}
