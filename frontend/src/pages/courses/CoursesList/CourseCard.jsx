import { BookOpen, Pencil, Trash2, Layers, Globe2, GraduationCap } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Progress } from "../../../components/ui/Progress";
import { timeAgo } from "../../../lib/timeAgo";
import { STATUS_VARIANT, STATUS_ICON, toneForCategory } from "./constants";

/** One course in the grid: status, tags, video progress, hover actions. */
export const CourseCard = ({ course, onOpen, onEdit, onDelete }) => {
  const StatusIcon = STATUS_ICON[course.status] || BookOpen;
  const total = course.videoCount || 0;
  const completed = course.completedVideoCount || 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(course)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(course)}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between p-5 pb-3">
        <div className={`flex size-11 items-center justify-center rounded-[10px] ${toneForCategory(course.category)}`}>
          <GraduationCap className="size-5" />
        </div>
        <Badge variant={STATUS_VARIANT[course.status] || "neutral"} icon={<StatusIcon className="size-3" />}>
          {course.status}
        </Badge>
      </div>

      <div className="flex-1 px-5 pb-4">
        <h3 className="line-clamp-1 text-[15px] font-semibold text-text-primary transition-colors group-hover:text-accent">
          {course.title}
        </h3>
        <p className="mt-1 line-clamp-2 min-h-[2.25rem] text-xs leading-relaxed text-text-tertiary">
          {course.description || "No description yet."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-text-tertiary">
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-hover px-2 py-0.5">
            <Layers className="size-3" /> {course.category}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-hover px-2 py-0.5">
            {course.difficulty}
          </span>
          {course.language && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-hover px-2 py-0.5 capitalize">
              <Globe2 className="size-3" /> {course.language}
            </span>
          )}
        </div>
      </div>

      <div className="px-5 pb-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-text-tertiary">Videos</span>
          <span className="font-medium text-text-secondary">
            {completed}/{total}
          </span>
        </div>
        <Progress percent={pct} showLabel={false} size="sm" status={pct === 100 && total > 0 ? "success" : "active"} />
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-border-light px-5 py-3">
        <span className="text-[11px] text-text-tertiary">Updated {timeAgo(course.updatedAt)}</span>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={`Edit ${course.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(course);
            }}
            icon={<Pencil className="size-3.5" />}
          />
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={`Delete ${course.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(course);
            }}
            icon={<Trash2 className="size-3.5 text-danger-500" />}
          />
        </div>
      </div>
    </div>
  );
};
