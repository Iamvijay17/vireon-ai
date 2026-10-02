import { cn } from "./cn";

export const Card = ({ className, hoverable = false, children, ...props }) => (
  <div
    className={cn(
      "rounded-2xl border border-border bg-surface",
      hoverable && "hover-lift transition-shadow hover:shadow-md",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

export const CardHeader = ({ title, subtitle, extra, className, children }) => (
  <div className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border-light px-4 py-3.5 sm:px-5 sm:py-4", className)}>
    <div className="min-w-0 max-w-full">
      {title && <h3 className="truncate text-[15px] font-semibold text-text-primary">{title}</h3>}
      {subtitle && <p className="mt-0.5 text-xs text-text-tertiary">{subtitle}</p>}
      {children}
    </div>
    {extra && <div className="flex flex-wrap items-center gap-2">{extra}</div>}
  </div>
);

export const CardBody = ({ className, children, ...props }) => (
  <div className={cn("p-4 sm:p-5", className)} {...props}>
    {children}
  </div>
);

export default Card;
