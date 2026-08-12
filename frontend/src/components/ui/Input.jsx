import { forwardRef } from "react";
import { cn } from "./cn";

const fieldBase =
  "w-full rounded-lg border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-tertiary " +
  "transition-colors outline-none focus:border-accent focus:ring-4 focus:ring-accent/10 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export const Label = ({ className, required, children, ...props }) => (
  <label className={cn("mb-1.5 block text-[13px] font-medium text-text-secondary", className)} {...props}>
    {children}
    {required && <span className="ml-0.5 text-danger-500">*</span>}
  </label>
);

export const FieldHint = ({ error, children }) =>
  children ? (
    <p className={cn("mt-1.5 text-xs", error ? "text-danger-500" : "text-text-tertiary")}>{children}</p>
  ) : null;

export const Input = forwardRef(function Input(
  { className, icon = null, error = false, ...props },
  ref
) {
  return (
    <div className="relative">
      {icon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
          {icon}
        </span>
      )}
      <input
        ref={ref}
        className={cn(
          fieldBase,
          "h-9",
          icon && "pl-9",
          error && "border-danger-500 focus:border-danger-500 focus:ring-danger-500/10",
          className
        )}
        {...props}
      />
    </div>
  );
});

export const Textarea = forwardRef(function Textarea({ className, error = false, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(fieldBase, "min-h-24 resize-y py-2", error && "border-danger-500", className)}
      {...props}
    />
  );
});

export const NumberInput = forwardRef(function NumberInput(
  { className, error = false, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      type="number"
      className={cn(fieldBase, "h-9", error && "border-danger-500", className)}
      {...props}
    />
  );
});

export default Input;
