import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";
import { useEscapeKey, useLockBodyScroll } from "./hooks";
import { registerConfirmOpener } from "./confirmBus";

export const ConfirmDialogHost = () => {
  const [state, setState] = useState(null); // { title, content, danger, confirmText, resolve }
  const [pending, setPending] = useState(false);

  const close = useCallback((result) => {
    setState((prev) => {
      prev?.resolve(result);
      return null;
    });
    setPending(false);
  }, []);

  useEscapeKey(() => state && close(false), Boolean(state));
  useLockBodyScroll(Boolean(state));

  useEffect(() => {
    const open = ({ title, content, danger, confirmText, cancelText }) =>
      new Promise((resolve) => {
        setState({ title, content, danger, confirmText, cancelText, resolve });
      });
    registerConfirmOpener(open);
    return () => registerConfirmOpener(null);
  }, []);

  if (!state) return null;

  const handleConfirm = async () => {
    setPending(true);
    close(true);
  };

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      <div className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[2px]" onClick={() => close(false)} />
      <div
        role="alertdialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-sm animate-scale-in rounded-2xl border border-border bg-surface p-5 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <span
            className={
              "flex size-9 shrink-0 items-center justify-center rounded-full " +
              (state.danger ? "bg-danger-500/10 text-danger-500" : "bg-accent-subtle text-accent")
            }
          >
            <AlertTriangle className="size-5" />
          </span>
          <div className="min-w-0 flex-1 pt-1">
            <h2 className="text-[15px] font-semibold text-text-primary">{state.title}</h2>
            {state.content && <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">{state.content}</p>}
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => close(false)}>
            {state.cancelText || "Cancel"}
          </Button>
          <Button variant={state.danger ? "danger" : "primary"} size="sm" loading={pending} onClick={handleConfirm}>
            {state.confirmText || "Confirm"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmDialogHost;
