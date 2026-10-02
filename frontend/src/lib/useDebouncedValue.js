import { useEffect, useState } from "react";

/**
 * `value`, but only after it has stopped changing for `delayMs`. Keep the
 * input itself bound to the raw state so typing stays instant; use the
 * debounced copy for anything expensive (a server query key, a re-render of
 * a heavy preview). The first value is returned immediately.
 */
// Shared pause length for search boxes that hit the server.
export const SEARCH_DEBOUNCE_MS = 300;

export function useDebouncedValue(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}

export default useDebouncedValue;
