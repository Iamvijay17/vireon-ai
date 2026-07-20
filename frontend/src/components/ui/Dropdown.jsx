import { useState, useId } from "react";
import { cn } from "./cn";
import { useClickOutside, useEscapeKey } from "./hooks";

const ALIGN = {
  start: "left-0",
  end: "right-0",
};

/**
 * Generic trigger + floating panel. `trigger` receives { open, toggle }.
 * `children` receives { close } and is rendered inside the panel only while open
 * (keeps menu contents unmounted when closed).
 */
export const Dropdown = ({ trigger, children, align = "end", panelClassName, className }) => {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useClickOutside(() => setOpen(false), open);
  useEscapeKey(() => setOpen(false), open);

  const close = () => setOpen(false);
  const toggle = () => setOpen((v) => !v);

  return (
    <div ref={ref} className={cn("relative inline-block", className)}>
      {trigger({ open, toggle, id })}
      {open && (
        <div
          id={id}
          role="menu"
          className={cn(
            "absolute z-50 mt-2 min-w-48 origin-top-right animate-scale-in rounded-xl border border-border",
            "bg-surface p-1.5 shadow-lg shadow-black/5",
            ALIGN[align],
            panelClassName
          )}
        >
          {typeof children === "function" ? children({ close }) : children}
        </div>
      )}
    </div>
  );
};

export const DropdownItem = ({ icon = null, danger = false, className, children, ...props }) => (
  <button
    type="button"
    role="menuitem"
    className={cn(
      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors",
      danger ? "text-danger-500 hover:bg-danger-500/10" : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
      className
    )}
    {...props}
  >
    {icon && <span className="shrink-0 [&>svg]:size-4">{icon}</span>}
    <span className="min-w-0 flex-1 truncate">{children}</span>
  </button>
);

export const DropdownDivider = () => <div className="my-1.5 h-px bg-border-light" />;

export const DropdownLabel = ({ children }) => (
  <div className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
    {children}
  </div>
);

export default Dropdown;
