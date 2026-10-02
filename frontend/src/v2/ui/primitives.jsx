import { STATE, stateOf, labelOf, stateColor } from "../lib/status";
import { cx } from "./cx";

/* ============================================================================
   Button
   ============================================================================
   Four intents, three sizes. `ghost` is the workhorse for toolbars; `solid`
   is reserved for the one primary action on a screen - if a screen has two,
   one of them is not primary.
   ============================================================================ */

const BUTTON_VARIANTS = {
  solid:
    "bg-[var(--v2-accent)] text-white hover:bg-[var(--v2-accent-hover)] active:brightness-95 shadow-[0_1px_0_0_rgb(255_255_255/0.12)_inset]",
  outline:
    "border border-[var(--v2-line-strong)] text-hi hover:bg-[var(--v2-hover)] active:bg-[var(--v2-active)]",
  ghost: "text-mid hover:text-hi hover:bg-[var(--v2-hover)] active:bg-[var(--v2-active)]",
  danger: "bg-[var(--color-state-fail)] text-white hover:brightness-110 active:brightness-95",
};

const BUTTON_SIZES = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-[var(--radius-v2-sm)]",
  md: "h-9.5 px-4 text-[13.5px] gap-2 rounded-[var(--radius-v2-md)]",
  lg: "h-11 px-5 text-[15px] gap-2 rounded-[var(--radius-v2-md)]",
};

export function Button({
  variant = "ghost",
  size = "md",
  icon,
  iconRight,
  loading = false,
  iconOnly = false,
  className,
  children,
  disabled,
  ...props
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap",
        "transition-[background-color,color,filter,border-color] duration-140 ease-[var(--ease-v2-out)]",
        "disabled:pointer-events-none disabled:opacity-45",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        // Square it off when there is no label, so icon buttons stay on the
        // same optical grid as text buttons rather than becoming pills.
        iconOnly && "!px-0 aspect-square",
        className
      )}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {!iconOnly && children}
      {!loading && iconRight}
    </button>
  );
}

/** Ring spinner, sized by font-size so it sits correctly inside buttons. */
export function Spinner({ className }) {
  return (
    <span
      className={cx(
        "inline-block animate-spin rounded-full border-2 border-current border-t-transparent opacity-70",
        className || "size-4"
      )}
      aria-hidden="true"
    />
  );
}

/* ============================================================================
   Panel
   ============================================================================ */

export function Panel({ className, children, inset = false, ...props }) {
  return (
    <div className={cx("panel", inset && "bg-surface-2", className)} {...props}>
      {children}
    </div>
  );
}

/**
 * Panel header. `actions` sit right-aligned on the same optical line as the
 * title, which is where every panel in the app puts them.
 */
export function PanelHead({ title, subtitle, actions, className }) {
  return (
    <div className={cx("flex items-start justify-between gap-4 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        <h2 className="display text-[15px] text-hi">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-lo">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

/* ============================================================================
   Status
   ============================================================================ */

/**
 * A status dot. Running pulses; everything else is static - motion is
 * reserved for "this is changing right now", so a page of finished jobs is
 * completely still.
 */
export function StatusDot({ status, size = 8, className }) {
  const state = stateOf(status);
  return (
    <span
      className={cx("relative inline-flex shrink-0", state === STATE.RUN && "animate-v2-pulse", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{ backgroundColor: stateColor(state) }}
      />
    </span>
  );
}

/**
 * Status pill. Tinted from the state colour at low alpha rather than a
 * fixed palette, so a new state needs one token, not a new class set.
 */
export function StatusPill({ status, className }) {
  const state = stateOf(status);
  const color = stateColor(state);
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap",
        className
      )}
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 22%, transparent)`,
      }}
    >
      <StatusDot status={status} size={6} />
      {labelOf(status)}
    </span>
  );
}

/* ============================================================================
   Progress
   ============================================================================ */

/**
 * A progress bar that knows the difference between "37% done" and "working,
 * but I can't tell you how far". Passing `value = null` gives the
 * indeterminate sweep instead of a misleading empty bar.
 */
export function Progress({ value, tone = "var(--v2-accent)", className }) {
  const indeterminate = value == null;
  return (
    <div
      className={cx("relative h-1 w-full overflow-hidden rounded-full bg-[var(--v2-line)]", className)}
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {indeterminate ? (
        <span
          className="absolute inset-y-0 w-1/3 animate-v2-sweep rounded-full"
          style={{ backgroundColor: tone }}
        />
      ) : (
        <span
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-[var(--ease-v2-out)]"
          style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: tone }}
        />
      )}
    </div>
  );
}

/* ============================================================================
   Skeleton / Empty
   ============================================================================ */

/**
 * Loading placeholder. Shaped like the content it replaces, so the layout
 * doesn't jump when real data arrives.
 */
export function Skeleton({ className }) {
  return <div className={cx("animate-v2-pulse rounded-[var(--radius-v2-sm)] bg-[var(--v2-line)]", className)} />;
}

export function Empty({ icon, title, hint, action, className }) {
  return (
    <div className={cx("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {icon && (
        <div className="mb-3 flex size-11 items-center justify-center rounded-[var(--radius-v2-md)] bg-[var(--v2-hover)] text-lo">
          {icon}
        </div>
      )}
      <p className="text-[14px] font-medium text-hi">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-[12.5px] leading-relaxed text-lo">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ============================================================================
   Misc
   ============================================================================ */

/** Small monospace token for ids, hashes and durations. */
export function Mono({ children, className }) {
  return (
    <span className={cx("numeric font-[family-name:var(--font-v2-mono)] text-[11.5px] text-lo", className)}>
      {children}
    </span>
  );
}

/** Thin horizontal rule matching the panel hairline. */
export function Divider({ className }) {
  return <div className={cx("h-px w-full bg-[var(--v2-line-soft)]", className)} />;
}
