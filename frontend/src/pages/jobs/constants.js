export const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "video", label: "Video jobs" },
  { value: "course", label: "Courses" },
  { value: "audio", label: "Audio Studio" },
];

export const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "processing", label: "Processing" },
  { value: "success", label: "Completed" },
  { value: "error", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

export const TYPE_BADGE = {
  video: { variant: "info", label: "Video" },
  course: { variant: "warning", label: "Course" },
  audio: { variant: "accent", label: "Audio" },
};

export const ROUTE_FOR = {
  video: (id) => `/render?id=${id}`,
  course: (id) => `/courses/${id}`,
  audio: () => `/audio`,
};

// Ids are only unique within a type, so selection and row keys combine both.
export const rowKeyOf = (job) => `${job.type}:${job.id}`;
