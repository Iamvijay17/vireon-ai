import { createContext, useContext, useEffect } from "react";

export const SidebarContext = createContext({
  forceCollapsed: null,
  setForceCollapsed: () => {},
});

/**
 * Lets a full-width page (e.g. an editor) force the global sidebar collapsed
 * while it's mounted, restoring whatever the user had before on unmount.
 */
export const useForceSidebarCollapsed = (value) => {
  const { setForceCollapsed } = useContext(SidebarContext);

  useEffect(() => {
    setForceCollapsed(value);
    return () => setForceCollapsed(null);
  }, [value, setForceCollapsed]);
};
