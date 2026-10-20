import { loadSettings } from "../../shared/settingsStorage";

export const VIDEO_TYPES = [
  { value: "educational", label: "Educational", hint: "Explains a topic step by step" },
  { value: "marketing", label: "Marketing", hint: "Promotes a product or idea" },
  { value: "story", label: "Story", hint: "Narrative with a beginning and an end" },
  { value: "youtube_shorts", label: "YouTube Shorts", hint: "Vertical, 1-3 minutes" },
  { value: "podcast", label: "Podcast", hint: "Two speakers in conversation" },
  { value: "motivational", label: "Motivational", hint: "Inspiring, high-energy delivery" },
  { value: "business", label: "Business", hint: "Professional, presentation style" },
];

export const RESOLUTIONS = [
  { value: "1920x1080", label: "1080p (1920x1080)" },
  { value: "1080x1920", label: "1080p Vertical (1080x1920)" },
  { value: "1080x1080", label: "Square (1080x1080)" },
  { value: "1080x1350", label: "Instagram 4:5 (1080x1350)" },
  { value: "1280x720", label: "720p (1280x720)" },
  { value: "720x1280", label: "720p Vertical (720x1280)" },
  { value: "3840x2160", label: "4K (3840x2160)" },
  { value: "2160x3840", label: "4K Vertical (2160x3840)" },
];

// The aspect ratio is not a separate setting: it follows from the resolution
// (the backend derives it the same way). The Create Video page offers the
// ratio first and the sizes inside it, so this groups RESOLUTIONS by ratio.
export const ASPECT_RATIOS = [
  { value: "16:9", label: "Landscape", hint: "YouTube, web, presentations", box: "h-[18px] w-8" },
  { value: "9:16", label: "Vertical", hint: "Shorts, Reels, TikTok", box: "h-8 w-[18px]" },
  { value: "1:1", label: "Square", hint: "Feed posts", box: "size-6" },
  { value: "4:5", label: "Portrait", hint: "Instagram feed", box: "h-7 w-[22px]" },
];

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/** "1080x1350" -> "4:5". Unknown shapes fall back to landscape/vertical like the server does. */
export const aspectOf = (resolution) => {
  const [w, h] = String(resolution || "").split("x").map(Number);
  if (!w || !h) return "16:9";
  const d = gcd(w, h);
  const reduced = `${w / d}:${h / d}`;
  if (ASPECT_RATIOS.some((a) => a.value === reduced)) return reduced;
  if (w === h) return "1:1";
  return w > h ? "16:9" : "9:16";
};

export const resolutionsForAspect = (aspect) => RESOLUTIONS.filter((r) => aspectOf(r.value) === aspect);

// Curated Google Font pairs (title + body). Mirrors the backend's
// FONT_PAIRINGS enum / backend/remotion/src/fonts.js.
export const FONT_PAIRINGS = [
  { value: "default", label: "System default", sample: "Helvetica Neue" },
  { value: "modern-sans", label: "Modern sans", sample: "Montserrat + Inter" },
  { value: "elegant-serif", label: "Elegant serif", sample: "Playfair Display + Lora" },
  { value: "friendly-rounded", label: "Friendly rounded", sample: "Poppins + Roboto" },
  { value: "clean-mono", label: "Clean technical", sample: "Space Grotesk + IBM Plex Sans" },
  { value: "bold-impact", label: "Bold impact", sample: "Archivo Black + Work Sans" },
  { value: "editorial", label: "Editorial", sample: "Merriweather + Source Sans 3" },
];

// Mirrors the backend's QUALITY_PRESETS enum (backend/src/constants/index.js)
// - resolved to an actual encode CRF at render time (config.remotion.qualityCrf).
export const QUALITY_PRESETS = [
  { value: "draft", label: "Draft", hint: "Fastest render, lower quality - good for checking a script" },
  { value: "standard", label: "Standard", hint: "Balanced quality and render time" },
  { value: "hd", label: "HD", hint: "Cleanest output, slowest render" },
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
  fontPairing: "default",
  fastGeneration: false,
  autoApprove: false,
  fastAudio: false,
  // "" = Auto: the server picks a narration style from the video type.
  voiceStyle: "",
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
    fastGeneration: prefs.defaultFastGeneration ?? DEFAULT_VALUES.fastGeneration,
    autoApprove: Boolean(prefs.defaultFastGeneration && prefs.defaultAutoApprove),
    // A saved default resolution/duration might not be valid for Shorts
    // (e.g. a landscape default resolution) - fall back to a Shorts-valid
    // default rather than starting the wizard in an invalid state.
    duration: isShorts ? SHORTS_DURATIONS[0].value : DEFAULT_VALUES.duration,
    resolution: isShorts && !isVerticalResolution(resolution) ? VERTICAL_RESOLUTIONS[0].value : resolution,
    quality: QUALITY_PRESETS.some((q) => q.value === prefs.defaultQuality) ? prefs.defaultQuality : DEFAULT_VALUES.quality,
    captionAnimation: CAPTION_STYLES.some((c) => c.value === prefs.defaultCaptionStyle) ? prefs.defaultCaptionStyle : DEFAULT_VALUES.captionAnimation,
    fontPairing: FONT_PAIRINGS.some((f) => f.value === prefs.defaultFontPairing) ? prefs.defaultFontPairing : DEFAULT_VALUES.fontPairing,
  };
};
