# Vireon frontend: performance audit

Audit only, no code changed. Date: 2026-10-02. Measured against the production build
served by nginx on the PC (`http://127.0.0.1:8080`), real data (12 video jobs, 2 courses),
Chromium (built-in browser pane), plus static analysis of `frontend/src` and the backend log of a real job.

## 1. Baseline (measured)

| Metric | Value |
|---|---|
| Dashboard: DOMContentLoaded | 57-72 ms (TTFB 8 ms) |
| Dashboard: requests / JS transferred / total | 19 / 169 KB / 179 KB (gzip) |
| `/projects` | 18 requests, 20 KB total, 2 `<img>`, API: videos?limit=50, courses?limit=50 |
| `/jobs` | 22 requests, 17 KB total |
| `/analytics` | 17 requests, 94 KB total (charts chunk loaded lazily) |
| Duplicate API calls on first load | **none** (every endpoint requested exactly once per route) |
| JS heap after load | 7-10 MB |
| DOM nodes | 1,368-1,603 per page |
| Build: JS chunks / total raw JS | 127 chunks / 1,612 KB (all lazy except the entry) |
| Entry chunk (`index-*.js`) | 403 KB raw / about 128 KB gzip |
| Largest lazy chunks | `ScenePreview` 406 KB (93 KB gz, Remotion Player), `analytics` 217 KB (72 KB gz) |
| CSS | 84 KB raw / 14 KB gzip (Tailwind output) |
| Entry chunk contents (source size) | react-dom 38%, react-router 26%, axios 10%, **own code 8%**, react-query 6%, socket.io 8% |
| Real job event volume | 1 test job = 46 stored events, **37 `jobProgress`** over about 16 min |
| Real request volume while watching a job | about 78 `GET /api/videos/:id` (15 KB each) + 41 `activity-logs` over the session |

## 2. What is already good (no action needed)

| Area | Evidence |
|---|---|
| Route code splitting | All 17+ pages are `React.lazy`; Remotion/charts only load on their pages |
| Server state | TanStack Query: 30 s `staleTime`, `placeholderData`, no global polling; polling only for active jobs and not in background tabs |
| Socket.IO lifecycle | One shared socket; `useSocketRoom` joins/leaves rooms and removes listeners on unmount; connection status via `useSyncExternalStore`; seq-based replay after reconnect |
| Cleanup | Every `setInterval` and every `addEventListener` has its matching cleanup (one intentional app-lifetime listener) |
| Memory | No `createObjectURL`, observers or GSAP in app code, so nothing to leak; heap is 7-10 MB |
| Caching/compression | Hashed assets `max-age=31536000, immutable`; gzip on; index.html `no-cache` |
| Reduced motion | `prefers-reduced-motion` handled in `App.css`, `v2.css` and the theme module |
| Fonts | System fonts only; nothing render-blocking |

## 3. Findings

| # | Area | Current | Problem | Severity | Recommended fix |
|---|---|---|---|---|---|
| F1 | Remotion preview (`components/video/ScenePreview.jsx`) | `inputProps={{ assets: { scenes: previewScenes }, jobId: "preview" }}` is a new object on every render | Remotion Player re-renders the whole 1920x1080 composition whenever the parent re-renders (typing in the inspector, selecting scenes), not only when scenes change. Remotion documents that `inputProps` must be memoized | **High** (the heaviest client work in the app) | `useMemo` the `inputProps` on `previewScenes` |
| F2 | Studio editors (`pages/studio`, `pages/courses/CourseVideoStudio`) | `editedScenes` changes on every keystroke and goes straight to `ScenePreview` | Each keystroke rebuilds resolved scene media and re-renders the composition | Medium | Feed the preview a debounced copy (about 250 ms) of `editedScenes`; editor stays instant |
| F3 | Thumbnails (`pages/projects`, `pages/complete`) | `<img>` without `loading`, `decoding`, width/height; files are **1920x1080 PNG, 34-169 KB** each, shown as small cards | All thumbnails download at once; cost grows linearly with the library (50 thumbnails is about 3-8 MB); layout shift while loading | Medium (small today, scales) | Add `loading="lazy" decoding="async"` and width/height/aspect-ratio (client-only). Real fix needs smaller thumbnails from the backend (out of scope: "optimize the client") |
| F4 | Search inputs (`pages/jobs`, `pages/assets`) | `onChange` sets state that is part of the query key | One server request per keystroke (about 150 ms each against Atlas); TanStack keeps results correct (no race), but traffic is wasteful | Low-Medium | Debounce the value used in the query key (about 300 ms); keep the input itself immediate |
| F5 | Log drawer (`components/LogDrawer`) | `GET /api/logs/recent?limit=200` (5 KB) on **every page load** | Fetches data the user can't see (drawer closed) | Low | Fetch when the drawer first opens |
| F6 | Socket to query sync (`lib/useSocketQuerySync.js`) | Every `jobProgress` event invalidates `jobs`, `videos` and the job detail | 37 events per video job means up to 37 refetch rounds of the list endpoints; harmless at one user, but unthrottled | Low | Coalesce invalidations (trailing throttle about 1.5 s); terminal events (completed/failed) stay immediate |
| F7 | Render page (`pages/render/useJobSocket.js`) | `fetchActivityLogs()` on every `jobProgress` event, plus `GET /api/videos/:id` (15 KB, includes the full script) about every 9-12 s while open | About 40 activity-log fetches and about 78 job fetches per 16-min job | Low | Throttle the activity-log fetch with F6's coalescing; keep polling interval as the safety net |
| F8 | Progress bars (`ui/Progress.jsx`, `CircularProgress.jsx`) | `setInterval` every 400 ms updates React state while trickling | One small re-render per 400 ms per running bar; cheap but constant | Low | Leave, or drive with CSS transition. Not worth changing alone |
| F9 | Video list payload | 189 KB raw (41 KB gz) for 20 jobs on the **deployed** version | Already fixed in the staged change (`getAllJobs` trims `script`/`statusHistory`: 90% smaller) | Done | Deploy it (backend change, already tested) |
| F10 | Large single-file pages | `wizard` 763 lines, `analytics` 651, `jobs` 558; 0 uses of `React.memo` | No measured problem; heap and request counts are small. Memoization would be speculative | Info | Do **not** add `React.memo` blindly; revisit only if profiling shows a slow interaction |

## 4. Checked and not needed

| Idea from the brief | Verdict |
|---|---|
| Virtualization | Library is 12 jobs; pages paginate at 12-20 (projects fetches 50). Not needed until hundreds |
| Bundle splitting / removing dependencies | Entry is framework (react-dom + router = 64%); own code is 8%. No unused heavy dependency found; splitting would only help repeat visits after a deploy |
| Image formats / responsive images | Needs backend or ffmpeg work; the client cannot resize files that MinIO serves |
| Server-side pagination / search | Already server-side for jobs, assets, completed |
| AbortController | No `AbortController` is used, but TanStack keys prevent stale overwrites; the only long requests (audio generation) shouldn't be cancelled |
| Video lists | Only two `<video>` elements exist (render page, v2 job detail), both single, with posters; no multi-video grids to optimize |

## 5. Proposed implementation order (needs your approval)

| Step | Change | Expected impact | Risk |
|---|---|---|---|
| 1 | F1: memoize `inputProps` | Removes the largest repeated render cost in the Studio/editor pages | Very low |
| 2 | F3: lazy images with dimensions | Defers off-screen thumbnail downloads; removes layout shift | Very low |
| 3 | F4: debounce search (Jobs, Assets) | One request per pause instead of per keystroke | Low |
| 4 | F6 + F7: coalesce socket-driven refetches | About 37 refetch rounds per job collapse to about 10; terminal events immediate | Low-Medium (touches live-progress behavior; test with a real job) |
| 5 | F5: lazy-load log drawer data | 1 request fewer on every page load | Low |
| 6 | F2: debounced preview input | Smoother typing in Studio | Low |

Deploy F9 (already staged) regardless.

## 6. Implemented (2026-10-02)

Each change: problem, root cause, change, impact, and how it was verified.

| # | Problem and root cause | Change (files) | Impact | Verified by |
|---|---|---|---|---|
| F1 | Remotion Player re-rendered the whole composition on any parent render: `inputProps` was a new object literal each render | `useMemo` on `inputProps` (`components/video/ScenePreview.jsx`) | Selecting scenes, socket updates and typing no longer re-render the 1080p composition unless scene content changed | New test `ScenePreview.test.jsx`; **mutation-checked**: putting the old inline object back fails 2 of 3 tests |
| F2 | Each keystroke in the Studio editors rebuilt the preview | Preview works from a copy that settles 250 ms after the last edit (`useDebouncedValue`); adding/removing a scene applies immediately | 5 keystrokes = 1 composition render instead of 5 | Same test file |
| F3 | Off-screen 1920x1080 PNG thumbnails all downloaded at once; no dimensions | `loading="lazy" decoding="async"` + width/height (`pages/projects`, `pages/complete`) | Thumbnails below the fold load on demand; no layout shift. (Smaller thumbnail files still need backend work) | Browser: attributes present; one off-screen image stayed unloaded |
| F4 | One server request per keystroke in Jobs/Assets search | Query key uses a 300 ms debounced copy (`pages/jobs`, `pages/assets`); input stays instant | Typing "test" = **1 request instead of 4** | Browser: 0 requests while typing, 1 after the pause (`search=test`) |
| F5 | `/api/logs/recent` fetched on every page load for a closed drawer | History loads on first open; live socket lines merged without duplicates (`components/LogDrawer`) | One request fewer on every route | Browser: 0 requests before open, 1 after, log lines render |
| F6 | Every `jobProgress` event invalidated job lists + detail | Progress events batched: first refetch now, the rest of a burst collapses into one per 1.5 s; created/completed/failed/deleted stay immediate (`lib/useSocketQuerySync.js`, `lib/throttle.js`) | A 37-event job: up to 37 refetch rounds become about 10 | Unit tests (4); **not yet seen on a live job** |
| F7 | Render page re-read the activity log on every progress event | Throttled to one per 3 s; completed/failed refresh immediately; pending refresh cancelled on unmount (`pages/render/useJobSocket.js`) | About 40 requests per job become about 10 | Throttle unit tests; **not yet seen on a live job** |
| F9 | Video list was 189 KB for 20 jobs | Backend aggregation trim (already staged separately) | 40 KB to about 4 KB per list load | Real-data comparison: 188,908 B to 19,842 B |

New utilities: `lib/useDebouncedValue.js`, `lib/throttle.js` (both unit tested).

## 7. Before / after

| Metric | Before | After |
|---|---|---|
| Tests | 21 | **41** (20 new) |
| Lint problems | 20 | 17 (none added; 3 fewer) |
| Entry JS (gzip) | 128,150 B | 128,505 B (+0.3 KB for batching/debounce code) |
| CSS (gzip) | 14,310 B | 14,310 B |
| `GET /api/logs/recent` per page load | 1 | **0** (1 on first drawer open) |
| Dashboard / Projects / Jobs / Analytics requests | 19 / 18 / 22 / 17 | 18 / 15 / 22 / 16 (log history gone) |
| Server requests typing a 4-letter search | 4 | **1** |
| Composition re-renders on unrelated parent render | every render | **none** (identical `inputProps`) |
| Composition re-renders for 5 keystrokes | 5 | **1** |
| Duplicate API calls on first load | 0 | 0 |
| JS heap | 7-10 MB | 10 MB (unchanged) |

Transfer sizes were not compared after the change: the local test server did not gzip, unlike nginx.

## 8. Remaining / not done

- **F6/F7 not yet observed on a live job.** Logic is unit tested, but watch the next real video: the progress bar and activity log should still update, at most every 1.5-3 s.
- **Thumbnail size (backend):** 1080p PNG files; generating about 640 px JPEG/WebP thumbnails would cut list pages 5-10x more than lazy loading.
- **Course pages** (`useCourseSocket`, `useVideoSocket`) also refetch per event; left alone because those events are few (about 5 per video).
- **Progress bar trickle** (400 ms state tick) left as is: cheap, not worth the churn.
- **Not measured:** React re-render counts on real pages (no React DevTools available); F1/F2 rely on Remotion's documented `inputProps` behavior plus the regression test.
- **Future, only if the library grows:** virtualize the Projects grid (fetches 50), vendor chunk split for repeat-visit caching.
