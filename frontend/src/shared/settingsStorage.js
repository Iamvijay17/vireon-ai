const STORAGE_KEY = "vireon-settings";

// Content-generation defaults, pre-filled into the Wizard and Course Video
// creation forms so repeat users don't have to re-pick the same options
// every time. Purely a local UX preference - not synced anywhere.
export const DEFAULT_SETTINGS = {
  defaultVoice: "",
  defaultLanguage: "english",
  defaultVideoType: "educational",
  defaultResolution: "1920x1080",
  defaultAspectRatio: "16:9",
  defaultCourseStyle: "educational",
  defaultCourseDuration: 5,
};

export const loadSettings = () => {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

export const saveSettings = (settings) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};
