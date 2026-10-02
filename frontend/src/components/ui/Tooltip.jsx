import { cn } from "./cn";

const SIDE = {
  top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
  left: "right-full top-1/2 mr-2 -translate-y-1/2",
  right: "left-full top-1/2 ml-2 -translate-y-1/2",
};

export const Tooltip = ({ content, side = "top", children, className }) => {
  if (!content) return children;
  return (
    <span className={cn("group/tooltip relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 w-max max-w-[min(20rem,calc(100vw-2rem))] rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white",
          // display:none (not opacity-0) while idle: an invisible tooltip near
          // the viewport edge otherwise still widens the page's scroll area.
          "hidden shadow-lg group-hover/tooltip:block group-focus-within/tooltip:block group-hover/tooltip:animate-fade-in",
          "dark:bg-neutral-100 dark:text-neutral-900",
          SIDE[side]
        )}
      >
        {content}
      </span>
    </span>
  );
};

export default Tooltip;
