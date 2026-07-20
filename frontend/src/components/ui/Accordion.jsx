import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "./cn";

/**
 * Single collapsible panel (Ant `Collapse` replacement).
 * Use several side-by-side for an accordion group, or one standalone.
 */
export const AccordionItem = ({
  title,
  extra = null,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  ghost = false,
  className,
  children,
}) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const toggle = () => {
    if (isControlled) onOpenChange?.(!open);
    else setInternalOpen((v) => !v);
  };

  return (
    <div className={cn(!ghost && "rounded-xl border border-border bg-surface", className)}>
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "flex w-full items-center justify-between gap-2 px-4 py-3 text-left",
          !ghost && "rounded-xl"
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <ChevronRight className={cn("size-4 shrink-0 text-text-tertiary transition-transform", open && "rotate-90")} />
          <span className="min-w-0 truncate text-[13px] font-medium text-text-primary">{title}</span>
        </span>
        {extra && <span onClick={(e) => e.stopPropagation()}>{extra}</span>}
      </button>
      {open && <div className={cn("px-4 pb-4", !ghost && "border-t border-border-light pt-3")}>{children}</div>}
    </div>
  );
};

export default AccordionItem;
