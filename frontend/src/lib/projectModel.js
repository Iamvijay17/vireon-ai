import { jobPhase } from "./jobStatus";
import { isPortraitResolution } from "../shared/resolution";

/**
 * "Projects" are the two kinds of work the app produces - single video jobs
 * and multi-lesson courses - normalised to one shape so the Projects page and
 * the Overview can list, filter and sort them identically. Pure: no fetching,
 * no React, so every rule below is unit tested.
 */

const TYPE_LABELS = {
  educational: "Educational",
  marketing: "Marketing",
  story: "Story",
  youtube_shorts: "YouTube Shorts",
  podcast: "Podcast",
  motivational: "Motivational",
  business: "Business",
};

export const typeLabel = (type) => TYPE_LABELS[type] || type || "";

export function videoToProject(job) {
  const phase = jobPhase(job.status);
  return {
    key: `video-${job._id}`,
    id: job._id,
    kind: "video",
    title: job.topic || "Untitled video",
    status: job.status,
    phase,
    progress: Number.isFinite(job.progress) ? job.progress : null,
    thumbnail: job.thumbnailUrl || null,
    portrait: isPortraitResolution(job.resolution),
    meta: [typeLabel(job.type), job.resolution].filter(Boolean),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt || job.createdAt,
    route: `/render?id=${job._id}`,
    // The editor only has something to edit once a script exists.
    editRoute: job.script?.scenes?.length ? `/studio?id=${job._id}` : null,
    error: job.error?.message || null,
    raw: job,
  };
}

export function courseToProject(course) {
  const total = course.videoCount || 0;
  const done = course.completedVideoCount || 0;
  return {
    key: `course-${course._id}`,
    id: course._id,
    kind: "course",
    title: course.title || "Untitled course",
    status: course.status,
    phase: jobPhase(course.status),
    progress: total > 0 ? Math.round((done / total) * 100) : null,
    thumbnail: course.thumbnail || null,
    portrait: false,
    meta: [`${done} / ${total} lessons`],
    createdAt: course.createdAt,
    updatedAt: course.updatedAt || course.createdAt,
    route: `/courses/${course._id}`,
    editRoute: null,
    error: null,
    raw: course,
  };
}

/** Status filters group the six phases into the four a person asks about. */
export const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

const matchesStatus = (project, filter) => {
  if (filter === "all") return true;
  if (filter === "active") return ["running", "queued", "waiting"].includes(project.phase);
  return project.phase === filter;
};

export function filterProjects(projects, { search = "", kind = "", status = "all" } = {}) {
  const q = search.trim().toLowerCase();
  return projects.filter(
    (p) => (!kind || p.kind === kind) && matchesStatus(p, status) && (!q || p.title.toLowerCase().includes(q))
  );
}

/** Count per status filter, ignoring the status filter itself (so the pills show what each would yield). */
export function countByStatus(projects, { search = "", kind = "" } = {}) {
  const base = filterProjects(projects, { search, kind, status: "all" });
  return Object.fromEntries(STATUS_FILTERS.map((f) => [f.value, base.filter((p) => matchesStatus(p, f.value)).length]));
}

export const SORTS = [
  { value: "updated", label: "Recently updated" },
  { value: "created", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "title", label: "Title (A-Z)" },
  { value: "status", label: "Status" },
];

// Active work first, then waiting, then finished - the order a person scans in.
const PHASE_RANK = { running: 0, queued: 1, waiting: 2, failed: 3, completed: 4, cancelled: 5 };

const time = (value) => {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
};

export function sortProjects(projects, sort = "updated") {
  const list = [...projects];
  switch (sort) {
    case "created":
      return list.sort((a, b) => time(b.createdAt) - time(a.createdAt));
    case "oldest":
      return list.sort((a, b) => time(a.createdAt) - time(b.createdAt));
    case "title":
      return list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    case "status":
      return list.sort((a, b) => PHASE_RANK[a.phase] - PHASE_RANK[b.phase] || time(b.updatedAt) - time(a.updatedAt));
    case "updated":
    default:
      return list.sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
  }
}
