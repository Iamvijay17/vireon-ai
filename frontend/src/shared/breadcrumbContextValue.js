import { createContext, useContext, useEffect } from "react";

export const BreadcrumbContext = createContext({
  label: null,
  setLabel: () => {},
});

/**
 * Lets a detail page register the human-readable name of the record it just
 * loaded (e.g. a course or video title) as the current breadcrumb's last
 * segment, instead of the breadcrumb only ever showing route param IDs.
 * Automatically clears on unmount so stale labels don't leak across routes.
 */
export const useSetBreadcrumbLabel = (value) => {
  const { setLabel } = useContext(BreadcrumbContext);

  useEffect(() => {
    setLabel(value || null);
    return () => setLabel(null);
  }, [value, setLabel]);
};
