export const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "video", label: "Video jobs" },
  { value: "course", label: "Courses" },
  { value: "audio", label: "Audio Studio" },
];

// Grouped by the shared job phase (lib/jobStatus.jobPhase), so "In progress"
// means the same here as on Projects: running, queued, or paused for you.
export const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

/** Does a job fall under this status filter? */
export const matchesStatusFilter = (job, filter, phaseOf) => {
  if (filter === "all") return true;
  const phase = phaseOf(job.status);
  return filter === "active" ? ["running", "queued", "waiting"].includes(phase) : phase === filter;
};

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
