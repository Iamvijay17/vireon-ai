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
  useEscapeKey(() => closable && onClose?.(), open);
  useLockBodyScroll(open);

  useEffect(() => {
    if (open) panelRef.current?.focus();
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
          "relative z-10 w-full animate-scale-in rounded-2xl border border-border bg-surface shadow-xl outline-none",
          WIDTHS[width],
          className
        )}
      >
        {(title || closable) && (
          <div className="flex items-start justify-between gap-3 px-5 pt-5">
            <div className="min-w-0">
              {title && <h2 className="text-[15px] font-semibold text-text-primary">{title}</h2>}
              {description && <p className="mt-1 text-[13px] text-text-tertiary">{description}</p>}
            </div>
            {closable && (
              <button
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        )}
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-border-light px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body
  );
};

export default Modal;
