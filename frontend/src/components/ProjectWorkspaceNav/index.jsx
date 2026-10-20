import { Link } from "react-router-dom";
import { Activity, Pencil } from "lucide-react";
import { cn } from "../ui/cn";

/**
 * The two views of one video project: Progress (what the pipeline is doing,
 * the result) and Editor (scenes, narration, style). Shown on both pages so
 * moving between them is one click, not a detour through a list.
 *
 * The editor needs a script to exist; until then its tab is disabled with the
 * reason, rather than leading to an empty page. `onNavigate` lets the editor
 * route its own links through the unsaved-changes guard.
 */
const ProjectWorkspaceNav = ({ jobId, active, hasScript, onNavigate }) => {
  const tabs = [
    { key: "progress", label: "Progress", icon: Activity, to: `/render?id=${jobId}` },
    { key: "editor", label: "Editor", icon: Pencil, to: `/studio?id=${jobId}`, disabled: !hasScript, reason: "Available once the script has been written" },
  ];

  return (
    <nav aria-label="Project views" className="mb-4 flex gap-1 border-b border-border-light">
      {tabs.map(({ key, label, icon: Icon, to, disabled, reason }) => {
        const isActive = key === active;
        const className = cn(
          "relative flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-medium outline-none transition-colors",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
          isActive ? "text-text-primary" : disabled ? "cursor-not-allowed text-text-tertiary opacity-60" : "text-text-tertiary hover:text-text-secondary"
        );
        const content = (
          <>
            <Icon className="size-3.5" />
            {label}
            {isActive && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />}
          </>
        );
        return disabled ? (
          <span key={key} className={className} title={reason} aria-disabled="true">
            {content}
          </span>
        ) : (
          <Link
            key={key}
            to={to}
            aria-current={isActive ? "page" : undefined}
            className={className}
            onClick={(e) => {
              if (onNavigate && !isActive) {
                e.preventDefault();
                onNavigate(to);
              }
            }}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
};

export default ProjectWorkspaceNav;
