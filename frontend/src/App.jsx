import { useState, useMemo, useContext } from "react";
import { ConfigProvider, theme } from "antd";
import { ThemeProvider } from "./shared/ThemeContext";
import { ThemeContext } from "./shared/themeContextValue";
import { BreadcrumbProvider } from "./shared/BreadcrumbContext";
import createAntdTheme from "./shared/theme";
import Structure from "./layout";
import "./App.css";

const InnerApp = () => {
  const { theme: currentTheme } = useContext(ThemeContext);
  const antdTheme = useMemo(() => createAntdTheme(currentTheme), [currentTheme]);

  return (
    <ConfigProvider
      theme={antdTheme}
      algorithm={currentTheme === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm}
    >
      <BreadcrumbProvider>
        <Structure />
      </BreadcrumbProvider>
    </ConfigProvider>
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
    <div className={`app-theme-transition theme-${theme}`}>
      <ThemeProvider initialTheme={theme}>
        <InnerApp />
      </ThemeProvider>
    </div>
  );
};

export default App;
