import { useState } from "react";
import { ThemeProvider } from "./shared/ThemeContext";
import { BreadcrumbProvider } from "./shared/BreadcrumbContext";
import { ToastProvider } from "./components/ui/Toast";
import { ConfirmDialogHost } from "./components/ui/ConfirmDialog";
import Structure from "./layout";
import "./App.css";

const App = () => {
  const [theme] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("vireon-theme");
      return saved || "light";
    }
    return "light";
  });

  return (
    <div className={`app-theme-transition theme-${theme} min-h-screen bg-bg`}>
      <ThemeProvider initialTheme={theme}>
        <ToastProvider>
          <BreadcrumbProvider>
            <Structure />
          </BreadcrumbProvider>
          <ConfirmDialogHost />
        </ToastProvider>
      </ThemeProvider>
    </div>
  );
};

export default App;
