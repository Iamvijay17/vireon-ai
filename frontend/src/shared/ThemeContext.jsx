import React, { createContext, useState, useMemo, useCallback } from "react";
import { getColors } from "./theme";

export const ThemeContext = createContext({
  theme: "light",
  toggleTheme: () => {},
  colors: getColors("light"),
});

export const ThemeProvider = ({ children, initialTheme }) => {
  const [theme, setTheme] = useState(() => initialTheme || "light");

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

export default ThemeContext;