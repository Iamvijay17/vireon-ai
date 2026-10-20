import { useCallback, useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";
import { confirmDialog } from "../components/ui/confirmBus";

/**
 * Stops edits being thrown away by accident. While `when` is true:
 *   - closing or reloading the tab asks first (the browser's own prompt);
 *   - moving to another page inside the app asks first (our dialog).
 * Staying put, or pressing "Keep editing", loses nothing.
 *
 * Needs a data router (createBrowserRouter) for useBlocker - see main.jsx.
 *
 * `bypass()` lets the very next navigation through. Call it right before an
 * intentional navigation that follows a successful save: the save has cleared
 * the dirty flag, but React has not re-rendered yet, so without it the guard
 * would still see unsaved changes and ask about work that was just saved.
 */
export function useUnsavedChangesGuard(when, { title = "Leave without saving?", content = "You have unsaved changes. If you leave this page they will be lost." } = {}) {
  const bypassRef = useRef(false);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (bypassRef.current) {
      bypassRef.current = false;
      return false;
    }
    const here = currentLocation.pathname + currentLocation.search;
    const there = nextLocation.pathname + nextLocation.search;
    return when && here !== there;
  });

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    confirmDialog({ title, content, confirmText: "Discard changes", cancelText: "Keep editing", danger: true }).then((leave) => {
      if (leave) blocker.proceed();
      else blocker.reset();
    });
  }, [blocker, title, content]);

  useEffect(() => {
    if (!when) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [when]);

  const bypass = useCallback(() => {
    bypassRef.current = true;
  }, []);

  return { bypass };
}

export default useUnsavedChangesGuard;
