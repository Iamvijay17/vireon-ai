import { AlertTriangle, CheckCircle2, Info, XCircle, X } from "lucide-react";
import { cn } from "./cn";

const CONFIG = {
  info: { icon: Info, cls: "bg-info-500/8 border-info-500/20 text-info-600 dark:text-info-500" },
  success: { icon: CheckCircle2, cls: "bg-success-500/8 border-success-500/20 text-success-600 dark:text-success-500" },
  warning: { icon: AlertTriangle, cls: "bg-warning-500/8 border-warning-500/20 text-warning-600 dark:text-warning-500" },
  error: { icon: XCircle, cls: "bg-danger-500/8 border-danger-500/20 text-danger-600 dark:text-danger-500" },
};

export const Alert = ({ type = "info", title, children, action = null, onClose, className }) => {
  const { icon: Icon, cls } = CONFIG[type];
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-3.5", cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="text-sm font-semibold">{title}</p>}
        {children && <div className="mt-0.5 text-[13px] leading-relaxed text-text-secondary">{children}</div>}
        {action && <div className="mt-2.5">{action}</div>}
      </div>
      {onClose && (
        <button onClick={onClose} className="shrink-0 rounded-md p-0.5 text-text-tertiary hover:bg-black/5">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
};

export default Alert;
