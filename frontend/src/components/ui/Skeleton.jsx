import { cn } from "./cn";

/** A pulsing placeholder block. Size it with className (h-4 w-32, aspect-video, ...). */
export const Skeleton = ({ className, ...props }) => (
  <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-surface-active/70", className)} {...props} />
);

/** n lines of placeholder text; the last is shorter so it reads as a paragraph. */
export const SkeletonText = ({ lines = 3, className }) => (
  <div className={cn("space-y-2", className)} aria-hidden="true">
    {Array.from({ length: lines }, (_, i) => (
      <Skeleton key={i} className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")} />
    ))}
  </div>
);

/** Stand-in for a ProjectCard / media tile while a list loads. */
export const SkeletonCard = ({ className }) => (
  <div className={cn("overflow-hidden rounded-xl border border-border bg-surface", className)} aria-hidden="true">
    <Skeleton className="aspect-video w-full rounded-none" />
    <div className="space-y-2.5 p-3">
      <Skeleton className="h-3.5 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  </div>
);

export default Skeleton;
