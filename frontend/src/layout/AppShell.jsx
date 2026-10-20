import { useState, useCallback, useContext, Suspense, lazy } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import CommandPalette from "./CommandPalette";
import LogDrawer from "../components/LogDrawer";
import { LoadingState, ErrorBoundary } from "../components";
import { ServerUnreachable, ServerUnreachableBanner } from "../components/ServerUnreachable";
import { cn } from "../components/ui/cn";
import { SidebarContext } from "../shared/sidebarContextValue";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useJobNotifications } from "../lib/useJobNotifications";
import { useBackendStatus } from "../lib/useBackendStatus";
import { useEscapeKey, useLockBodyScroll } from "../components/ui/hooks";

const Overview = lazy(() => import("../pages/dashboard"));
const Wizard = lazy(() => import("../pages/wizard"));
const RenderPage = lazy(() => import("../pages/render"));
const StudioPage = lazy(() => import("../pages/studio"));
const AudioPage = lazy(() => import("../pages/audio"));
const ImagesPage = lazy(() => import("../pages/images"));
const CoursesList = lazy(() => import("../pages/courses/CoursesList"));
const CourseDetail = lazy(() => import("../pages/courses/CourseDetail"));
const CourseCurriculum = lazy(() => import("../pages/courses/CourseCurriculum"));
const CourseVideoEditor = lazy(() => import("../pages/courses/CourseVideoEditor"));
const CourseVideoStudio = lazy(() => import("../pages/courses/CourseVideoStudio"));
const SettingsPage = lazy(() => import("../pages/settings"));
const Analytics = lazy(() => import("../pages/analytics"));
const CompletedVideos = lazy(() => import("../pages/complete"));
const Projects = lazy(() => import("../pages/projects"));
const Jobs = lazy(() => import("../pages/jobs"));
const MediaLibrary = lazy(() => import("../pages/assets"));
const LiveLogs = lazy(() => import("../pages/logs"));
const WorkflowPage = lazy(() => import("../pages/workflow"));
const PublishingPage = lazy(() => import("../pages/publishing"));
const PromotionPage = lazy(() => import("../pages/promotion"));
const TemplatesPage = lazy(() => import("../pages/templates"));
const ResourcesPage = lazy(() => import("../pages/resources"));
const QualityPage = lazy(() => import("../pages/quality"));

// Matches Tailwind's `lg`. At and above it the sidebar is a persistent,
// collapsible rail; below it the sidebar is an off-canvas drawer so phones
// and portrait tablets get the full width for content.
const LARGE_QUERY = "(min-width: 1024px)";

const AppShell = () => {
  const location = useLocation();
  const { forceCollapsed } = useContext(SidebarContext);
  const isDesktop = useMediaQuery(LARGE_QUERY);

  // One app-wide listener: finished/failed jobs announce themselves wherever
  // the user is, if they have not turned that off in Settings.
  useJobNotifications();

  // When the API stops answering, say so once, in one place, instead of every page
  // failing in its own way. The routed page stays mounted underneath (just inert) so
  // unsaved edits survive the outage; "View last loaded data" tucks the screen away
  // for this outage only - a new outage shows it again.
  const backend = useBackendStatus();
  const [dismissedOutage, setDismissedOutage] = useState(null);
  const backendDown = backend.status === "down";
  const outageDismissed = backendDown && dismissedOutage === backend.downSince;
  const showOutageScreen = backendDown && !outageDismissed;

  const [collapsed, setCollapsed] = useState(false);
  // The drawer is remembered as "opened at <pathname>", so navigating
  // anywhere (or growing past the breakpoint) closes it without an effect.
  const [drawerPath, setDrawerPath] = useState(null);
  const drawerOpen = !isDesktop && drawerPath === location.pathname;

  const toggleSidebar = useCallback(() => {
    if (isDesktop) setCollapsed((prev) => !prev);
    else setDrawerPath((prev) => (prev === location.pathname ? null : location.pathname));
  }, [isDesktop, location.pathname]);

  const closeDrawer = useCallback(() => setDrawerPath(null), []);

  useEscapeKey(closeDrawer, drawerOpen);
  useLockBodyScroll(drawerOpen);

  // The drawer always shows full labels; collapse only applies to the rail.
  const effectiveCollapsed = isDesktop ? (forceCollapsed ?? collapsed) : false;

  return (
    <div className="min-h-screen bg-bg">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[300] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>

      <Sidebar collapsed={effectiveCollapsed} isDrawer={!isDesktop} open={drawerOpen} onClose={closeDrawer} />

      <div
        className={cn(
          "flex min-h-screen min-w-0 flex-col transition-[margin-left] duration-200",
          effectiveCollapsed ? "lg:ml-16" : "lg:ml-60"
        )}
      >
        <Topbar collapsed={isDesktop ? effectiveCollapsed : !drawerOpen} onToggle={toggleSidebar} isDrawer={!isDesktop} />
        <CommandPalette />

        <main id="main-content" tabIndex={-1} className="relative min-w-0 flex-1 p-4 outline-none sm:p-6">
          {outageDismissed && (
            <ServerUnreachableBanner checking={backend.checking} nextCheckAt={backend.nextCheckAt} onRetry={backend.retry} />
          )}
          <div key={location.pathname} inert={showOutageScreen} className="mx-auto w-full max-w-[1600px] animate-fade-in">
            {/* Inside the layout, not around it: a page crash keeps the
                sidebar, top bar and log drawer alive so the user can
                navigate away instead of hitting a blank screen. Resets on
                route change (see ErrorBoundary.componentDidUpdate), and
                wraps Suspense so a failed lazy() chunk is caught too. */}
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<LoadingState label="Loading…" />}>
                <Routes>
                  <Route path="/" element={<Overview />} />
                  <Route path="/wizard" element={<Wizard />} />
                  <Route path="/render" element={<RenderPage />} />
                  <Route path="/studio" element={<StudioPage />} />
                  <Route path="/audio" element={<AudioPage />} />
                  <Route path="/images" element={<ImagesPage />} />
                  <Route path="/projects" element={<Projects />} />
                  <Route path="/jobs" element={<Jobs />} />
                  <Route path="/media" element={<MediaLibrary />} />
                  {/* Old name of the Media Library - kept so bookmarks still work. */}
                  <Route path="/assets" element={<Navigate to="/media" replace />} />
                  <Route path="/templates" element={<TemplatesPage />} />
                  <Route path="/resources" element={<ResourcesPage />} />
                  <Route path="/quality" element={<QualityPage />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/logs" element={<LiveLogs />} />
                  <Route path="/workflow" element={<WorkflowPage />} />
                  <Route path="/publishing" element={<PublishingPage />} />
                  <Route path="/promotion/*" element={<PromotionPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/editor/complete" element={<CompletedVideos />} />
                  <Route path="/courses" element={<CoursesList />} />
                  <Route path="/courses/:id" element={<CourseDetail />} />
                  <Route path="/courses/:id/curriculum" element={<CourseCurriculum />} />
                  <Route path="/courses/:courseId/videos/:videoId" element={<CourseVideoEditor />} />
                  <Route path="/courses/:courseId/videos/:videoId/studio" element={<CourseVideoStudio />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </div>
          {showOutageScreen && (
            <ServerUnreachable
              kind={backend.kind}
              checking={backend.checking}
              nextCheckAt={backend.nextCheckAt}
              downSince={backend.downSince}
              failures={backend.failures}
              onRetry={backend.retry}
              onDismiss={() => setDismissedOutage(backend.downSince)}
            />
          )}
        </main>
      </div>

      {/* Right-edge hover-to-expand live logs drawer (available on every page) */}
      <LogDrawer />
    </div>
  );
};

const NotFound = () => (
  <div className="py-16 text-center">
    <p className="text-sm font-medium text-text-primary">This page doesn’t exist.</p>
    <p className="mt-1 text-[13px] text-text-tertiary">Use the sidebar, or press Ctrl K to jump to a page.</p>
  </div>
);

export default AppShell;
