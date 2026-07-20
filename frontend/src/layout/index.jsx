import { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import AppSidebar from "./sidebar";
import AppNavbar from "./navbar";
import Breadcrumbs from "./Breadcrumbs";
import CommandPalette from "./CommandPalette";
import { LoadingState } from "../components";
import PlaceholderPage from "../pages/placeholder";
import { cn } from "../components/ui/cn";

const Dashboard = lazy(() => import("../pages/dashboard"));
const Wizard = lazy(() => import("../pages/wizard"));
const RenderPage = lazy(() => import("../pages/render"));
const StudioPage = lazy(() => import("../pages/studio"));
const CoursesList = lazy(() => import("../pages/courses/CoursesList"));
const CourseDetail = lazy(() => import("../pages/courses/CourseDetail"));
const CourseVideoEditor = lazy(() => import("../pages/courses/CourseVideoEditor"));

const LARGE_BREAKPOINT = 992;

const AppLayout = () => {
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") return window.innerWidth < LARGE_BREAKPOINT;
    return false;
  });

  const handleResize = useCallback(() => {
    if (window.innerWidth < LARGE_BREAKPOINT) setCollapsed(true);
  }, []);

  useEffect(() => {
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleResize]);

  const toggleCollapsed = useCallback(() => setCollapsed((prev) => !prev), []);

  return (
    <div className="min-h-screen bg-bg">
      <AppSidebar collapsed={collapsed} onCollapse={setCollapsed} />

      <div
        className={cn("flex min-h-screen flex-col transition-[margin-left] duration-200", collapsed ? "ml-16" : "ml-60")}
      >
        <AppNavbar collapsed={collapsed} onToggle={toggleCollapsed} />
        <Breadcrumbs />
        <CommandPalette />

        <main className="flex-1 p-6">
          <div key={location.pathname} className="animate-fade-in">
            <Suspense fallback={<LoadingState label="Loading..." />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/wizard" element={<Wizard />} />
                <Route path="/render" element={<RenderPage />} />
                <Route path="/studio" element={<StudioPage />} />
                <Route path="/projects" element={<PlaceholderPage title="Projects" description="Manage your AI projects, create new ones, and organize your work." />} />
                <Route path="/analytics" element={<PlaceholderPage title="Analytics" description="View usage analytics and performance metrics for your renders." />} />
                <Route path="/settings" element={<PlaceholderPage title="Settings" description="Configure your preferences and application settings." />} />
                <Route path="/editor/complete" element={<PlaceholderPage title="Complete" description="View your completed renders and download the final outputs." />} />
                <Route path="/courses" element={<CoursesList />} />
                <Route path="/courses/:id" element={<CourseDetail />} />
                <Route path="/courses/:courseId/videos/:videoId" element={<CourseVideoEditor />} />
              </Routes>
            </Suspense>
          </div>
        </main>

        <footer className="border-t border-border-light bg-surface px-6 py-4 text-center text-[13px] text-text-tertiary">
          Vireon AI &copy; {new Date().getFullYear()} &mdash; Built with precision
        </footer>
      </div>
    </div>
  );
};

export default AppLayout;
