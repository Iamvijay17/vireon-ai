import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "./cn";
import { useEscapeKey, useLockBodyScroll } from "./hooks";

const WIDTHS = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

export const Modal = ({
  open,
  onClose,
  title,
  description,
  width = "md",
  footer,
  closable = true,
  children,
  className,
}) => {
  const panelRef = useRef(null);
  // Remembered so focus can go back where it came from on close - without
  // it, dismissing a dialog drops the caret to the top of the document and
  // a keyboard user has to tab all the way back to where they were.
  const previouslyFocusedRef = useRef(null);

  useEscapeKey(() => closable && onClose?.(), open);
  useLockBodyScroll(open);

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocusedRef.current = document.activeElement;
    panelRef.current?.focus();

    return () => {
      // Only restore if the trigger is still in the document - a dialog
      // that deleted the row it was opened from has nothing to go back to.
      const previous = previouslyFocusedRef.current;
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  // Focus trap. `aria-modal` tells assistive tech the rest of the page is
  // inert, but it does nothing for Tab: without this, tabbing past the last
  // control moves focus behind the overlay, onto controls the user can
  // neither see nor meaningfully use.
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (e) => {
      if (e.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) {
        // Nothing focusable inside - keep focus on the panel rather than
        // letting it escape to the page behind.
        e.preventDefault();
        panelRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      // Wrap around at both ends, and pull focus in if it somehow left the
      // panel entirely (e.g. the focused element was just unmounted).
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (!panelRef.current?.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[2px]"
        onClick={() => closable && onClose?.()}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className={cn(
          "relative z-10 flex max-h-[85vh] w-full animate-scale-in flex-col rounded-2xl border border-border bg-surface shadow-xl outline-none",
          WIDTHS[width],
          className
        )}
      >
        {(title || closable) && (
          <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5">
            <div className="min-w-0">
              {title && <h2 className="text-[15px] font-semibold text-text-primary">{title}</h2>}
              {description && <p className="mt-1 text-[13px] text-text-tertiary">{description}</p>}
            </div>
            {closable && (
              <button
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 cursor-pointer rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-light px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body
  );
};

export default Modal;
