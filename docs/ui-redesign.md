# UI redesign: design system, pages and known gaps

The interface was rebuilt as one premium dark product (violet used sparingly) on the existing stack: React 19, Vite, Tailwind 4, React Router, TanStack Query, Socket.IO. No backend behaviour, schema, queue or worker was changed; the only backend additions are one read-only endpoint and a search-safety fix (see [Backend changes](#backend-changes)).

## Decisions

| Decision | Why |
|----------|-----|
| **No shadcn/ui install.** The app already had an in-house kit (`src/components/ui`) built the shadcn way: `cn()`, `forwardRef` primitives, variants, CSS-variable tokens mapped to semantic Tailwind colours. Installing shadcn would add Radix, `class-variance-authority`, `tailwind-merge` and an alias config **next to** that kit, i.e. a second component library. The kit was retuned and extended instead. | One component system, no new dependencies. |
| **Dark is the default theme; light still works.** Existing users who saved a light theme keep it. | The brief asks for a dark product; the toggle already existed. |
| **No font package added.** The stack is `Inter, Segoe UI Variable Text, Segoe UI, system-ui`. | Avoids a dependency for a marginal gain; add `@fontsource-variable/inter` if you want identical type on every machine. |
| **Navigation lives in one file**, `src/layout/navConfig.js`. Sidebar, breadcrumbs, tab titles and the command palette all read it. | A renamed page cannot drift out of one of them. |
| **`/assets` redirects to `/media`; `/audio` is now "Voice Studio"; `/jobs` is "Generation Jobs".** Routes other than `/media` are unchanged. | Bookmarks keep working. |
| **A data router** (`createBrowserRouter` with one splat route) replaces `<BrowserRouter>`. | `useBlocker` (leave-without-saving in the editor) needs it. The page routes inside are untouched. |

## Design tokens (`src/index.css`)

- Surfaces: `bg` / `surface` / `surface-hover` / `surface-active` / `surface-raised` (menus, dialogs); borders `border`, `border-light`, `border-strong`.
- Text: `text-primary` / `secondary` / `tertiary`, all at or above 4.5:1 on their surfaces.
- **Accent is split in two** so violet stays readable on dark: `accent` is the solid fill (buttons, switches, progress; white text on it) and `accent-fg` is violet used as text / icons / focus. Use `text-accent-fg`, never `text-accent`.
- Elevation comes from borders. Shadows are kept for floating layers (menus, dialogs, toasts). No glows, no card gradients, no hover movement.
- Radius: 8px controls, 12px cards and dialogs. Type: page title 20px, section title 14px, body 13-14px, labels 12px, metadata 11-12px. Use `.tabular` for numbers that change.

## Shared components

| Component | Where |
|-----------|-------|
| AppShell, Sidebar, Topbar, Breadcrumbs, CommandPalette, ActivityMenu | `src/layout/` |
| PageHeader, StatusBadge, EmptyState, ErrorState, FilterBar, DataTable, ProjectCard / ProjectGrid, JobStatusPanel, SettingsSection, ConnectionIndicator, ResourceMeters, ProjectWorkspaceNav, MediaPreview, VideoPreview | `src/components/` |
| Button, Card, Badge, Input, FormField, SearchInput, Select, SegmentedControl, ChoiceGroup, Switch, Tabs, Table (sortable), Pagination, Modal, ConfirmDialog, Dropdown, Toast, Skeleton, Progress, ProgressIndicator, Meter, StatTile | `src/components/ui/` |

Accessibility: skip link, one `main` landmark, `aria-current` on navigation, listbox / menu / radiogroup keyboard support in `Select`, `Dropdown`, `SegmentedControl`, `ChoiceGroup`, `aria-sort` on sortable columns, `aria-live` result counts, visible focus rings, focus trap and focus return in dialogs.

## Pages and where their data comes from

Nothing below is mocked. A figure that cannot be read is shown as "Unavailable" or an em dash, never as 0 or a guess.

| Page | Data |
|------|------|
| Overview `/` | totals from `/api/analytics/overview`; live work from `/api/videos`; load from `/api/system/resources` |
| Create Video `/wizard` | `POST /api/videos` with exactly the fields `createVideoSchema` accepts. Adds the **1:1 size** and the **font pairing** option the backend already supported but the old form never exposed. Shows worker status (`/api/system/workers`) and the average generation time of finished jobs (analytics), labelled as an average |
| My Projects `/projects` | `/api/videos` + `/api/courses`; search is server-side; status / type / sort act on what is loaded, and the page says when more exist ("Load more") |
| Project (`/render?id=`, `/studio?id=`) | existing endpoints; shared header, Progress / Editor tabs, one pipeline card (status, tracker, stage actions), unsaved-changes guard, Discard |
| Courses, Render Queue, Completed Videos, Analytics, Live Logs, Image Studio | existing endpoints, rebuilt on the shared header, filter bar, tiles, cards and states; Courses search / status / category are applied by the server |
| Templates `/templates` | the renderer's own registry, names, descriptions and sample scenes (`vireon-remotion-templates`) |
| Media Library `/media` | `/api/assets` (filter by the registry's own categories), storage totals from analytics |
| Generation Jobs `/jobs` | `/api/jobs`, queue counts from `/api/analytics/control-center`, stale-job detection from `updatedAt` |
| GPU & Resources `/resources` | `/api/system/resources` (new), `/api/system/ai-services`, `/api/system/workers`, control-center queues |
| Quality Control `/quality` | `qualityReport` stored on each job by the post-render gate |
| Voice Studio `/audio` | existing studio plus `/api/tts/stats` and `/api/system/ai-services` for engine status |
| Settings `/settings` | browser-local preferences; read-only server state (providers, storage, health). No secret ever reaches the browser |

### Rules the UI follows

- A video is **Passed** only when its stored report says so. A finished video with no report is **Not checked**.
- A running job whose record has not changed for 10 minutes is flagged ("No update for ..."), and the Live badge turns to Reconnecting / Offline when the socket drops, so a frozen bar is not mistaken for progress.
- A running job with no reported percentage gets an indeterminate bar, not an invented number.
- The GPU is only called idle when the task ledger could actually be read.
- Job-finished / job-failed notices work app-wide by watching the jobs feed. Socket completion events only reach clients that joined that job's room, so a global socket listener would miss them.

## Backend changes

1. **`GET /api/system/resources`** (`src/services/system/ResourceService.js`, `src/routes/systemResources.js`): CPU load, RAM, GPU / VRAM / temperature via `nvidia-smi`, the `GpuTask` ledger (active, recent, stale heartbeats) and Mongo / Redis / MinIO reachability. Read-only, `null` for anything it cannot measure, no paths, hostnames or credentials. Tested in `tests/services/resourceService.test.js`.
2. **Regex-safe search** (`src/utils/escapeRegex.js`) applied to the video, course, job and asset list searches. The search box text was passed straight to Mongo `$regex`, so typing `(` or `c++` threw a server error, and a crafted pattern could run for a long time.

## Known gaps (documented, not faked)

| Wanted | State |
|--------|-------|
| Project title and description, and choosing one template for a whole video | The job model has only `topic`, and templates are chosen per scene (by the AI director, or in the editor). Create Video does not pretend otherwise |
| Upload in the Media Library | No upload endpoint exists; files are created by jobs and the studios. The page offers open, copy link, go to source, delete |
| Running quality checks on an already-rendered video | Checks run only inside the render pipeline. Re-rendering runs them. Existing videos rendered before 2026-10-20 show "Not checked" |
| Queue position of a single job | Not exposed per job. The page shows queue length and slots instead |
| An interactive multi-track timeline | The editor has a scene list with drag-to-reorder, per-scene editing and a live Remotion preview. There is no free-form timeline and none is drawn |
| GPU telemetry beyond nvidia-smi | Non-NVIDIA cards, or a machine without the driver, report GPU figures as Unavailable. CPU and RAM are still measured |
| Panel-level layouts inside Publishing and Promotion Studio (their forms, tables and dialogs) | The page shells, tiles, tabs and states follow the new system; the individual panels inside them keep their own layouts and use the shared primitives |

## Verifying

```bash
cd frontend && npm run lint && npm test && npm run build
cd ../backend && npm run lint && npm test
```

`tests/publishing/publishingConfig.test.js` fails on a machine whose `.env` has Meta configured (it assumes an empty environment). That is unrelated to this work.
