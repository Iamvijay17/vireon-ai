import { LayoutTemplate, Palette, Settings, Image as ImageIcon, Languages } from "lucide-react";

export const SCENE_TYPE_OPTIONS = [
  { value: "title", label: "Title" },
  { value: "content", label: "Content" },
  { value: "contentwithimage", label: "Content + Image" },
  { value: "image", label: "Image" },
  { value: "podcast", label: "Podcast" },
];

// The 3 "content" scene-type variants all use `elements.items: [{ heading?, text? }]`
// - keep in sync with STANDARDIZED_ITEMS_TEMPLATE_IDS in backend/src/controllers/sceneController.js.
export const ITEMS_EDITABLE_TEMPLATE_IDS = ["001-content", "002-content", "003-content", "004-content", "005-content", "006-content", "007-content", "008-content", "009-content", "010-content", "011-content", "012-content", "013-content", "014-content", "015-content"];

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
  { value: "zoom", label: "Zoom" },
  { value: "dissolve", label: "Dissolve" },
];

export const CAMERA_OPTIONS = [
  { value: "static", label: "Static" },
  { value: "zoom-in", label: "Zoom In" },
  { value: "zoom-out", label: "Zoom Out" },
  { value: "slide", label: "Slide" },
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
