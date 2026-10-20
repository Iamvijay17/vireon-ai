# Vireon AI - Frontend

React single-page app for the Vireon AI video platform: create videos, review and edit scripts, follow render progress live, manage courses, and preview scenes with the embedded Remotion player.

For the project overview and deployment, see the [root README](../README.md).

## Tech stack

- **Framework:** React 19, Vite 8
- **Styling:** Tailwind CSS 4 with in-house, shadcn-style UI primitives (`src/components/ui`) over CSS-variable design tokens (`src/index.css`); dark by default; icons from lucide-react
- **Routing:** React Router 7
- **Data:** TanStack Query, Axios
- **Realtime:** Socket.IO client. One subscription (`useSocketQuerySync`) turns server events into query-cache invalidations
- **Video preview:** `@remotion/player` with the shared `vireon-remotion-templates` workspace package (`../backend/remotion`)
- **Charts:** Chart.js
- **Tests:** Vitest + Testing Library (jsdom)

## Routes

| Route | Page |
|-------|------|
| `/` | Overview: totals, live activity, machine load, recent projects |
| `/wizard` | Create Video: four steps (brief, voice & style, output, review) |
| `/projects` | My Projects: videos and courses, search / filter / sort, grid or list |
| `/render?id=` | A project's progress: pipeline actions, scene audio, quality report, video player (no `id`: the render queue) |
| `/studio?id=` | A project's editor: content, style, timeline, inspector (asks before discarding unsaved edits) |
| `/templates` | Template gallery: every scene layout the renderer has, playable with sample content |
| `/media` | Media Library (`/assets` redirects here): files in storage by kind, with preview |
| `/jobs` | Generation Jobs: videos, courses and voice generations, with cancel / retry / delete |
| `/resources` | GPU & Resources: measured GPU / VRAM / RAM / CPU, the GPU task ledger, AI services, scheduler, queues |
| `/quality` | Quality Control: output-check reports for finished videos |
| `/audio` | Voice Studio: single voice and dialogue, voice direction, history |
| `/images` | Image Studio |
| `/workflow` | Pipeline graph |
| `/publishing`, `/promotion/*` | YouTube / Udemy publishing, Facebook / Instagram / Threads promotion |
| `/analytics` | Analytics and control center |
| `/logs` | Live logs |
| `/settings` | Settings: appearance, video defaults, providers, storage, notifications, diagnostics |
| `/editor/complete` | Completed videos |
| `/courses`, `/courses/:id`, `/courses/:id/curriculum` | Course list, detail, curriculum |
| `/courses/:courseId/videos/:videoId` (and `/studio`) | Course video editor and studio |

The navigation (sidebar, breadcrumbs, tab titles, command palette) is generated from one list, `src/layout/navConfig.js`. See [docs/ui-redesign.md](../docs/ui-redesign.md) for the design system and the decisions behind these pages.

## Layout

```
src/
├── components/   # shared components and UI primitives (Button, Modal, Toast, Table, ...)
├── layout/       # app shell: sidebar, top bar, breadcrumbs, command palette, route table, navConfig
├── pages/        # pages, one folder each
├── shared/       # contexts (theme, sidebar, breadcrumbs) and hooks (job events, socket rooms, voices)
├── services/     # api.js (Axios + media URL helpers), socket.js
└── lib/          # query client, socket sync, formatters, small utilities
```

## Quick start

```bash
# From the repo root (the frontend depends on the backend/remotion workspace)
npm install
npm run dev:frontend      # same as: npm run dev --prefix frontend
```

Opens at <http://localhost:5173>. The dev server binds to all interfaces, so it is reachable from other devices on your LAN.

The backend API and Redis/MongoDB/MinIO need to be running for most pages to do anything; `npm run dev` at the repo root starts the API, workers and frontend together.

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |
| `npm test` / `npm run test:watch` | Vitest |

## Configuration

No `.env` is required. By default the app derives its endpoints from the page's hostname:

| | Dev | Production build |
|---|-----|------------------|
| API and Socket.IO | `http://<hostname>:3000` | same origin (nginx proxies `/api` and `/socket.io`) |
| Media (MinIO) | `http://<hostname>:9000` | same origin under `/media` (nginx, GET only) |

Optional overrides in `frontend/.env`:

```
VITE_API_URL=http://localhost:3000
VITE_MINIO_PUBLIC_URL=http://localhost:9000
VITE_MINIO_SCENES_BUCKET=vireon-scenes
```

Media URLs stored in MongoDB point at MinIO's loopback address; `src/services/api.js` re-homes them to the page's own origin so they work over LAN and through the production proxy.

## Production build

`Dockerfile` builds from the **repo root** context (it needs the `backend/remotion` workspace) and serves the result with nginx using [`nginx.conf`](nginx.conf), which proxies `/api`, `/socket.io` and `/voice-samples` to the backend and exposes MinIO read-only under `/media`. See [DEPLOYMENT.md](../DEPLOYMENT.md).

## Notes

- `vireon-remotion-templates` is unbuilt workspace source. `vite.config.js` dedupes `react`, `react-dom` and `remotion` and excludes the package from dependency pre-bundling; keep both settings or the Remotion player breaks.
- The app has no login; see the auth note in the root README.
