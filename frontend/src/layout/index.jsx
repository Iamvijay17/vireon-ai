import { useState, useCallback, useContext, Suspense, lazy } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import AppSidebar from "./sidebar";
import AppNavbar from "./navbar";
import Breadcrumbs from "./Breadcrumbs";
import CommandPalette from "./CommandPalette";
import LogDrawer from "../components/LogDrawer";
import { LoadingState, ErrorBoundary } from "../components";
import { cn } from "../components/ui/cn";
import { SidebarContext } from "../shared/sidebarContextValue";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useEscapeKey, useLockBodyScroll } from "../components/ui/hooks";

const Dashboard = lazy(() => import("../pages/dashboard"));
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
const Assets = lazy(() => import("../pages/assets"));
const LiveLogs = lazy(() => import("../pages/logs"));
const WorkflowPage = lazy(() => import("../pages/workflow"));
const PublishingPage = lazy(() => import("../pages/publishing"));

// Matches Tailwind's `lg`. At and above it the sidebar is a persistent,
// collapsible rail; below it the sidebar is an off-canvas drawer so phones
// and portrait tablets get the full width for content.
const LARGE_QUERY = "(min-width: 1024px)";

const AppLayout = () => {
  const location = useLocation();
  const { forceCollapsed } = useContext(SidebarContext);
  const isDesktop = useMediaQuery(LARGE_QUERY);

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
      <AppSidebar collapsed={effectiveCollapsed} isDrawer={!isDesktop} open={drawerOpen} onClose={closeDrawer} />

      <div
        className={cn(
          "flex min-h-screen min-w-0 flex-col transition-[margin-left] duration-200",
          effectiveCollapsed ? "lg:ml-16" : "lg:ml-60"
        )}
      >
        <AppNavbar collapsed={isDesktop ? effectiveCollapsed : !drawerOpen} onToggle={toggleSidebar} isDrawer={!isDesktop} />
        <Breadcrumbs />
        <CommandPalette />

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <div key={location.pathname} className="animate-fade-in">
            {/* Inside the layout, not around it: a page crash keeps the
                sidebar, navbar and log drawer alive so the user can
                navigate away instead of hitting a blank screen. Resets on
                route change (see ErrorBoundary.componentDidUpdate), and
                wraps Suspense so a failed lazy() chunk is caught too. */}
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<LoadingState label="Loading..." />}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/wizard" element={<Wizard />} />
                  <Route path="/render" element={<RenderPage />} />
                  <Route path="/studio" element={<StudioPage />} />
                  <Route path="/audio" element={<AudioPage />} />
                  <Route path="/images" element={<ImagesPage />} />
                  <Route path="/projects" element={<Projects />} />
                  <Route path="/jobs" element={<Jobs />} />
                  <Route path="/assets" element={<Assets />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/logs" element={<LiveLogs />} />
                  <Route path="/workflow" element={<WorkflowPage />} />
                  <Route path="/publishing" element={<PublishingPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/editor/complete" element={<CompletedVideos />} />
                  <Route path="/courses" element={<CoursesList />} />
                  <Route path="/courses/:id" element={<CourseDetail />} />
                  <Route path="/courses/:id/curriculum" element={<CourseCurriculum />} />
                  <Route path="/courses/:courseId/videos/:videoId" element={<CourseVideoEditor />} />
                  <Route path="/courses/:courseId/videos/:videoId/studio" element={<CourseVideoStudio />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>

        <footer className="border-t border-border-light bg-surface px-4 py-4 sm:px-6 text-center text-[13px] text-text-tertiary">
          Vireon AI &copy; {new Date().getFullYear()} &mdash; Built with precision
        </footer>
      </div>

      {/* Right-edge hover-to-expand live logs drawer (available on every page) */}
      <LogDrawer />
    </div>
  );
};

export default AppLayout;
