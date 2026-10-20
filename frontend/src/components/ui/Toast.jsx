import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { cn } from "./cn";
import { registerToastEmitter } from "./toastBus";

const ICONS = {
  success: { Icon: CheckCircle2, cls: "text-success-500" },
  error: { Icon: XCircle, cls: "text-danger-500" },
  info: { Icon: Info, cls: "text-info-500" },
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type, message, duration = 3200) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, type, message }]);
      if (duration) setTimeout(() => remove(id), duration);
      return id;
    },
    [remove]
  );

  useEffect(() => {
    registerToastEmitter(push);
    return () => registerToastEmitter(null);
  }, [push]);

  return (
    <>
      {children}
      {createPortal(
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed right-4 top-[4.25rem] z-200 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2"
        >
          {toasts.map((t) => {
            const { Icon, cls } = ICONS[t.type] || ICONS.info;
            return (
              <div
                key={t.id}
                className="pointer-events-auto animate-slide-up flex max-w-sm items-center gap-2.5 rounded-lg border border-border bg-surface-raised px-3.5 py-2.5 shadow-lg"
              >
                <Icon className={cn("size-4 shrink-0", cls)} />
                <span className="text-[13px] font-medium text-text-primary">{t.message}</span>
                <button
                  onClick={() => remove(t.id)}
                  aria-label="Dismiss"
                  className="ml-1 shrink-0 cursor-pointer rounded-md p-0.5 text-text-tertiary hover:bg-surface-hover"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
};

export default ToastProvider;
