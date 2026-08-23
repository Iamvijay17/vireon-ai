import { FileText, AudioLines, Video, CheckCircle2, Clock, Zap, Ban } from "lucide-react";

export const VIDEO_STATUS = {
  Draft: { variant: "neutral", icon: FileText },
  "Generating Script": { variant: "accent", icon: FileText },
  "Script Generated": { variant: "info", icon: FileText },
  "Waiting for Approval": { variant: "warning", icon: FileText },
  Approved: { variant: "accent", icon: CheckCircle2 },
  "Generating Audio": { variant: "accent", icon: AudioLines },
  "Audio Generated": { variant: "info", icon: AudioLines },
  "Generating Scenes": { variant: "accent", icon: FileText },
  "Scenes Generated": { variant: "info", icon: FileText },
  "Generating Images": { variant: "accent", icon: FileText },
  "Images Generated": { variant: "warning", icon: FileText },
  "Rendering Video": { variant: "accent", icon: Video },
  Uploading: { variant: "accent", icon: Video },
  Completed: { variant: "success", icon: CheckCircle2 },
  Failed: { variant: "danger", icon: Clock },
  Cancelled: { variant: "neutral", icon: Ban },
};

// Independent per-stage status (Script/Audio/Video), shown as a compact icon
// chip in the table's Pipeline column instead of a separate column each.
export const STAGE_DOT_CLASSES = {
  Pending: "border-border text-text-tertiary",
  Queued: "border-accent/40 bg-accent/10 text-accent",
  Processing: "border-accent bg-accent/10 text-accent animate-pulse",
  Completed: "border-success-500/40 bg-success-500/10 text-success-600",
  Failed: "border-danger-500/40 bg-danger-500/10 text-danger-500",
  Cancelled: "border-border text-text-tertiary",
};

export const DURATION_OPTIONS = [
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 15, label: "15 minutes" },
];

// Shown while the real voice catalog is loading (or if it fails to load).
export const FALLBACK_VOICE_OPTIONS = [
  { value: "female-1", label: "Female Voice 1" },
  { value: "male-1", label: "Male Voice 1" },
];

export const STYLE_OPTIONS = [
  { value: "educational", label: "Educational" },
  { value: "story", label: "Story" },
  { value: "motivational", label: "Motivational" },
  { value: "business", label: "Business" },
];

export const RESOLUTION_OPTIONS = [
  { value: "1920x1080", label: "1080p" },
  { value: "3840x2160", label: "4K (slower to render)" },
];

export const AVATAR_POSITION_OPTIONS = [
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
];

export const EMPTY_FORM = {
  title: "",
  topic: "",
  duration: 5,
  voice: "female-1",
  style: "educational",
  resolution: "1920x1080",
  additionalInstructions: "",
  fastAudio: false,
  // Optional talking-head overlay - no photo upload, the backend picks a
  // bundled default portrait matching the selected voice's gender.
  avatarEnabled: false,
  avatarPosition: undefined,
};
export const EMPTY_PROMO = { title: "", topic: "", description: "" };

export const CATEGORY_OPTIONS = [
  { value: "Web Development", label: "Web Development" },
  { value: "Mobile Development", label: "Mobile Development" },
  { value: "Data Science", label: "Data Science" },
  { value: "Machine Learning", label: "Machine Learning" },
  { value: "DevOps", label: "DevOps" },
  { value: "Design", label: "Design" },
  { value: "Business", label: "Business" },
  { value: "Marketing", label: "Marketing" },
  { value: "Other", label: "Other" },
];

export const DIFFICULTY_OPTIONS = [
  { value: "Beginner", label: "Beginner" },
  { value: "Intermediate", label: "Intermediate" },
  { value: "Advanced", label: "Advanced" },
];

export const LANGUAGE_OPTIONS = [
  { value: "english", label: "English" },
  { value: "hindi", label: "Hindi" },
  { value: "spanish", label: "Spanish" },
  { value: "french", label: "French" },
  { value: "german", label: "German" },
  { value: "japanese", label: "Japanese" },
  { value: "korean", label: "Korean" },
];

export const COURSE_EDIT_EMPTY_FORM = { title: "", description: "", category: "Other", difficulty: "Beginner", language: "english" };

export const BULK_ACTIONS = [
  { action: "generate-script", label: "Generate Scripts", icon: FileText },
  { action: "generate-audio", label: "Generate Audio", icon: AudioLines },
  { action: "render", label: "Render Videos", icon: Video },
  { action: "generate-full", label: "Generate Everything", icon: Zap },
];

// A video mid-pipeline can't be re-queued into another stage until its
// current job finishes (or is stopped) - matches the backend's
// concurrency:1 course-video queue and CourseVideoService's per-stage
// PROCESSING/QUEUED handling.
export const BUSY_STATUSES = [
  "Generating Script",
  "Generating Audio",
  "Generating Scenes",
  "Generating Images",
  "Rendering Video",
  "Uploading",
];
