import { LayoutTemplate, Palette, Settings, Image as ImageIcon, Languages } from "lucide-react";

// "contentwithimage"/"image"/"podcast" are deliberately omitted here: HyperFrames'
// TEMPLATE_REGISTRY (backend/src/services/video/HyperFramesService.js) has no
// template for any of them yet, so resolveSceneTemplate silently falls back to
// the title card - picking one from this dropdown looked like a choice but
// always rendered the same title template. Existing scenes already carrying
// one of these types (e.g. podcast-generated scripts, see ScriptParserService's
// GENERATIVE_SUPPORTED_SCENE_TYPES) are unaffected - the Select just shows a
// placeholder for them rather than corrupting the stored value. Add them back
// once real templates exist for each.
export const SCENE_TYPE_OPTIONS = [
  { value: "title", label: "Title" },
  { value: "content", label: "Content" },
];

// The 3 "content" scene-type variants all use `elements.items: [{ heading?, text? }]`
// - keep in sync with STANDARDIZED_ITEMS_TEMPLATE_IDS in backend/src/controllers/sceneController.js.
export const ITEMS_EDITABLE_TEMPLATE_IDS = ["001-content", "002-content", "003-content", "004-content", "005-content", "006-content", "007-content", "008-content", "009-content", "010-content", "011-content", "012-content", "013-content", "014-content", "015-content", "016-content", "019-content", "020-content"];

export const FONT_WEIGHT_OPTIONS = [
  { value: 300, label: "Light" },
  { value: 400, label: "Regular" },
  { value: 700, label: "Bold" },
];

export const FONT_FAMILY_OPTIONS = [
  { value: "'Helvetica Neue', Helvetica, Arial, sans-serif", label: "Helvetica" },
  { value: "Georgia, 'Times New Roman', serif", label: "Georgia (serif)" },
  { value: "'Courier New', Courier, monospace", label: "Courier (mono)" },
  { value: "Verdana, Geneva, sans-serif", label: "Verdana" },
  { value: "'Trebuchet MS', sans-serif", label: "Trebuchet" },
];

export const TRANSITION_OPTIONS = [
  { value: "fade", label: "Fade" },
  { value: "slide", label: "Slide" },
  { value: "slideUp", label: "Slide Up" },
  { value: "wipe", label: "Wipe" },
  { value: "irisWipe", label: "Iris Wipe" },
  { value: "zoom", label: "Zoom" },
  { value: "dissolve", label: "Dissolve" },
  { value: "none", label: "Cut" },
];

export const CAMERA_OPTIONS = [
  { value: "static", label: "Static" },
  { value: "zoom-in", label: "Zoom In" },
  { value: "zoom-out", label: "Zoom Out" },
  { value: "slide", label: "Slide" },
];

// Shown only if the voice catalog fails to load - mirrors render/constants.js.
export const FALLBACK_VOICES = [
  { value: "female-1", label: "Female Voice 1" },
  { value: "male-1", label: "Male Voice 1" },
];

// Groups the Inspector's fields under tabs instead of one long stacked
// scroll - each `key` maps to a section (or several) rendered conditionally
// in InspectorPanel, so switching tabs swaps content rather than scrolling to it.
export const INSPECTOR_TABS = [
  { key: "content", label: "Content", icon: <LayoutTemplate className="size-3.5" /> },
  { key: "style", label: "Style", icon: <Palette className="size-3.5" /> },
  { key: "animation", label: "Animation", icon: <Settings className="size-3.5" /> },
  { key: "image", label: "Image", icon: <ImageIcon className="size-3.5" /> },
  { key: "audio", label: "Audio", icon: <Languages className="size-3.5" /> },
];
