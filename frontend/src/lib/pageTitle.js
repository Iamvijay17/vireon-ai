// Browser tab titles: "<Page> · Vireon AI". Pure so it can be unit tested;
// <PageTitle /> (components/PageTitle.jsx) applies it on every route change.
export const APP_NAME = "Vireon AI";

// Static pages, matched on the exact path.
const V1_TITLES = {
  "/": "Dashboard",
  "/wizard": "Create Video",
  "/render": "Render Queue",
  "/studio": "Studio",
  "/audio": "Audio Studio",
  "/images": "Image Studio",
  "/projects": "Projects",
  "/jobs": "Jobs",
  "/workflow": "Workflow",
  "/assets": "Assets",
  "/analytics": "Analytics",
  "/logs": "Live Logs",
  "/settings": "Settings",
  "/editor/complete": "Completed Videos",
  "/courses": "Courses",
};

const V2_TITLES = {
  "/": "Overview",
  "/new": "New Video",
  "/studio": "Studio",
  "/jobs": "Jobs",
  "/courses": "Courses",
  "/audio": "Audio",
  "/assets": "Assets",
  "/analytics": "Analytics",
  "/logs": "Logs",
  "/settings": "Settings",
};

const norm = (p) => (p.length > 1 ? p.replace(/\/+$/, "") : p);

/**
 * @param {string} pathname  current location.pathname
 * @param {string|null} label  record name a detail page registered through
 *   useSetBreadcrumbLabel (course/video title), if any
 * @returns {string} the full document title
 */
export function documentTitle(pathname, label = null) {
  let path = norm(pathname || "/");
  let titles = V1_TITLES;
  if (path === "/v2" || path.startsWith("/v2/")) {
    path = norm(path.slice(3) || "/");
    titles = V2_TITLES;
  }

  let page = titles[path];

  if (!page) {
    // Detail routes: prefer the record's own name over a generic label.
    if (/^\/courses\/[^/]+\/curriculum$/.test(path)) page = label ? `${label} · Curriculum` : "Curriculum";
    else if (/^\/courses\/[^/]+\/videos\/[^/]+\/studio$/.test(path)) page = label ? `${label} · Studio` : "Video Studio";
    else if (/^\/courses\/[^/]+\/videos\/[^/]+$/.test(path)) page = label || "Course Video";
    else if (/^\/courses\/[^/]+$/.test(path)) page = label || "Course";
    else if (/^\/jobs\/[^/]+$/.test(path)) page = label || "Job Details";
  }

  return page ? `${page} · ${APP_NAME}` : APP_NAME;
}
