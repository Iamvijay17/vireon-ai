import { Link } from "react-router-dom";
import { GraduationCap, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Dropdown, DropdownItem, DropdownDivider } from "../../../components/ui/Dropdown";
import { Progress } from "../../../components/ui/Progress";
import { cn } from "../../../components/ui/cn";
import StatusBadge from "../../../components/StatusBadge";
import { timeAgo } from "../../../lib/timeAgo";

/**
 * One course in the grid: status, what it is, how many lessons are done. The
 * title is the real link (stretched over the card); Edit / Delete live in a
 * menu so the card has no hidden hover-only controls.
 */
export const CourseCard = ({ course, onEdit, onDelete }) => {
  const total = course.videoCount || 0;
  const completed = course.completedVideoCount || 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : null;
  const meta = [course.category, course.difficulty, course.language && `${course.language[0].toUpperCase()}${course.language.slice(1)}`].filter(Boolean);

  return (
    <div className="hover-lift group relative flex flex-col rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-hover text-text-tertiary">
          <GraduationCap className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <Link
            to={`/courses/${course._id}`}
            className="line-clamp-2 text-sm font-medium leading-snug text-text-primary outline-none after:absolute after:inset-0 hover:text-accent-fg focus-visible:text-accent-fg"
            title={course.title}
          >
            {course.title}
          </Link>
          <p className="mt-1 truncate text-xs text-text-tertiary">{meta.join(" · ")}</p>
        </div>
        <Dropdown
          align="end"
          trigger={({ toggle, open, id }) => (
            <button
              type="button"
              onClick={toggle}
              aria-label={`Actions for ${course.title}`}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls={open ? id : undefined}
              className={cn(
                "relative z-10 flex size-7 cursor-pointer items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-active hover:text-text-primary",
                open && "bg-surface-active text-text-primary"
              )}
            >
              <MoreHorizontal className="size-4" />
            </button>
          )}
        >
          {({ close }) => (
            <>
              <DropdownItem
                icon={<Pencil />}
                onClick={() => {
                  close();
                  onEdit(course);
                }}
              >
                Edit details
              </DropdownItem>
              <DropdownDivider />
              <DropdownItem
                icon={<Trash2 />}
                danger
                onClick={() => {
                  close();
                  onDelete(course);
                }}
              >
                Delete…
              </DropdownItem>
            </>
          )}
        </Dropdown>
      </div>

      <p className="mt-3 line-clamp-2 min-h-8 text-xs leading-relaxed text-text-tertiary">{course.description || "No description yet."}</p>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-text-tertiary">Lessons</span>
          <span className="tabular font-medium text-text-secondary">
            {completed} / {total}
          </span>
        </div>
        {pct === null ? (
          <div className="h-1.5 rounded-full bg-surface-active" aria-hidden="true" />
        ) : (
          <Progress percent={pct} showLabel={false} size="sm" status={pct === 100 ? "success" : "active"} />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border-light pt-3">
        <StatusBadge status={course.status} />
        <span className="text-[11px] text-text-tertiary" title={course.updatedAt ? new Date(course.updatedAt).toLocaleString() : undefined}>
          Updated {timeAgo(course.updatedAt)}
        </span>
      </div>
    </div>
  );
};
