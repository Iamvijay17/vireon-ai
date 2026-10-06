import { loadSettings } from "../../shared/settingsStorage";

export const VIDEO_TYPES = [
  { value: "educational", label: "Educational" },
  { value: "marketing", label: "Marketing" },
  { value: "story", label: "Story" },
  { value: "youtube_shorts", label: "YouTube Shorts" },
  { value: "podcast", label: "Podcast" },
  { value: "motivational", label: "Motivational" },
  { value: "business", label: "Business" },
];

export const RESOLUTIONS = [
  { value: "1920x1080", label: "1080p (1920x1080)" },
  { value: "1080x1920", label: "1080p Vertical (1080x1920)" },
  { value: "1080x1350", label: "Instagram 4:5 (1080x1350)" },
  { value: "1280x720", label: "720p (1280x720)" },
  { value: "720x1280", label: "720p Vertical (720x1280)" },
  { value: "3840x2160", label: "4K (3840x2160)" },
  { value: "2160x3840", label: "4K Vertical (2160x3840)" },
];

// Mirrors the backend's QUALITY_PRESETS enum (backend/src/constants/index.js)
// - resolved to an actual encode CRF at render time (config.remotion.qualityCrf).
export const QUALITY_PRESETS = [
  { value: "draft", label: "Draft (fast, lower quality)" },
  { value: "standard", label: "Standard" },
  { value: "hd", label: "HD (best quality, slower render)" },
];

// Mirrors the backend's CAPTION_STYLES enum (backend/src/constants/index.js) -
// keys into backend/remotion/src/captions/captionAnimations.js's registry.
export const CAPTION_STYLES = [
  { value: "fadeInUp", label: "Fade Up" },
  { value: "popScale", label: "Pop" },
  { value: "slideLeft", label: "Slide Left" },
  { value: "slideRight", label: "Slide Right" },
  { value: "bounce", label: "Bounce" },
  { value: "typewriter", label: "Typewriter" },
  { value: "glowActive", label: "Glow" },
  { value: "zoom", label: "Zoom" },
  { value: "blurToSharp", label: "Blur to Sharp" },
];

// YouTube Shorts must be exactly 9:16 - backend rejects anything else for
// this type (see createVideoSchema's superRefine), so this can't just be
// "any portrait resolution" now that 4:5 (also taller than wide) is an
// option too.
export const VERTICAL_RESOLUTIONS = RESOLUTIONS.filter((r) => {
  const [width, height] = r.value.split("x").map(Number);
  return height > width && height / width === 16 / 9;
});

// Shown while the real voice catalog is loading (or if it fails to load).
export const FALLBACK_VOICES = [
  { value: "female-1", label: "Female Voice 1" },
  { value: "male-1", label: "Male Voice 1" },
];

export const LANGUAGES = [{ value: "english", label: "English" }];

// Curated host/guest voice pairs, picked for clear contrast (gender, tone,
// or accent) so the two speakers are always easy to tell apart - a plain
// "pick any two voices" UI lets people land on two similar-sounding voices,
// which is what prompted this. Each pair is filtered against the loaded
// voice catalog before being shown, since these reference specific clone
// files that may not exist in every backend/voices/ directory.
export const PODCAST_VOICE_PAIRS = [
  {
    label: "Radio Host & Conversational",
    hostVoice: "clone:matt-dramatic-radio-podcast-host.mp3",
    guestVoice: "clone:eliza-conversational-podcast-host.mp3",
    hostName: "Matt",
    guestName: "Eliza",
  },
  {
    label: "Deep & Energetic",
    hostVoice: "clone:morgan-deep-powerful-and-confident.mp3",
    guestVoice: "clone:hope-vibrant-warm-and-innocent.mp3",
    hostName: "Morgan",
    guestName: "Hope",
  },
  {
    label: "Warm & Professional",
    hostVoice: "clone:chris-charismatic-warm-confident.mp3",
    guestVoice: "clone:victoria-warm-trustworthy-and-relatable.mp3",
    hostName: "Chris",
    guestName: "Victoria",
  },
  {
    label: "British Duo",
    hostVoice: "clone:nathaniel-engaging-british-and-calm.mp3",
    guestVoice: "clone:tamsin-engaging-british-storyteller-and-narrator.mp3",
    hostName: "Nathaniel",
    guestName: "Tamsin",
  },
  {
    label: "Storyteller & Mystery",
    hostVoice: "clone:william-deep-engaging-storyteller.mp3",
    guestVoice: "clone:valory-mysterious-calm-and-natural.mp3",
    hostName: "William",
    guestName: "Valory",
  },
];

// Best-effort first name from a voice's catalog label - custom presets are
// already a bare first name (e.g. "Aiden"), clone voices are titleized from
// a "name-descriptive-words.ext" filename (e.g. "Matt Dramatic Radio
// Podcast Host") so the first word is the name. Used to pre-fill the
// Host/Guest name fields when a voice is picked without a Quick Pair.
export const deriveNameFromVoiceLabel = (label) => (label || "").trim().split(/\s+/)[0] || "";

// Sample names shown in the Host/Guest Name dropdown - the Quick Pair names
// plus a few common extras, so there's always a reasonable starting list
// even before a voice is picked. Users can still type their own via "Add
// new name" in the same dropdown.
export const SUGGESTED_NAMES = Array.from(
  new Set([
    ...PODCAST_VOICE_PAIRS.flatMap((p) => [p.hostName, p.guestName]),
    "Alex",
    "Jordan",
    "Sam",
    "Taylor",
    "Riley",
    "Jamie",
  ])
);

export const DURATIONS = [
  { value: 1, label: "1 minute" },
  { value: 2, label: "2 minutes" },
  { value: 3, label: "3 minutes" },
  { value: 4, label: "4 minutes" },
  { value: 5, label: "5 minutes" },
  { value: 8, label: "8 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 20, label: "20 minutes" },
  { value: 25, label: "25 minutes" },
  { value: 30, label: "30 minutes" },
];

// YouTube Shorts have their own duration scale (YouTube caps Shorts at 3
// minutes) - backend rejects anything else for this type.
export const SHORTS_DURATIONS = [
  { value: 1, label: "1 minute" },
  { value: 2, label: "2 minutes" },
  { value: 3, label: "3 minutes" },
];

export const DEFAULT_VALUES = {
  topic: "",
  type: undefined,
  duration: 5,
  language: "english",
  voice: "female-1",
  hostVoice: "",
  guestVoice: "",
  hostName: "",
  guestName: "",
  resolution: "1920x1080",
  quality: "standard",
  captionAnimation: "fadeInUp",
  fastGeneration: false,
  fastAudio: false,
};

export const isVerticalResolution = (value) => VERTICAL_RESOLUTIONS.some((r) => r.value === value);

// Applies the user's saved preferences (Settings page) on top of the base
// defaults above - e.g. leaving `type` unselected still forces a choice.
export const buildInitialValues = () => {
  const prefs = loadSettings();
  const type = VIDEO_TYPES.some((t) => t.value === prefs.defaultVideoType) ? prefs.defaultVideoType : DEFAULT_VALUES.type;
  const resolution = prefs.defaultResolution || DEFAULT_VALUES.resolution;
  const isShorts = type === "youtube_shorts";
  return {
    ...DEFAULT_VALUES,
    type,
    language: LANGUAGES.some((l) => l.value === prefs.defaultLanguage) ? prefs.defaultLanguage : DEFAULT_VALUES.language,
    voice: prefs.defaultVoice || DEFAULT_VALUES.voice,
    fastAudio: prefs.fastAudioGeneration ?? DEFAULT_VALUES.fastAudio,
    // A saved default resolution/duration might not be valid for Shorts
    // (e.g. a landscape default resolution) - fall back to a Shorts-valid
    // default rather than starting the wizard in an invalid state.
    duration: isShorts ? SHORTS_DURATIONS[0].value : DEFAULT_VALUES.duration,
    resolution: isShorts && !isVerticalResolution(resolution) ? VERTICAL_RESOLUTIONS[0].value : resolution,
    quality: QUALITY_PRESETS.some((q) => q.value === prefs.defaultQuality) ? prefs.defaultQuality : DEFAULT_VALUES.quality,
    captionAnimation: CAPTION_STYLES.some((c) => c.value === prefs.defaultCaptionStyle) ? prefs.defaultCaptionStyle : DEFAULT_VALUES.captionAnimation,
  };
};
