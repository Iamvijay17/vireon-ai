import { useState } from "react";
import { APP_VERSION } from "../lib/appVersion";
import { isStaleBuild, useApiVersion } from "../lib/useApiVersion";

// Shown when a deploy lands while this tab is open: a single-page app keeps
// running the JS it loaded, so without this the new UI only appears after a
// manual refresh. "Later" hides it until a still newer build is deployed.
export default function UpdateBanner() {
  const { data } = useApiVersion();
  const [dismissedFor, setDismissedFor] = useState(null);

  const latest = data?.version;
  if (!isStaleBuild(latest, APP_VERSION) || dismissedFor === latest) return null;

  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 z-[100] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg"
    >
      <span>A new version (v{latest}) is available.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="cursor-pointer rounded-md bg-white px-2.5 py-1 font-medium text-slate-900 hover:bg-slate-200"
      >
        Reload
      </button>
      <button
        type="button"
        onClick={() => setDismissedFor(latest)}
        className="cursor-pointer text-slate-300 hover:text-white"
      >
        Later
      </button>
    </div>
  );
}
