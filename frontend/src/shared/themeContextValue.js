import { createContext } from "react";
import { getColors } from "./theme";

export const ThemeContext = createContext({
  theme: "light",
  toggleTheme: () => {},
  colors: getColors("light"),
});
