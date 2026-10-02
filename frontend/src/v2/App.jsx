import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { Shell } from "./layout/Shell";
import { ErrorBoundary } from "../components";
import { Skeleton } from "./ui/primitives";

/**
 * v2 app root.
 *
 * Mounted at /v2/* outside v1's layout, so the two shells never nest and
 * v1 keeps working untouched while this is built out. When v2 is complete
 * this becomes the app root and /v2 goes away.
 *
 * Screens are lazy per route for the same reason v1 does it - the Remotion
 * player alone is a 400kB chunk that most screens never touch.
 */
const Overview = lazy(() => import("./pages/Overview"));
const Jobs = lazy(() => import("./pages/Jobs"));
const JobDetail = lazy(() => import("./pages/JobDetail"));
const CreateVideo = lazy(() => import("./pages/CreateVideo"));

/** Skeleton shaped like a page, so route transitions don't flash empty. */
function RouteFallback() {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
      <Skeleton className="h-44 w-full" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}

/** Placeholder for screens not built yet, so nav never dead-ends. */
function Planned({ name }) {
  return (
    <div className="mx-auto max-w-[1400px] animate-v2-rise">
      <div className="panel flex flex-col items-center justify-center px-6 py-20 text-center">
        <p className="label-xs mb-3">Coming in v2</p>
        <h2 className="display text-[19px] text-hi">{name}</h2>
        <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-mid">
          Not rebuilt yet. The v1 version of this screen is still available and fully working.
        </p>
      </div>
    </div>
  );
}

export default function V2App() {
  return (
    <Shell>
      <ErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route index element={<Overview />} />
            <Route path="new" element={<CreateVideo />} />
            <Route path="studio" element={<Planned name="Studio" />} />
            <Route path="jobs" element={<Jobs />} />
            <Route path="jobs/:id" element={<JobDetail />} />
            <Route path="courses" element={<Planned name="Courses" />} />
            <Route path="audio" element={<Planned name="Audio" />} />
            <Route path="assets" element={<Planned name="Assets" />} />
            <Route path="analytics" element={<Planned name="Analytics" />} />
            <Route path="logs" element={<Planned name="Logs" />} />
            <Route path="settings" element={<Planned name="Settings" />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </Shell>
  );
}
