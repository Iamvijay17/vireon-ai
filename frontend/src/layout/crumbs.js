import { isEntityId } from "../lib/entityId";
import { SEGMENT_LABELS } from "./navConfig";

/**
 * The trail for a location. Pure so the rules are testable.
 *
 * A single project is reached at /render?id=... (progress) and /studio?id=...
 * (editor), neither of which has the project in its path, so those two are
 * special-cased into "My Projects / <project> / Progress | Editor".
 *
 * @returns {{ title: string, to?: string }[]}  last item has no `to`
 */
export function buildCrumbs(pathname, search = "", label = null) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const params = new URLSearchParams(search);

  if ((path === "/render" || path === "/studio") && params.get("id")) {
    const id = params.get("id");
    return [
      { title: "My Projects", to: "/projects" },
      { title: label || "Project", ...(path === "/studio" ? { to: `/render?id=${id}` } : {}) },
      { title: path === "/studio" ? "Editor" : "Progress" },
    ].map((crumb, i, all) => (i === all.length - 1 ? { title: crumb.title } : crumb));
  }

  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return [{ title: "Overview" }];

  const items = [];
  let built = "";
  segments.forEach((segment, index) => {
    built += `/${segment}`;
    const isLast = index === segments.length - 1;
    if (isEntityId(segment)) {
      items.push({ title: (isLast && label) || "Details", ...(isLast ? {} : { to: built }) });
      return;
    }
    const mapped = SEGMENT_LABELS[segment];
    if (mapped === null) return; // structural segment ("videos"), not shown
    items.push({ title: mapped || segment, ...(isLast ? {} : { to: built }) });
  });
  return items;
}
