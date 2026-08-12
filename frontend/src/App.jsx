import { useState, useContext } from "react";
import { ThemeProvider } from "./shared/ThemeContext";
import { ThemeContext } from "./shared/themeContextValue";
import { BreadcrumbProvider } from "./shared/BreadcrumbContext";
import { SidebarProvider } from "./shared/SidebarContext";
import { ToastProvider } from "./components/ui/Toast";
import { ConfirmDialogHost } from "./components/ui/ConfirmDialog";
import Structure from "./layout";
import "./App.css";

const AppShell = () => {
  const { theme } = useContext(ThemeContext);

  return (
    <div className={`app-theme-transition theme-${theme} min-h-screen bg-bg`}>
      <ToastProvider>
        <SidebarProvider>
          <BreadcrumbProvider>
            <Structure />
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
    <ThemeProvider initialTheme={theme}>
      <AppShell />
    </ThemeProvider>
  );
};

export default App;
