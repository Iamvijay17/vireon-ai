import { useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Film, MoreHorizontal } from "lucide-react";
import { Dropdown, DropdownItem, DropdownDivider } from "../ui/Dropdown";
import { Progress } from "../ui/Progress";
import { Badge } from "../ui/Badge";
import { cn } from "../ui/cn";
import StatusBadge from "../StatusBadge";
import { resolveMediaUrl } from "../../services/api";
import { isJobRunning } from "../../lib/jobStatus";
import { timeAgo } from "../../lib/timeAgo";

/** The thumbnail box; a missing or broken image falls back to a quiet placeholder, never a broken-image glyph. */
const Thumb = ({ project, className }) => {
  const [failed, setFailed] = useState(false);
  const src = resolveMediaUrl(project.thumbnail);
  const Icon = project.kind === "course" ? BookOpen : Film;
  return (
    <div className={cn("relative aspect-video w-full overflow-hidden bg-neutral-950", className)}>
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          // A vertical video letterboxed inside the 16:9 box shows all of it;
          // cropping would cut the title off.
          className={cn("size-full", project.portrait ? "object-contain" : "object-cover")}
        />
      ) : (
        <div className="flex size-full items-center justify-center text-neutral-600">
          <Icon className="size-7" />
        </div>
      )}
    </div>
  );
};

const KindBadge = ({ kind, className }) => (
  <Badge variant={kind === "course" ? "warning" : "neutral"} className={cn("bg-black/60 backdrop-blur-sm", className)}>
    {kind === "course" ? "Course" : "Video"}
  </Badge>
);

const Actions = ({ project, actions, label }) => {
  if (!actions?.length) return null;
  return (
    <Dropdown
      align="end"
      trigger={({ toggle, open, id }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label={`Actions for ${label}`}
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
      {({ close }) =>
        actions.map((action, i) =>
          action.divider ? (
            <DropdownDivider key={`d${i}`} />
          ) : (
            <DropdownItem
              key={action.label}
              icon={action.icon}
              danger={action.danger}
              disabled={action.disabled}
              onClick={() => {
                close();
                action.onSelect(project);
              }}
            >
              {action.label}
            </DropdownItem>
          )
        )
      }
    </Dropdown>
  );
};

const Meta = ({ project }) => (
  <p className="truncate text-xs text-text-tertiary" title={project.meta.join(" · ")}>
    {project.meta.join(" · ")}
  </p>
);

const stamp = (project) => {
  const created = project.createdAt ? new Date(project.createdAt).toLocaleString() : "";
  return created ? `Created ${created}` : undefined;
};

/**
 * One project, as a grid card or a list row. The whole card is a link to the
 * project (the title is the real <a>, stretched over the card), and the
 * actions menu sits above it - so the card is one tab stop plus its menu.
 *
 * `actions`: [{ label, icon, danger?, disabled?, onSelect(project) } | { divider: true }]
 */
const ProjectCard = ({ project, view = "grid", actions }) => {
  const running = isJobRunning(project.status);
  const showProgress = project.progress !== null && ["running", "queued"].includes(project.phase) && project.kind === "video";

  if (view === "list") {
    return (
      <div className="group relative flex items-center gap-4 border-b border-border-light px-4 py-2.5 transition-colors last:border-0 hover:bg-surface-hover">
        <div className="hidden w-28 shrink-0 overflow-hidden rounded-md sm:block">
          <Thumb project={project} />
        </div>
        <div className="min-w-0 flex-1">
          <Link
            to={project.route}
            className="block truncate text-sm font-medium text-text-primary outline-none after:absolute after:inset-0 hover:text-accent-fg focus-visible:text-accent-fg"
            title={project.title}
          >
            {project.title}
          </Link>
          <div className="mt-0.5 flex items-center gap-2">
            <KindBadge kind={project.kind} className="bg-transparent px-0 backdrop-blur-none border-0 text-text-tertiary" />
            <Meta project={project} />
          </div>
        </div>
        {showProgress && (
          <div className="hidden w-28 shrink-0 md:block">
            <Progress percent={project.progress} size="sm" status="active" trickle={running} />
          </div>
        )}
        <div className="shrink-0">
          <StatusBadge status={project.status} />
        </div>
        <span className="hidden w-20 shrink-0 text-right text-xs text-text-tertiary lg:block" title={stamp(project)}>
          {timeAgo(project.updatedAt)}
        </span>
        <Actions project={project} actions={actions} label={project.title} />
      </div>
    );
  }

  return (
    <div className="hover-lift group relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <div className="relative">
        <Thumb project={project} />
        <KindBadge kind={project.kind} className="absolute left-2 top-2" />
        {showProgress && (
          <div className="absolute inset-x-0 bottom-0 bg-black/55 px-2.5 py-1.5">
            <Progress percent={project.progress} size="sm" status="active" trickle={running} />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <Link
            to={project.route}
            className="line-clamp-2 min-w-0 text-sm font-medium leading-snug text-text-primary outline-none after:absolute after:inset-0 hover:text-accent-fg focus-visible:text-accent-fg"
            title={project.title}
          >
            {project.title}
          </Link>
          <Actions project={project} actions={actions} label={project.title} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <StatusBadge status={project.status} />
          <span className="shrink-0 text-xs text-text-tertiary" title={stamp(project)}>
            {timeAgo(project.updatedAt)}
          </span>
        </div>
        <Meta project={project} />
        {project.error && project.phase === "failed" && (
          <p className="line-clamp-2 text-xs text-danger-500" title={project.error}>
            {project.error}
          </p>
        )}
      </div>
    </div>
  );
};

export default ProjectCard;
