import { BookOpen, Clock, CheckCircle2, PlayCircle } from "lucide-react";

export const STATUS_VARIANT = {
  Draft: "neutral",
  "In Progress": "accent",
  Completed: "success",
  Archived: "warning",
};

export const STATUS_ICON = {
  Draft: BookOpen,
  "In Progress": PlayCircle,
  Completed: CheckCircle2,
  Archived: Clock,
};

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

export const STATUS_OPTIONS = [
  { value: "Draft", label: "Draft" },
  { value: "In Progress", label: "In Progress" },
  { value: "Completed", label: "Completed" },
  { value: "Archived", label: "Archived" },
];

export const EMPTY_FORM = { title: "", description: "", category: "Other", difficulty: "Beginner", language: "english" };

// Deterministic category -> gradient tone, so the same category always reads
// the same color across cards without needing a fixed lookup table.
const CATEGORY_TONES = [
  "bg-gradient-to-br from-accent-500/20 to-accent-500/5 text-accent",
  "bg-gradient-to-br from-info-500/20 to-info-500/5 text-info-600 dark:text-info-500",
  "bg-gradient-to-br from-success-500/20 to-success-500/5 text-success-600 dark:text-success-500",
  "bg-gradient-to-br from-warning-500/20 to-warning-500/5 text-warning-600 dark:text-warning-500",
  "bg-gradient-to-br from-danger-500/20 to-danger-500/5 text-danger-600 dark:text-danger-500",
];
export const toneForCategory = (category = "") => {
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  return CATEGORY_TONES[hash % CATEGORY_TONES.length];
};

export const STAT_TONES = {
  accent: "bg-gradient-to-br from-accent-500/20 to-accent-500/5 text-accent",
  info: "bg-gradient-to-br from-info-500/20 to-info-500/5 text-info-600 dark:text-info-500",
  success: "bg-gradient-to-br from-success-500/20 to-success-500/5 text-success-600 dark:text-success-500",
  neutral: "bg-surface-hover text-text-secondary",
};
