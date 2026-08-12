import { cn } from "./cn";

const VARIANTS = {
  neutral: "bg-surface-hover text-text-secondary border-border",
  accent: "bg-accent-subtle text-accent border-transparent",
  success: "bg-success-500/10 text-success-600 border-success-500/20 dark:text-success-500",
  warning: "bg-warning-500/10 text-warning-600 border-warning-500/20 dark:text-warning-500",
  danger: "bg-danger-500/10 text-danger-600 border-danger-500/20 dark:text-danger-500",
  info: "bg-info-500/10 text-info-600 border-info-500/20 dark:text-info-500",
};

export const Badge = ({ variant = "neutral", icon = null, dot = false, className, children, ...props }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none",
      VARIANTS[variant],
      className
    )}
    {...props}
  >
    {dot && <span className={cn("size-1.5 rounded-full", variant === "neutral" ? "bg-text-tertiary" : "bg-current")} />}
    {icon}
    {children}
  </span>
);

export default Badge;
