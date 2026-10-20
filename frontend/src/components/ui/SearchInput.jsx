import { forwardRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "./cn";

/**
 * Search box with a clear button. Controlled: `value` + `onChange(string)`.
 * The caller decides whether to debounce (see lib/useDebouncedValue) - this
 * only owns the field itself, so it can filter locally or drive a query.
 */
export const SearchInput = forwardRef(function SearchInput(
  { value, onChange, placeholder = "Search...", className, "aria-label": ariaLabel, ...props },
  ref
) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary" />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        className={cn(
          "h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-8 text-sm text-text-primary",
          "placeholder:text-text-tertiary outline-none transition-colors hover:border-border-strong",
          "focus:border-accent focus:ring-2 focus:ring-accent/25",
          // The native clear control duplicates the one below.
          "[&::-webkit-search-cancel-button]:appearance-none"
        )}
        {...props}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange?.("")}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
});

export default SearchInput;
