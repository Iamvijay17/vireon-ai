import { Clock, FileText, Pencil, AudioLines, Zap, Video, CloudUpload, CheckCircle2 } from "lucide-react";

export const PIPELINE_STEPS = [
  { title: "Queued", status: "QUEUED", icon: Clock },
  { title: "Script", status: "SCRIPT_GENERATION", icon: FileText },
  { title: "Approval", status: "AWAITING_APPROVAL", icon: Pencil },
  { title: "Audio", status: "GENERATING_AUDIO", icon: AudioLines },
  { title: "Images", status: "GENERATING_IMAGES", icon: FileText },
  { title: "Assets", status: "PREPARING_ASSETS", icon: Zap },
  { title: "Render", status: "RENDERING", icon: Video },
  { title: "Upload", status: "UPLOADING", icon: CloudUpload },
  { title: "Complete", status: "COMPLETED", icon: CheckCircle2 },
];

export const STEP_ORDER = PIPELINE_STEPS.map((s) => s.status);

// A job actively being worked on by the worker can't have its details
// edited or a stage re-triggered underneath it - matches the backend's
// BUSY_STATUSES gate in VideoService.update.
export const BUSY_STATUSES = [
  "SCRIPT_GENERATION",
  "GENERATING_AUDIO",
  "GENERATING_IMAGES",
  "PREPARING_ASSETS",
  "RENDERING",
  "UPLOADING",
];

export const DURATIONS = [
  { value: 5, label: "5 minutes" },
  { value: 8, label: "8 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 20, label: "20 minutes" },
  { value: 25, label: "25 minutes" },
  { value: 30, label: "30 minutes" },
];

export const SHORTS_DURATIONS = [
  { value: 1, label: "1 minute" },
  { value: 2, label: "2 minutes" },
  { value: 3, label: "3 minutes" },
];

export const RESOLUTIONS = [
  { value: "1920x1080", label: "1080p (1920x1080)" },
  { value: "1080x1920", label: "1080p Vertical (1080x1920)" },
  { value: "1280x720", label: "720p (1280x720)" },
  { value: "720x1280", label: "720p Vertical (720x1280)" },
  { value: "3840x2160", label: "4K (3840x2160)" },
  { value: "2160x3840", label: "4K Vertical (2160x3840)" },
];

export const VERTICAL_RESOLUTIONS = RESOLUTIONS.filter((r) => {
  const [width, height] = r.value.split("x").map(Number);
  return height > width;
});

export const LANGUAGES = [{ value: "english", label: "English" }];

export const FALLBACK_VOICES = [
  { value: "female-1", label: "Female Voice 1" },
  { value: "male-1", label: "Male Voice 1" },
];
