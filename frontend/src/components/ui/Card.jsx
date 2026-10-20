import { cn } from "./cn";

export const Card = ({ className, hoverable = false, children, ...props }) => (
  <div
    className={cn(
      "rounded-xl border border-border bg-surface",
      hoverable && "hover-lift",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

export const CardHeader = ({ title, subtitle, extra, className, children }) => (
  <div className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border-light px-4 py-3", className)}>
    <div className="min-w-0 max-w-full">
      {title && <h3 className="truncate text-sm font-semibold text-text-primary">{title}</h3>}
      {subtitle && <p className="mt-0.5 text-xs text-text-tertiary">{subtitle}</p>}
      {children}
    </div>
    {extra && <div className="flex flex-wrap items-center gap-2">{extra}</div>}
  </div>
);

export const CardBody = ({ className, children, ...props }) => (
  <div className={cn("p-4", className)} {...props}>
    {children}
  </div>
);

export default Card;
