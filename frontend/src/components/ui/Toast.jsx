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
        <div className="fixed top-4 left-1/2 z-200 flex -translate-x-1/2 flex-col items-center gap-2">
          {toasts.map((t) => {
            const { Icon, cls } = ICONS[t.type] || ICONS.info;
            return (
              <div
                key={t.id}
                className="animate-slide-up flex max-w-sm items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-3 shadow-lg shadow-black/10"
              >
                <Icon className={cn("size-4 shrink-0", cls)} />
                <span className="text-[13px] font-medium text-text-primary">{t.message}</span>
                <button
                  onClick={() => remove(t.id)}
                  aria-label="Dismiss"
                  className="ml-1 shrink-0 rounded-md p-0.5 text-text-tertiary hover:bg-surface-hover"
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
