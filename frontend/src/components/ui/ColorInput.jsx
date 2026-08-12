import { cn } from "./cn";
import { Input } from "./Input";

const isValidCssColor = (value) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value || "");

/**
 * Text input for a CSS color string, paired with a native swatch/color-picker
 * button. Falls back to a neutral swatch when the current value isn't a hex
 * color the native picker understands (e.g. empty, or a named/gradient value).
 */
export const ColorInput = ({ value, onChange, disabled = false, placeholder = "#000000", className }) => {
  const swatchColor = isValidCssColor(value) ? value : "#000000";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label
        className={cn(
          "relative size-9 shrink-0 overflow-hidden rounded-lg border border-border",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        )}
        style={{ backgroundColor: swatchColor }}
      >
        <input
          type="color"
          value={swatchColor}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          aria-label="Pick a color"
        />
      </label>
      <Input
        value={value || ""}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="flex-1"
      />
    </div>
  );
};

export default ColorInput;
