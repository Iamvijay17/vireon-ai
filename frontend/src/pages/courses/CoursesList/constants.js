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
