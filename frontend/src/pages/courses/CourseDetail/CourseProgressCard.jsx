import { AudioLines, FileText } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { DescriptionList } from "../../../components/ui/DescriptionList";
import { CircularProgress } from "../../../components/ui/CircularProgress";
import { Progress } from "../../../components/ui/Progress";

const percentOf = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);

const StageBar = ({ icon: Icon, label, done, total }) => (
  <div>
    <div className="mb-1 flex items-center justify-between text-[13px] text-text-secondary">
      <span className="flex items-center gap-1.5">
        <Icon className="size-3.5" /> {label}
      </span>
      <span className="tabular-nums">
        {done}/{total}
      </span>
    </div>
    <Progress percent={percentOf(done, total)} showLabel={false} size="sm" />
  </div>
);

/** Course facts on the left; overall, script and audio completion on the right. */
export function CourseProgressCard({ course, videos }) {
  const totalVideos = course?.videoCount || 0;
  const completedVideos = course?.completedVideoCount || 0;
  const scriptCompletedCount = videos.filter((v) => v.scriptStatus === "Completed").length;
  const audioCompletedCount = videos.filter((v) => v.audioStatus === "Completed").length;

  const infoItems = [
    { label: "Category", value: course?.category || "—" },
    { label: "Difficulty", value: course?.difficulty || "—" },
    { label: "Language", value: course?.language || "—" },
    { label: "Status", value: <Badge>{course?.status}</Badge> },
  ];

  return (
    <Card className="mb-4 p-4 sm:p-6">
      <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-2">
        <DescriptionList items={infoItems} columns={2} />
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4 md:justify-self-center">
          <div className="flex flex-col items-center gap-2">
            <CircularProgress percent={percentOf(completedVideos, totalVideos)} size={80} stroke={7} label={`${completedVideos}/${totalVideos}`} />
            <p className="text-[13px] text-text-secondary">
              {completedVideos} of {totalVideos} videos completed
            </p>
          </div>
          <div className="flex w-full max-w-44 min-w-36 flex-col gap-3">
            <StageBar icon={FileText} label="Script" done={scriptCompletedCount} total={totalVideos} />
            <StageBar icon={AudioLines} label="Audio" done={audioCompletedCount} total={totalVideos} />
          </div>
        </div>
      </div>
    </Card>
  );
}
