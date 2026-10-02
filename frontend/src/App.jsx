import { useState, useContext, lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { useSocketQuerySync } from "./lib/useSocketQuerySync";
import { ThemeProvider } from "./shared/ThemeContext";
import { ThemeContext } from "./shared/themeContextValue";
import { BreadcrumbProvider } from "./shared/BreadcrumbContext";
import { SidebarProvider } from "./shared/SidebarContext";
import { ToastProvider } from "./components/ui/Toast";
import { ConfirmDialogHost } from "./components/ui/ConfirmDialog";
import { ErrorBoundary } from "./components";
import Structure from "./layout";
import PageTitle from "./components/PageTitle";

// v2 mounts outside v1's layout so the two shells never nest. See src/v2/App.jsx.
const V2App = lazy(() => import("./v2/App"));
import "./App.css";

const AppShell = () => {
  const { theme } = useContext(ThemeContext);

  // One subscription for the whole app: socket events invalidate the query
  // cache, so pages stop each maintaining their own poll + manual merge.
  // Mounted here rather than per-page so an event still refreshes a list
  // the user isn't currently looking at.
  useSocketQuerySync();

  return (
    <div className={`app-theme-transition theme-${theme} min-h-screen bg-bg`}>
      <ToastProvider>
        <SidebarProvider>
          <BreadcrumbProvider>
            <PageTitle />
            <Routes>
              {/* v2 gets the whole subtree, with its own shell. Everything
                  else falls through to v1's layout unchanged. */}
              <Route
                path="/v2/*"
                element={
                  <Suspense fallback={null}>
                    <V2App />
                  </Suspense>
                }
              />
              <Route path="*" element={<Structure />} />
            </Routes>
          </BreadcrumbProvider>
        </SidebarProvider>
        <ConfirmDialogHost />
      </ToastProvider>
    </div>
  );
};

const App = () => {
  const [theme] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("vireon-theme");
      return saved || "light";
    }
    return "light";
  });

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider initialTheme={theme}>
        {/* Outer net for a crash in the shell itself (sidebar, navbar,
            providers) - layout/index.jsx has a finer-grained one around
            the routed page, which catches the common case first. */}
        <ErrorBoundary>
          <AppShell />
        </ErrorBoundary>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
