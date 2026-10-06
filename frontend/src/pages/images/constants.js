// Style keys mirror backend/src/services/image/styles.js (the backend owns the
// prompt phrases; the page only needs the key and a label).
export const STYLES = [
  { value: "none", label: "No style" },
  { value: "photo", label: "Photo" },
  { value: "cinematic", label: "Cinematic" },
  { value: "illustration", label: "Illustration" },
  { value: "render3d", label: "3D render" },
  { value: "flat", label: "Flat vector" },
  { value: "watercolor", label: "Watercolor" },
  { value: "anime", label: "Anime" },
];

export const STYLE_LABEL = Object.fromEntries(STYLES.map((s) => [s.value, s.label]));

// 4:5 is accepted by the API but maps to the portrait size, so only the
// shapes that really produce a distinct picture are offered.
export const ASPECTS = [
  { value: "16:9", label: "Landscape", box: "h-2.5 w-4" },
  { value: "9:16", label: "Portrait", box: "h-4 w-2.5" },
  { value: "1:1", label: "Square", box: "h-3 w-3" },
];

// Size of the saved picture. The model samples at 1K either way (a 6GB card can't
// sample 2K/4K); 2K/4K enlarge it afterwards to a 2048 / 3840 px long edge.
export const RESOLUTIONS = [
  { value: "1k", label: "1K", title: "As generated (about 1024 px long edge)" },
  { value: "2k", label: "2K", title: "Enlarged to a 2048 px long edge" },
  { value: "4k", label: "4K", title: "Enlarged to a 3840 px long edge (3840x2160 for landscape); large file" },
];
export const RESOLUTION_LABEL = Object.fromEntries(RESOLUTIONS.map((r) => [r.value, r.label]));

export const COUNTS = [1, 2, 3, 4].map((n) => ({ value: n, label: `${n}` }));

export const MAX_SEED = 2 ** 48 - 1;

// Exact text in the picture is typed on one line with "|" between lines
// ("FUTURE OF AI | BUILDING TOMORROW") and stored/sent one line per row.
export const MAX_TEXT_LINES = 3;
export const pipesToLines = (input) =>
  String(input || "")
    .split("|")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
export const linesToPipes = (stored) =>
  String(stored || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .join(" | ");

export const EXAMPLES = [
  "A misty mountain valley at sunrise, golden light through the clouds",
  "A cozy coffee shop interior on a rainy afternoon, warm lamps, steamed-up windows",
  "A futuristic city skyline at dusk with glowing neon reflections on wet streets",
  "A pair of white sneakers on a pastel background, studio product shot",
];

const STORAGE_KEY = "vireon-image-studio";
const DEFAULTS = { aspectRatio: "16:9", resolution: "1k", quality: "standard", style: "none", count: 1 };

const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

// Remembers the last-used options (never the prompt or seed) between visits.
export const loadStudioSettings = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      aspectRatio: oneOf(saved.aspectRatio, ASPECTS.map((a) => a.value), DEFAULTS.aspectRatio),
      resolution: oneOf(saved.resolution, RESOLUTIONS.map((r) => r.value), DEFAULTS.resolution),
      quality: oneOf(saved.quality, ["fast", "standard", "high"], DEFAULTS.quality),
      style: oneOf(saved.style, STYLES.map((s) => s.value), DEFAULTS.style),
      count: oneOf(saved.count, COUNTS.map((c) => c.value), DEFAULTS.count),
    };
  } catch {
    return DEFAULTS;
  }
};

export const saveStudioSettings = (settings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked or full: the options just won't persist.
  }
};
