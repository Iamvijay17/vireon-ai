import { useEffect, useRef, useState } from "react";
import { Search, Check, ChevronDown, X } from "lucide-react";
import { cx } from "./cx";

/* ============================================================================
   Field
   ============================================================================
   Every input in v2 shares one height, one radius and one focus treatment,
   so a toolbar of mixed controls lines up without per-screen tuning.
   ============================================================================ */

const FIELD_BASE =
  "h-9 rounded-[var(--radius-v2-sm)] border border-line bg-surface-2 px-3 text-[13px] text-hi " +
  "placeholder:text-[var(--v2-text-3)] transition-colors duration-140 " +
  "hover:border-line-strong focus:border-[var(--v2-accent)] focus:outline-none";

export function Input({ className, icon, value, onChange, onClear, ...props }) {
  const clearable = onClear && value;
  return (
    <div className={cx("relative flex items-center", className)}>
      {icon && (
        <span className="pointer-events-none absolute left-3 text-[var(--v2-text-3)]">{icon}</span>
      )}
      <input
        value={value}
        onChange={onChange}
        className={cx(FIELD_BASE, "w-full", icon && "pl-9", clearable && "pr-8")}
        {...props}
      />
      {clearable && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear"
          className="absolute right-2 rounded p-0.5 text-[var(--v2-text-3)] hover:text-hi"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function SearchInput(props) {
  return <Input icon={<Search className="size-3.5" />} placeholder="Search…" {...props} />;
}

/* ============================================================================
   Select
   ============================================================================
   A native <select> under custom chrome. Deliberate: a hand-rolled listbox
   costs keyboard handling, focus management and mobile behaviour that the
   platform already gets right, and nothing here needs custom option markup.
   ============================================================================ */

export function Select({ value, onChange, options = [], className, ...props }) {
  return (
    <div className={cx("relative inline-flex items-center", className)}>
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className={cx(FIELD_BASE, "w-full cursor-pointer appearance-none pr-8")}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-[var(--v2-overlay)] text-hi">
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-[var(--v2-text-3)]" />
    </div>
  );
}

/* ============================================================================
   Segmented control
   ============================================================================
   For small, mutually exclusive filters where showing every option is worth
   the width - it removes a click versus a dropdown.
   ============================================================================ */

export function Segmented({ value, onChange, options = [], className }) {
  return (
    <div
      role="tablist"
      className={cx(
        "inline-flex h-9 max-w-full items-center gap-0.5 overflow-x-auto rounded-[var(--radius-v2-sm)] border border-line bg-surface-2 p-0.5 [scrollbar-width:none]",
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(opt.value)}
            className={cx(
              "flex h-full shrink-0 items-center gap-1.5 rounded-[6px] px-2.5 text-[12.5px] font-medium whitespace-nowrap",
              "transition-colors duration-140",
              active ? "bg-[var(--v2-active)] text-hi" : "text-mid hover:text-hi"
            )}
          >
            {opt.label}
            {opt.count != null && (
              <span className={cx("numeric text-[11px]", active ? "text-mid" : "text-lo")}>{opt.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================================
   Checkbox
   ============================================================================ */

/**
 * `label` renders visible text beside the box. For a checkbox whose meaning
 * comes from its row or column - a select-all header, a per-row selector -
 * pass `srLabel` instead: it names the control for assistive tech without
 * printing that name into the layout.
 */
export function Checkbox({ checked, indeterminate = false, onChange, label, srLabel, className }) {
  const ref = useRef(null);

  // `indeterminate` is a DOM property, not an attribute - React cannot set
  // it declaratively, so it has to be written after render.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label className={cx("inline-flex cursor-pointer items-center gap-2 select-none", className)}>
      <span className="relative flex size-4 shrink-0 items-center justify-center">
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange?.(e.target.checked)}
          className="peer size-4 cursor-pointer appearance-none rounded-[5px] border border-line-strong bg-surface-2 transition-colors checked:border-[var(--v2-accent)] checked:bg-[var(--v2-accent)] indeterminate:border-[var(--v2-accent)] indeterminate:bg-[var(--v2-accent)]"
          aria-label={srLabel || label}
        />
        <Check
          className="pointer-events-none absolute size-3 text-white opacity-0 peer-checked:opacity-100"
          strokeWidth={3.5}
        />
        <span className="pointer-events-none absolute h-0.5 w-2 rounded-full bg-white opacity-0 peer-indeterminate:opacity-100" />
      </span>
      {label && <span className="text-[13px] text-mid">{label}</span>}
    </label>
  );
}

/* ============================================================================
   Menu
   ============================================================================
   A lightweight popover menu for row actions. Closes on outside click and
   on Escape, and restores focus to its trigger - the same contract the
   Modal honours, so keyboard behaviour is consistent across overlays.
   ============================================================================ */

export function Menu({ trigger, items = [], align = "right" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <span
        ref={triggerRef}
        onClick={(e) => {
          // Row-level menus live inside clickable rows; without this the
          // row's own onClick fires behind the menu.
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {trigger}
      </span>

      {open && (
        <div
          role="menu"
          className={cx(
            "absolute top-full z-50 mt-1 min-w-[168px] animate-v2-pop overflow-hidden rounded-[var(--radius-v2-md)]",
            "border border-line-strong bg-surface-3 p-1 shadow-[var(--shadow-v2-pop)]",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {items.map((item, i) =>
            item.divider ? (
              <div key={`d${i}`} className="my-1 h-px bg-[var(--v2-line-soft)]" />
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  item.onSelect?.();
                }}
                className={cx(
                  "flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[13px]",
                  "transition-colors disabled:pointer-events-none disabled:opacity-40",
                  item.danger
                    ? "text-[var(--color-state-fail)] hover:bg-[color-mix(in_srgb,var(--color-state-fail)_12%,transparent)]"
                    : "text-mid hover:bg-[var(--v2-hover)] hover:text-hi"
                )}
              >
                {item.icon}
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   Table
   ============================================================================
   Carries forward the one thing v1's table got wrong: a clickable row must
   be reachable by keyboard. Rows are only made interactive when there is
   actually an onRowClick, so read-only tables don't fill the tab order.
   ============================================================================ */

/**
 * Below `md` (unless `stack={false}`) rows collapse into cards instead of
 * scrolling sideways: the header row is hidden and each cell shows its
 * column title inline. Pure CSS, so callers are unchanged. Columns whose
 * title isn't plain text (a select-all checkbox, an empty actions header)
 * render unlabelled and share the card's first line; set
 * `stackLabel: false` on a column that should lead the card without a
 * label (e.g. the row's name).
 */
const hasTitleText = (col) => typeof col.title === "string" && col.title.length > 0;

export function Table({ columns = [], rows = [], rowKey = "id", onRowClick, empty, className, stack = true }) {
  if (rows.length === 0 && empty) return empty;

  return (
    <div className={cx("w-full overflow-x-auto", className)}>
      <table className={cx("w-full border-collapse", stack && "max-md:block")}>
        <thead className={cx(stack && "max-md:hidden")}>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={cx(
                  "label-xs border-b border-line px-4 py-2.5 text-left whitespace-nowrap",
                  col.align === "right" && "text-right"
                )}
              >
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={cx(stack && "max-md:block")}>
          {rows.map((row) => (
            <tr
              key={row[rowKey]}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              {...(onRowClick && {
                tabIndex: 0,
                role: "button",
                onKeyDown: (e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  // Let controls inside the row handle their own keys.
                  if (e.target !== e.currentTarget) return;
                  e.preventDefault();
                  onRowClick(row);
                },
              })}
              className={cx(
                "border-b border-line-soft last:border-0",
                stack && "max-md:flex max-md:flex-wrap max-md:items-center max-md:px-4 max-md:py-3",
                onRowClick &&
                  "interactive cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--v2-focus)]"
              )}
            >
              {columns.map((col) => {
                const titled = hasTitleText(col);
                const labelled = titled && col.stackLabel !== false;
                // Stacked card roles: "labelled" cells are key/value rows,
                // "leading" cells (titled, stackLabel:false) headline the
                // card, "control" cells (checkbox, menu) share its first line.
                const leading = titled && !labelled;
                const control = !titled;
                return (
                  <td
                    key={col.key}
                    className={cx(
                      "px-4 py-3 text-[13px] text-mid align-middle",
                      col.align === "right" && "text-right",
                      stack && "max-md:min-w-0 max-md:px-0",
                      stack && labelled && "max-md:flex max-md:w-full max-md:items-center max-md:justify-between max-md:gap-3 max-md:py-1.5",
                      stack && leading && "max-md:-order-1 max-md:w-full max-md:py-1",
                      stack && control && "max-md:order-first max-md:py-1",
                      stack && control && col.align === "right" && "max-md:ml-auto"
                    )}
                  >
                    {stack && labelled && <span className="label-xs shrink-0 md:hidden">{col.title}</span>}
                    {stack && labelled ? (
                      <div className="min-w-0 max-md:text-right md:contents">{col.render ? col.render(row) : row[col.key]}</div>
                    ) : col.render ? (
                      col.render(row)
                    ) : (
                      row[col.key]
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
