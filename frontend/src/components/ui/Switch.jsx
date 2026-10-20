import { cn } from "./cn";

export const Switch = ({ checked, onChange, disabled = false, className, ...props }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange?.(!checked)}
    {...props}
    className={cn(
      "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-150",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
      "disabled:cursor-not-allowed disabled:opacity-50",
      checked ? "bg-accent" : "bg-surface-active ring-1 ring-inset ring-border-strong",
      className
    )}
  >
    <span
      className={cn(
        "inline-block size-4 transform rounded-full bg-white transition-transform duration-150",
        checked ? "translate-x-5" : "translate-x-1"
      )}
    />
  </button>
);

export default Switch;
