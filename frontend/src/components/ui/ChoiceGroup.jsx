import { useRef } from "react";
import { cn } from "./cn";

/**
 * A radiogroup of selectable cards, for choices that deserve a sentence of
 * explanation (video type, aspect ratio, render quality). One tab stop,
 * arrow keys move and select. `options`: [{ value, label, hint?, preview?,
 * disabled?, disabledReason? }]. `preview` is any node shown above the label.
 */
export const ChoiceGroup = ({ value, onChange, options = [], columns = "sm:grid-cols-2", "aria-label": ariaLabel, className }) => {
  const refs = useRef([]);

  const move = (from, step) => {
    for (let n = 1; n <= options.length; n += 1) {
      const next = (from + step * n + options.length * n) % options.length;
      if (!options[next].disabled) {
        refs.current[next]?.focus();
        onChange?.(options[next].value);
        return;
      }
    }
  };

  const onKeyDown = (e, index) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    move(index, step);
  };

  // Roving tabindex: the selected card is the tab stop (or the first enabled one if none is).
  const tabStop = options.findIndex((o) => o.value === value && !o.disabled);
  const fallback = tabStop >= 0 ? tabStop : options.findIndex((o) => !o.disabled);

  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("grid grid-cols-1 gap-2", columns, className)}>
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={opt.disabled}
            tabIndex={i === fallback ? 0 : -1}
            title={opt.disabled ? opt.disabledReason : undefined}
            onClick={() => onChange?.(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-45",
              selected ? "border-accent bg-accent-subtle" : "border-border bg-surface hover:border-border-strong hover:bg-surface-hover"
            )}
          >
            {opt.preview && <span className="mt-0.5 flex shrink-0 items-center justify-center">{opt.preview}</span>}
            <span className="min-w-0">
              <span className={cn("block text-[13px] font-medium", selected ? "text-text-primary" : "text-text-primary")}>{opt.label}</span>
              {opt.hint && <span className="mt-0.5 block text-xs leading-snug text-text-tertiary">{opt.hint}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default ChoiceGroup;
