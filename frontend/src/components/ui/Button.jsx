import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "./cn";

const VARIANTS = {
  primary:
    "bg-accent text-white hover:bg-accent-hover active:bg-accent-active shadow-sm shadow-accent/20 disabled:hover:bg-accent",
  secondary:
    "bg-surface text-text-primary border border-border hover:bg-surface-hover active:bg-surface-active",
  ghost: "bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary",
  danger: "bg-danger-500 text-white hover:bg-danger-600 active:bg-danger-600 shadow-sm shadow-danger-500/20",
  outline:
    "bg-transparent text-text-primary border border-border hover:bg-surface-hover",
};

const SIZES = {
  xs: "h-7 px-2.5 text-xs gap-1.5",
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
  lg: "h-10 px-5 text-sm gap-2",
};

const ICON_SIZES = {
  xs: "h-7 w-7",
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-10 w-10",
};

export const Button = forwardRef(function Button(
  {
    variant = "secondary",
    size = "md",
    icon = null,
    iconOnly = false,
    loading = false,
    disabled = false,
    className,
    children,
    type = "button",
    href,
    ...props
  },
  ref
) {
  const classes = cn(
    "inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap",
    "transition-colors duration-150 select-none",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
    VARIANTS[variant],
    iconOnly ? ICON_SIZES[size] : SIZES[size],
    className
  );

  const content = (
    <>
      {loading ? <Loader2 className={cn("animate-spin", iconOnly ? "size-4" : "size-4 -ml-0.5")} /> : icon}
      {!iconOnly && children}
    </>
  );

  if (href) {
    return (
      <a ref={ref} href={href} className={classes} {...props}>
        {content}
      </a>
    );
  }

  return (
    <button ref={ref} type={type} disabled={disabled || loading} className={classes} {...props}>
      {content}
    </button>
  );
});

export default Button;
