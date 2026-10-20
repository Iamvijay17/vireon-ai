import {
  LayoutDashboard,
  PlusCircle,
  FolderKanban,
  BookOpen,
  LayoutTemplate,
  Images,
  CheckCircle2,
  ListChecks,
  Rocket,
  Workflow,
  Cpu,
  ShieldCheck,
  AudioLines,
  ImagePlus,
  Send,
  Megaphone,
  BarChart3,
  Terminal,
  Settings,
} from "lucide-react";

/**
 * Every top-level destination, once. The sidebar, the breadcrumb trail, the
 * browser-tab title and the command palette all read this, so a renamed or
 * added page cannot drift out of one of them.
 *
 * `route`   where the entry navigates.
 * `exact`   active only on that exact path (the Overview page is "/").
 * `owns`    other paths that belong to this destination, so e.g. the project
 *           workspace (/studio) keeps "My Projects" highlighted.
 * `keywords` extra words the command palette matches on.
 */
export const NAV_SECTIONS = [
  {
    key: "workspace",
    label: "Workspace",
    items: [
      { key: "overview", label: "Overview", icon: LayoutDashboard, route: "/", exact: true, keywords: "dashboard home" },
      { key: "create", label: "Create Video", icon: PlusCircle, route: "/wizard", keywords: "new wizard generate" },
      { key: "projects", label: "My Projects", icon: FolderKanban, route: "/projects", owns: ["/studio"], keywords: "videos library" },
      { key: "courses", label: "Courses", icon: BookOpen, route: "/courses", keywords: "lessons curriculum" },
      { key: "templates", label: "Templates", icon: LayoutTemplate, route: "/templates", keywords: "scenes layouts" },
      { key: "media", label: "Media Library", icon: Images, route: "/media", owns: ["/assets"], keywords: "assets files images audio" },
      { key: "complete", label: "Completed Videos", icon: CheckCircle2, route: "/editor/complete", keywords: "finished downloads" },
    ],
  },
  {
    key: "production",
    label: "Production",
    items: [
      { key: "jobs", label: "Generation Jobs", icon: ListChecks, route: "/jobs", keywords: "queue retry cancel" },
      { key: "render", label: "Render Queue", icon: Rocket, route: "/render", keywords: "progress rendering" },
      { key: "workflow", label: "Workflow", icon: Workflow, route: "/workflow", keywords: "pipeline graph" },
      { key: "resources", label: "GPU & Resources", icon: Cpu, route: "/resources", keywords: "vram gpu cpu ram monitor" },
      { key: "quality", label: "Quality Control", icon: ShieldCheck, route: "/quality", keywords: "qc checks report" },
      { key: "voice", label: "Voice Studio", icon: AudioLines, route: "/audio", keywords: "tts narration audio speech" },
      { key: "images", label: "Image Studio", icon: ImagePlus, route: "/images", keywords: "comfyui picture generate" },
    ],
  },
  {
    key: "distribution",
    label: "Distribution",
    items: [
      { key: "publishing", label: "Publishing", icon: Send, route: "/publishing", keywords: "youtube udemy upload" },
      { key: "promotion", label: "Promotion Studio", icon: Megaphone, route: "/promotion", keywords: "facebook instagram threads social" },
    ],
  },
  {
    key: "system",
    label: "System",
    items: [
      { key: "analytics", label: "Analytics", icon: BarChart3, route: "/analytics", keywords: "metrics control center" },
      { key: "logs", label: "Live Logs", icon: Terminal, route: "/logs", keywords: "console debug" },
      { key: "settings", label: "Settings", icon: Settings, route: "/settings", keywords: "preferences diagnostics providers storage" },
    ],
  },
];

export const NAV_ITEMS = NAV_SECTIONS.flatMap((section) => section.items);

const trimSlash = (p) => (p.length > 1 ? p.replace(/\/+$/, "") : p);

/**
 * Is this nav entry the current page?
 *
 * /render is two things: the render queue (no ?id) and one project's progress
 * view (?id=...). The second belongs to My Projects, so only the first
 * highlights "Render Queue".
 */
export function isNavItemActive(item, pathname, search = "") {
  const path = trimSlash(pathname || "/");
  if (item.key === "render") {
    return path === "/render" && !new URLSearchParams(search).get("id");
  }
  if (item.key === "projects" && path === "/render") {
    return Boolean(new URLSearchParams(search).get("id"));
  }
  if (item.exact) return path === item.route;
  const roots = [item.route, ...(item.owns || [])];
  return roots.some((root) => path === root || path.startsWith(`${root}/`));
}

/** Pages that exist but are not in the sidebar, titled by exact path. */
const EXTRA_TITLES = {
  "/studio": "Studio",
  "/promotion/accounts": "Promotion · Accounts",
  "/promotion/create": "Promotion · Create",
  "/promotion/posts": "Promotion · Posts",
  "/promotion/calendar": "Promotion · Calendar",
  "/promotion/analytics": "Promotion · Analytics",
};

/** path -> page title, for the browser tab. */
export const PAGE_TITLES = {
  ...Object.fromEntries(NAV_ITEMS.map((item) => [item.route, item.label])),
  ...EXTRA_TITLES,
};

/** URL segment -> breadcrumb label. null hides a purely structural segment. */
export const SEGMENT_LABELS = {
  wizard: "Create Video",
  render: "Render Queue",
  studio: "Studio",
  projects: "My Projects",
  workflow: "Workflow",
  analytics: "Analytics",
  publishing: "Publishing",
  promotion: "Promotion Studio",
  accounts: "Accounts",
  create: "Create promotion",
  posts: "Posts",
  calendar: "Calendar",
  settings: "Settings",
  courses: "Courses",
  editor: "Editor",
  complete: "Completed Videos",
  templates: "Templates",
  media: "Media Library",
  resources: "GPU & Resources",
  quality: "Quality Control",
  jobs: "Generation Jobs",
  audio: "Voice Studio",
  images: "Image Studio",
  logs: "Live Logs",
  videos: null,
};
