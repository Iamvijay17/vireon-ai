import { Card } from "../ui/Card";
import { SkeletonCard, Skeleton } from "../ui/Skeleton";
import ProjectCard from "./index";

/**
 * Lays projects out as a responsive grid of cards or as one list card.
 * `loading` shows the matching skeleton so the page does not jump when data
 * arrives. `actions` is either the actions array or a function of the project
 * (different projects can offer different actions).
 */
const ProjectGrid = ({ projects, view = "grid", loading = false, actions }) => {
  if (loading) {
    return view === "list" ? (
      <Card className="divide-y divide-border-light" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="hidden h-14 w-28 sm:block" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </Card>
    ) : (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  const resolve = (project) => (typeof actions === "function" ? actions(project) : actions);

  if (view === "list") {
    return (
      <Card className="overflow-hidden">
        {projects.map((p) => (
          <ProjectCard key={p.key} project={p} view="list" actions={resolve(p)} />
        ))}
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {projects.map((p) => (
        <ProjectCard key={p.key} project={p} view="grid" actions={resolve(p)} />
      ))}
    </div>
  );
};

export default ProjectGrid;
