import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";

// Registered once, imported (for its side effect) by every Chart.js-backed
// chart component in this app - avoids each component re-registering the
// same elements.
ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

/**
 * Chart.js draws to a raw canvas, so it can't resolve CSS custom properties
 * the way DOM/SVG styling can - colors have to be resolved to real values
 * up front. `cssVar` reads the live computed value (theme-aware, since it's
 * read at render time); `resolveColor` accepts either a literal color or a
 * "var(--x)" string as used elsewhere in this app's chart props.
 */
export const cssVar = (name, fallback = "#888888") => {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

export const resolveColor = (value, fallback) => {
  if (typeof value === "string" && value.startsWith("var(")) {
    return cssVar(value.slice(4, -1).trim(), fallback);
  }
  return value ?? fallback;
};

// Adds an alpha channel to a resolved hex color (#rrggbb) for fills; falls
// back to returning the color unchanged if it isn't a plain hex string
// (e.g. already rgba(), or a named color).
export const withAlpha = (hex, alpha) => {
  if (typeof hex !== "string" || !hex.startsWith("#") || hex.length !== 7) return hex;
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
};

export default ChartJS;
