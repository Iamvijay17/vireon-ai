# Publishing: YouTube upload and Udemy course packages

Vireon can publish a finished lesson video to **YouTube** (real uploads through the official YouTube Data API v3) and prepare a whole course for **Udemy** (a downloadable package for you to upload by hand, because Udemy has no public API that can do it).

Open **Publishing** in the sidebar. Everything here is opt-in: with no Google credentials configured the page says "not configured" and nothing is ever uploaded.

> **Nothing publishes by itself.** Generating or rendering a video never uploads it. A YouTube upload always goes *draft → review → explicit confirmation → queued*. The API enforces this too: `POST /api/publishing/jobs/:id/submit` rejects anything without `{ "confirm": true }`.

Contents: [What works](#what-works-and-what-does-not) · [Architecture](#architecture) · [Google Cloud setup](#google-cloud-setup) · [Configuration](#configuration) · [Running the workers](#running-the-workers) · [Connecting and testing](#connecting-an-account-and-testing-with-private-uploads) · [Quota](#api-quota-and-limits) · [Udemy](#udemy) · [API](#api) · [Security](#security-model) · [Reliability](#job-lifecycle-and-reliability) · [Limitations](#known-limitations) · [Verify locally](#end-to-end-checklist) · [Troubleshooting](#troubleshooting)

## What works, and what does not

| | Status |
|---|---|
| YouTube: connect a channel with Google OAuth 2.0 (state + PKCE, server-side code exchange) | Implemented |
| YouTube: publish a **course lesson** or a **standalone video** (New Video wizard, incl. Shorts) | Implemented |
| YouTube: edit title, description, tags, category, language, visibility, schedule, "made for kids", AI-content disclosure | Implemented |
| YouTube: `videos.insert` resumable upload, progress, retry, cancel, resume after a restart | Implemented |
| YouTube: private / unlisted / public | Implemented, but **only private** until your Google API project passes YouTube's audit (see below) |
| YouTube: scheduled publishing (`status.publishAt`) | Implemented, same audit restriction |
| Udemy: course package (manifest, organised videos, captions, validation report, checklist) | Implemented |
| Udemy: **creating a course, uploading lectures or publishing through an API** | **Not possible and not implemented** - see [Udemy](#udemy) |

## Architecture

```
Browser (Publishing page)
   │  REST + Socket.IO (progress)
   ▼
API  /api/publishing  ──►  Mongo: PlatformAccount · PublishingJob · CoursePublishingProfile · OAuthState
   │                         MinIO: the already-rendered videos (read by byte range, never regenerated)
   │  enqueue (BullMQ / Redis)
   ├──► youtube-publishing ──► YouTube worker ──► Google (OAuth, videos.insert, videos.list)
   └──► course-export      ──► Export worker  ──► ZIP in MinIO (vireon-video/publishing/exports/…)
```

* **Reused as-is:** Express, Mongoose, BullMQ + Redis, Socket.IO (workers publish over the existing Redis pub/sub bridge), MinIO, zod, the retry/backoff policy (`services/common/retryPolicy.js`), the error handler and the `LoggerService`.
* **New:** `backend/src/services/publishing/` (domain logic), `routes/publishing.js` + `controllers/publishingController.js`, `middleware/publishingGuard.js`, four models, `queues/publishingQueues.js`, `workers/youtubePublishWorker.js` and `workers/courseExportWorker.js`.
* **Frontend:** `frontend/src/pages/publishing/` (route `/publishing`), plus API/socket/query-key additions.
* The video pipeline, its jobs and its worker are untouched. Publishing reads the stored render (`CourseVideo.renderUrl` → MinIO) and never triggers a render.

## Google Cloud setup

You need a Google account that owns the YouTube channel and a Google Cloud project.

1. **Create a project** at <https://console.cloud.google.com/> (or reuse one).
2. **Enable the API:** *APIs & Services → Library → YouTube Data API v3 → Enable*.
3. **OAuth consent screen** (*APIs & Services → OAuth consent screen*, or *Google Auth platform*):
   * User type **External** (Internal only works inside a Google Workspace organisation).
   * App name, support email, developer contact.
   * **Scopes** - add exactly these two (Vireon requests nothing else):
     | Scope | Why |
     |---|---|
     | `https://www.googleapis.com/auth/youtube.upload` | `videos.insert` - the upload itself |
     | `https://www.googleapis.com/auth/youtube.readonly` | `channels.list` (show *which* channel is connected, so nothing goes to the wrong one) and `videos.list` (confirm YouTube finished processing) |
   * While the app is in **Testing**, add your own Google account under *Test users*.
4. **Create credentials:** *Credentials → Create credentials → OAuth client ID → Web application*.
   * **Authorized redirect URI** - must match `GOOGLE_REDIRECT_URI` exactly:
     * local dev: `http://localhost:3000/api/publishing/oauth/google/callback`
     * behind the Tailscale/nginx front door: `https://<your-host>/api/publishing/oauth/google/callback`
     * Google only accepts `https`, or `http` for `localhost`.
   * Copy the client ID and secret into `backend/.env` (never commit them).
5. **Consent-screen status matters more than it looks:**
   * An app in **Testing** issues refresh tokens that **expire after 7 days**. Uploads will start failing with *"reconnect"*. Fine for a trial; for real use, move the app to **In production**.
   * An **unverified** app in production works for you, but users see Google's "unverified app" warning and the project is capped at 100 users. Google lists these YouTube scopes as *sensitive*, so removing the warning needs Google's OAuth app verification (check the *Data access* page for the current classification).
6. **YouTube API audit (separate from OAuth verification).** Videos uploaded through an **unverified YouTube API project are locked to private**, and YouTube says this cannot be appealed per video. Apply through YouTube's *API Services – Audit and Quota Extension Form* (linked from the [Quota and compliance audits](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits) page). Until it passes, leave `YOUTUBE_API_VERIFIED` unset - Vireon then offers private uploads only and says why, instead of letting you believe a video is public. After it passes, set `YOUTUBE_API_VERIFIED=true` to unlock unlisted, public and scheduling.
7. **Quota.** The current documentation gives each project a separate bucket of `videos.insert` calls per day (100 at the time of writing) besides the 10,000-unit general bucket, resetting at midnight Pacific. Confirm your own figure under *APIs & Services → YouTube Data API v3 → Quotas* and mirror it in `YOUTUBE_DAILY_UPLOAD_LIMIT`.

Official references: [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert) · [resumable upload protocol](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol) · [OAuth 2.0 for web servers](https://developers.google.com/identity/protocols/oauth2/web-server).

## Configuration

All settings live in `backend/.env` (see `backend/.env.example`; placeholders only - never commit real values). They are validated at start-up (`config/validate.js`): a half-filled Google section, a bad redirect URI or an invalid key stops the process with a message naming the variable.

| Variable | Default | Purpose |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | - | OAuth client (secret stays on the server) |
| `GOOGLE_REDIRECT_URI` | - | Backend callback, exactly as registered in Google Cloud |
| `PUBLISHING_TOKEN_ENCRYPTION_KEY` | - | 32 bytes (64 hex or base64). Encrypts refresh tokens and upload-session URLs at rest |
| `PUBLISHING_FRONTEND_URL` | first `CORS_ORIGIN` | Where the browser lands after Google. Fixed config - never taken from the request |
| `YOUTUBE_API_VERIFIED` | `false` | `true` only after the YouTube API audit; unlocks non-private uploads and scheduling |
| `YOUTUBE_AI_DISCLOSURE` | "This video was created with AI: the script, narration and visuals are AI-generated. Made with Vireon AI." | Added to the end of every new draft's description (you can edit it in the form); set it empty to disable. Separate from the "contains AI-generated content" switch, which is YouTube's own disclosure flag and defaults to on |
| `YOUTUBE_MAX_UPLOAD_BYTES` | 4 GiB | Larger files are refused before any byte is sent |
| `YOUTUBE_DAILY_UPLOAD_LIMIT` | 100 | Local guard on your daily upload allowance |
| `YOUTUBE_UPLOAD_CHUNK_BYTES` | 8 MiB | Resumable chunk size; must be a multiple of 262144 |
| `PUBLISHING_MAX_ATTEMPTS` | 5 | Automatic tries (exponential backoff 5 s → 60 s) for transient failures |
| `YOUTUBE_WORKER_CONCURRENCY` | 1 | Simultaneous uploads |
| `YOUTUBE_PROCESSING_*` | 10 s / 10 min / 24 checks | How long to wait for YouTube's own processing |
| `PUBLISHING_EXPORT_MAX_BYTES` | 20 GiB | Cap on a Udemy package |
| `PUBLISHING_RATE_LIMIT_*` | 60 / min | Limit on state-changing publishing requests |

Generate the encryption key once and **back it up**. Losing it means stored tokens become unreadable and each account must be reconnected.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

There are **no Udemy settings**: no credentials are requested or stored for Udemy.

## Running the workers

Uploads and package builds run in their own processes, never in an HTTP request.

```bash
cd backend
npm run youtube-worker:dev    # YouTube uploads        (queue: youtube-publishing)
npm run export-worker:dev     # Udemy package builds   (queue: course-export)
# or from the repo root
npm run dev:youtube-worker
npm run dev:export-worker
```

Production: `npm run youtube-worker` / `npm run export-worker` (or `node src/workers/youtubePublishWorker.js`). **They are not part of `deploy/install-workers.ps1`**: add them to the production machine's scheduled tasks yourself, the same way the video and course workers are registered.

Things to know:

* Dev and prod share one Mongo database and Redis queue by design. A publishing worker anywhere can pick up a queued job, so **every publishing worker must use the same `PUBLISHING_TOKEN_ENCRYPTION_KEY`**. A worker with a different key cannot decrypt the token; it fails the attempt with `CREDENTIALS_UNREADABLE` (retryable, and it does *not* mark the account as needing reconnection) so the right worker can take over. Simplest: run publishing workers on one machine only.
* On start, and every two minutes, each worker re-queues jobs that were saved but have nothing driving them (see [Reliability](#job-lifecycle-and-reliability)).
* Stopping a worker (Ctrl+C / SIGTERM) lets the current chunk finish; a hard kill is also safe - the upload resumes from YouTube's confirmed offset.

## Connecting an account, and testing with private uploads

1. Start the API, the frontend and the YouTube worker.
2. **Publishing → Accounts → Connect YouTube account.** You are sent to Google; approve both permissions. (If you untick one, Vireon refuses the connection and revokes the grant - an account without both permissions would only fail later, mid-upload.) You land back on the Accounts tab with the channel listed.
3. **Publishing → Publish**. Choose **Course lessons** (pick a course) or **Standalone videos**, then **Publish…** on a finished video. A draft opens with the exact stored video, pre-filled details and the visibility locked to *Private* (unverified project). Edit as needed.
4. **Publish to YouTube → confirm.** The job moves to *Queue & history*: Queued → Validating → Uploading (live %) → Processing → Completed, with the YouTube video ID, watch URL and Studio link.
5. Open the link; the video is private, visible only to you. Delete it in YouTube Studio when the test is done.

## API quota and limits

* **Accounts tab → Upload allowance** shows uploads started today against `YOUTUBE_DAILY_UPLOAD_LIMIT`, and when it resets (midnight Pacific, DST-aware).
* The real figures live in Google Cloud Console → *APIs & Services → YouTube Data API v3 → Quotas*. Check there for the project's actual usage.
* When the local allowance or Google reports the quota used up, the job is **not failed**: it waits for the reset (state *Retrying*), without spending retry attempts, up to 3 waits. Other limits: `uploadLimitExceeded` (per-channel upload cap) fails with an explanation; oversized files are refused up front.

## Udemy

### What was verified

Reviewed 2026-10-10 against the Udemy Instructor API reference (<https://www.udemy.com/developers/instructor/>): it is a REST API authenticated with an API client (bearer token) that an instructor creates in their own account. Its documented resources are read-oriented: courses you teach and their details, reviews, Q&A threads, performance metrics, and a revenue report. **No endpoint for creating a course or curriculum, uploading lecture videos, or publishing/submitting a course was found.**

*Honest caveat:* Udemy's documentation host refused automated fetches (HTTP 403), so the endpoint list was cross-checked against search results and a third-party OpenAPI listing of the same read endpoints, not read from the official page directly. Re-check the link above; if Udemy ever documents write endpoints *and* your instructor account is approved for them, a provider can be added next to `services/publishing/udemy/` - until then `UDEMY_CAPABILITIES.directPublishing` stays `false`. Vireon does not drive Udemy's website, scrape it, or ask for a Udemy password.

### The export workflow

1. **Publishing → Udemy → pick a course.**
2. Fill in **Course details**: subtitle, description, level, learning objectives, prerequisites, audience, and group lessons into **sections** (lessons not assigned go in an "Unassigned lessons" section; with no sections at all everything goes into "Course content"). The promo/trailer video is exported separately.
3. Read the **Validation report**:
   * **Must fix** - structural problems: missing title/subtitle/description/objectives, a lesson with no rendered video, no lessons.
   * **Recommended** - Udemy's course-quality guidance as understood when this was written (title ≈60 characters, subtitle ≈120, description ≥200 words, ≥4 objectives, ≥5 lectures and ≥30 minutes). These are advisory and never block an export; Udemy changes its rules, so check its current requirements.
   * **Notes** - missing prerequisites, audience, promo, descriptions, captions.
4. **Build Udemy package** (options: include videos, include captions, export even if validation fails). It runs in the export worker; download when it completes.
5. Follow `PUBLISHING-CHECKLIST.md` inside the ZIP (also shown on the page): create the course in Udemy's instructor interface (<https://www.udemy.com/instructor/>), enter the details, create the sections/lectures, upload each video, and use **Udemy's own** "Submit for review".

**Exporting a package does not create or publish anything on Udemy.**

### Package contents

```
<Course title> - Udemy package.zip
├─ manifest.json            schema vireon.udemy-course-package v1: course, sections → lectures, durations,
│                           media paths with size and SHA-256, validation summary, the "does not publish" notice
├─ course-metadata.json     course-level fields only
├─ validation-report.json   errors / warnings / info + totals
├─ PUBLISHING-CHECKLIST.md  step-by-step manual upload guide, lecture by lecture
├─ README.txt               the notice
├─ videos/01-01-lesson-title.mp4 …   numbered to match the curriculum
├─ captions/01-01-lesson-title.srt   only for lessons with voice-aligned timing
└─ promo/promo-video.mp4
```

## API

Interactive docs: `/api-docs` (tag **Publishing**). All routes are under `/api/publishing`.

| Method & path | Purpose |
|---|---|
| `GET /capabilities` | YouTube configuration, verification state, quota, privacy options; Udemy capabilities |
| `GET /accounts` · `DELETE /accounts/:id` | List (never includes tokens) · disconnect: revoke at Google and delete the credential |
| `POST /accounts/youtube/connect` | Start OAuth → `{ authUrl }` |
| `GET /oauth/google/callback` | Google's redirect: validates `state`, exchanges the code, `303` to the app with `?connect=<result>` |
| `GET /courses/:courseId/lessons` | Lessons with render state and what is already published |
| `GET /videos` | Finished standalone videos with their publishing state |
| `POST /jobs` | Create a **draft** from `courseVideoId` (a lesson) **or** `videoJobId` (a standalone video) - exactly one (idempotent; `409` for a duplicate of an active/finished publish) |
| `GET /jobs` · `GET /history` · `GET /jobs/:id` | List (filters: `platform`, `status`, `courseId`, `courseVideoId`, `finished`, `page`, `limit`) · finished jobs · detail with timeline and allowed `actions` |
| `PATCH /jobs/:id` | Edit metadata - only while DRAFT, or FAILED before anything uploaded |
| `POST /jobs/:id/submit` | Approve and queue (**requires `{"confirm": true}`**) |
| `POST /jobs/:id/retry` · `POST /jobs/:id/cancel` · `DELETE /jobs/:id` | Retry a failed job · cancel · delete a draft/cancelled job |
| `GET /courses/:courseId/udemy` · `PUT …` | Overview + validation report · save the Udemy profile |
| `POST /courses/:courseId/udemy/export` | Queue a package build |
| `GET /jobs/:id/download` | Stream a finished package |

Socket.IO events: `publishingJobUpdated` (sanitised summary: status, progress, remote ids, error + action) and `publishingAccountUpdated`. REST remains the source of truth; a missed event is repaired by the next fetch.

## Security model

Vireon has **no authentication** (`middleware/auth.js` is a documented pass-through for a single-user tool on a trusted machine/LAN). **Do not present these endpoints as production-secure on an open network.** What publishing adds:

* **Owner scoping.** Every account and job carries an `ownerId`; every query filters on it, and another owner's resource answers `404`. Today the owner is the constant `local`; when real authentication exists, change only `resolveOwner()` in `middleware/publishingGuard.js`.
* **Cross-origin write protection.** A state-changing request with an `Origin` outside `CORS_ORIGIN` gets `403`, so another web page cannot make your browser connect/disconnect accounts or approve uploads. Plus stricter rate limits than the global one.
* **OAuth:** a random single-use `state` (only its SHA-256 is stored, 10-minute TTL), PKCE (S256), code exchange on the server, a callback that can only redirect to the configured `PUBLISHING_FRONTEND_URL` and an allow-list of paths (no open redirect), `Cache-Control: no-store` / `Referrer-Policy: no-referrer` on the callback.
* **Secrets:** the client secret is only in the environment. Refresh tokens and upload-session URLs are AES-256-GCM encrypted at rest, `select: false` in Mongoose, stripped in `toJSON`, never in API responses, socket events or logs. Access tokens live only in worker memory.
* **Least privilege:** two OAuth scopes. Disconnecting revokes the grant at Google (best effort) and deletes the stored credential.
* **Approval:** nothing is queued without an explicit confirmation; every upload is attributable to one.
* **You** are responsible for owning the rights to what you upload and following YouTube's Terms of Service and the [API Services Terms](https://developers.google.com/youtube/terms/api-services-terms-of-service).

If you ever expose Vireon beyond a trusted network, add real authentication first (user model, login, sessions) and then bind it in `resolveOwner()`.

## Job lifecycle and reliability

`DRAFT → QUEUED → VALIDATING → UPLOADING → PROCESSING → COMPLETED`, plus `RETRYING`, `FAILED`, `CANCELLED`. State lives on the `PublishingJob` document; BullMQ is only the delivery mechanism, so nothing is lost if Redis or a worker goes away.

* **Completed means confirmed.** The upload is complete when YouTube answers `200/201` with the video resource; the job becomes `COMPLETED` only after `videos.list` reports `uploadStatus: processed`. A video still processing is re-checked later (up to 24 times) rather than declared done.
* **No duplicate uploads.** (1) A unique partial index on `dedupeKey` (channel + lesson + exact file) makes two concurrent requests race at the database. (2) The YouTube video id is stored the moment it exists; a retry that finds one only *verifies* it. (3) The resumable session URL is stored (encrypted), so a restart asks YouTube for the confirmed offset and continues; a finished-but-unacknowledged upload is recognised instead of re-sent.
* **Atomic, lease-guarded writes.** A worker owns a job through a lease it renews on every write; if the user cancels or another worker takes over, the next write returns nothing and the worker stops without overwriting anything.
* **Retries.** Transient failures (network, 5xx, 429) retry with exponential backoff (5 s doubling, capped at 60 s) up to `PUBLISHING_MAX_ATTEMPTS`. Permanent failures (invalid metadata, forbidden, source missing/changed, revoked access) fail immediately with a message and a next step. Quota waits and processing re-checks do not use attempts but are bounded.
* **Recovery.** Each worker sweeps on start and every 2 minutes for: jobs saved as `QUEUED` but never enqueued (Redis was down at submit), retries/re-checks whose time has come, and jobs whose worker died. Redis down at submit time returns `enqueued: false` and the job stays `QUEUED` for the sweep to pick up.
* **Re-renders.** The draft snapshots the stored file's size and ETag; if the lesson is re-rendered before upload the job fails with `SOURCE_CHANGED` rather than publishing something you never previewed.

## Known limitations

* **Unverified YouTube API projects can only upload private videos** (YouTube's rule). The UI says so and offers nothing else until `YOUTUBE_API_VERIFIED=true`.
* Google *Testing*-mode apps expire refresh tokens after 7 days.
* Udemy cannot be published to programmatically; export + manual upload only.
* One owner, no user accounts (see [Security](#security-model)). One connected Google account can have one channel per connection; connect again to add another channel.
* Standalone vertical videos are uploaded as ordinary videos; YouTube itself decides whether a short vertical clip is shown as a Short.
* Thumbnails, playlists, captions upload and comments are not handled (they would need extra scopes). Upload thumbnails and captions in YouTube Studio.
* The workers are not registered in `deploy/install-workers.ps1`.
* A "made for kids" answer and the AI-content disclosure are set from the form; you are responsible for them being accurate.
* Category ids come from a fixed list of globally assignable YouTube categories; a region where one is not assignable fails with `INVALID_METADATA` and an explanation.

## End-to-end checklist

1. `backend/.env` has the Google values and `PUBLISHING_TOKEN_ENCRYPTION_KEY`; restart. The Publishing page no longer shows "not configured".
2. API, frontend, **YouTube worker** and (for Udemy) **export worker** are running; MinIO, Redis and Mongo are up.
3. Accounts → Connect → approve → the channel appears as *Connected*.
4. Publish → course → a rendered lesson → **Publish…** → check the preview plays, edit the title.
5. **Publish to YouTube** → read the confirmation → *Upload now*. Nothing starts before this.
6. Queue & history: watch Uploading → Processing → Completed. Open **Watch**; the video is private.
7. Interrupt test: during an upload stop the worker (Ctrl+C), start it again - the job resumes and finishes without a second video.
8. Disconnect the account on the Accounts tab; confirm the app no longer appears under your Google account's third-party access.
9. Udemy tab → fix errors in the validation report → **Build Udemy package** → download → check `manifest.json` and the checklist.

## Troubleshooting

| Message / code | Meaning | Fix |
|---|---|---|
| "Google OAuth is not configured" | Missing `GOOGLE_*` or encryption key | Set them in `backend/.env`, restart API and workers |
| Redirect error `redirect_uri_mismatch` (on Google's page) | `GOOGLE_REDIRECT_URI` differs from the registered URI | Make them identical, including scheme and path |
| `?connect=state` after consent | Link expired (10 min), reused, or the API restarted mid-flow | Connect again |
| `?connect=scopes` | A permission was unticked on Google's screen | Connect again with both ticked |
| `AUTH_REVOKED` / account "Needs reconnecting" | Access removed in Google, password change, 7-day Testing expiry | Accounts → Reconnect, then Retry |
| `CREDENTIALS_UNREADABLE` | This worker's `PUBLISHING_TOKEN_ENCRYPTION_KEY` differs from the one used when connecting | Use one key everywhere, or reconnect |
| `QUOTA_EXCEEDED` | Daily allowance used | Wait - it resumes after the reset; or request more quota |
| `PRIVACY_RESTRICTED` / "locks uploads to Private" | Unverified YouTube API project | Choose Private, or pass the API audit |
| `INVALID_METADATA` | YouTube rejected title/description/tags/category | Edit the highlighted fields, Retry |
| `SOURCE_CHANGED` / `SOURCE_MISSING` | Lesson re-rendered or file gone | Create a new draft from the current render |
| `PROCESSING_TIMEOUT` | YouTube still transcoding | Retry - it keeps checking and never re-uploads |
| Queued but nothing happens | No YouTube worker running | Start `npm run youtube-worker:dev` |
