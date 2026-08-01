import { useState, useMemo, useCallback, useEffect } from "react";
import { getColors } from "./theme";
import { ThemeContext } from "./themeContextValue";

export const ThemeProvider = ({ children, initialTheme }) => {
  const [theme, setTheme] = useState(() => initialTheme || "light");

  // Modals/dropdowns render via createPortal to document.body, outside the
  // themed wrapper div in App.jsx - so the theme class also needs to live on
  // <html> for `.theme-dark *` (see index.css's `dark` custom-variant and
  // the --bg/--surface/... tokens) to reach portaled content too.
  useEffect(() => {
    document.documentElement.classList.remove("theme-light", "theme-dark");
    document.documentElement.classList.add(`theme-${theme}`);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      localStorage.setItem("vireon-theme", next);
      return next;
    });
  }, []);

  const colors = useMemo(() => getColors(theme), [theme]);

  const value = useMemo(
    () => ({
      theme,
      toggleTheme,
      colors,
    }),
    [theme, toggleTheme, colors]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export default ThemeProvider;
