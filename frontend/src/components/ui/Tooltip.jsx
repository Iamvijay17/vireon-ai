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
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white",
          "opacity-0 shadow-lg transition-opacity delay-150 duration-150 group-hover/tooltip:opacity-100",
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
