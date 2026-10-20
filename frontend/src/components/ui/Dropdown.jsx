import { useEffect, useRef, useState, useId } from "react";
import { cn } from "./cn";
import { useClickOutside, useEscapeKey } from "./hooks";

const ALIGN = {
  start: "left-0",
  end: "right-0",
};

const ITEM_SELECTOR = '[role="menuitem"]:not([disabled])';

/**
 * Generic trigger + floating panel. `trigger` receives { open, toggle, id }.
 * `children` receives { close } and is rendered inside the panel only while open
 * (keeps menu contents unmounted when closed).
 *
 * Keyboard: opening moves focus to the first item, arrows/Home/End move
 * between items, Escape closes and returns focus to the trigger.
 */
export const Dropdown = ({ trigger, children, align = "end", panelClassName, className }) => {
  const [open, setOpen] = useState(false);
  const id = useId();
  const panelRef = useRef(null);
  const wrapperRef = useRef(null);
  const ref = useClickOutside(() => setOpen(false), open);
  const closeAndRestoreFocus = () => {
    setOpen(false);
    wrapperRef.current?.querySelector("button, a")?.focus();
  };
  useEscapeKey(closeAndRestoreFocus, open);

  const close = () => setOpen(false);
  const toggle = () => setOpen((v) => !v);

  useEffect(() => {
    if (open) panelRef.current?.querySelector(ITEM_SELECTOR)?.focus();
  }, [open]);

  const onPanelKeyDown = (e) => {
    const items = [...(panelRef.current?.querySelectorAll(ITEM_SELECTOR) ?? [])];
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement);
    let next = null;
    if (e.key === "ArrowDown") next = items[(current + 1) % items.length];
    else if (e.key === "ArrowUp") next = items[(current - 1 + items.length) % items.length];
    else if (e.key === "Home") next = items[0];
    else if (e.key === "End") next = items[items.length - 1];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  return (
    <div
      ref={(el) => {
        ref.current = el;
        wrapperRef.current = el;
      }}
      className={cn("relative inline-block", className)}
    >
      {trigger({ open, toggle, id })}
      {open && (
        <div
          id={id}
          ref={panelRef}
          role="menu"
          onKeyDown={onPanelKeyDown}
          className={cn(
            "absolute z-50 mt-2 min-w-48 origin-top-right animate-scale-in rounded-lg border border-border",
            "bg-surface-raised p-1 shadow-lg",
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
      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium transition-colors outline-none",
      danger
        ? "text-danger-500 hover:bg-danger-500/10 focus-visible:bg-danger-500/10"
        : "text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:bg-surface-hover focus-visible:text-text-primary",
      "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
      className
    )}
    {...props}
  >
    {icon && <span className="shrink-0 [&>svg]:size-4">{icon}</span>}
    <span className="min-w-0 flex-1 truncate">{children}</span>
  </button>
);

export const DropdownDivider = () => <div className="my-1 h-px bg-border-light" />;

export const DropdownLabel = ({ children }) => (
  <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
    {children}
  </div>
);

export default Dropdown;
