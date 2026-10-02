import { useSyncExternalStore } from "react";

/**
 * Subscribes to a CSS media query. Used where a layout decision changes
 * behaviour (e.g. sidebar is a drawer vs. a rail) and can't be expressed
 * with Tailwind responsive classes alone.
 */
export const useMediaQuery = (query) =>
  useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );

export default useMediaQuery;
