# Promotion Studio - Facebook, Instagram and Threads

The **Promotion Studio** (`/promotion`) turns a finished Vireon video into platform-specific posts, shows a preview and
a validation report, and posts or schedules them through Meta's official APIs. It builds on the publishing module
(encrypted token storage, BullMQ workers, recovery sweep) described in [publishing.md](publishing.md).

> **Status - read this first.** Everything below is implemented and covered by automated tests that mock Meta's and
> Threads' APIs. **None of it has been run against a real Meta or Threads account yet** (that needs an app you create
> and, for anyone but you, Meta App Review). Treat each platform as *untested in production* until you have posted
> a test post through it. Where this guide states a Meta rule, it is from Meta's developer documentation as read in
> October 2026 and may change - the "verified" column says which.

| Capability | Facebook Page | Instagram | Threads |
|---|---|---|---|
| Text post | yes | no (API cannot post text only) | yes |
| Image | yes (JPEG/PNG) | yes (**JPEG only**, needs public URL) | yes (JPEG/PNG, needs public URL) |
| Video / Reel | yes: Reel (3-90 s, 9:16) or regular video; bytes uploaded directly | yes: Reel; public URL, or resumable upload (see below) | yes (needs public URL; up to 5 min) |
| Scheduling | yes (by Vireon's worker) | yes | yes |
| Insights | engagement counters; views / reach where Meta serves them | views, reach, likes, comments, shares, saves, interactions | views, likes, replies, reposts, quotes, shares |
| Needs `SOCIAL_PUBLIC_MEDIA_BASE_URL` | no | images always; video unless resumable upload works | image and video |

## How it works

1. **Connect accounts** (Accounts tab). One Meta Facebook-Login connects the Facebook Pages you select **and** the
   Instagram professional accounts linked to them (the Page access token is used for both). Threads has its own
   sign-in. You authorise on the platform's page; Vireon never sees a password.
2. **Create a promotion** (Create tab): pick a Vireon video / lesson (or upload a JPEG/PNG/MP4/MOV), describe the goal,
   audience, call to action, tone and destination URL, choose accounts, and let the **local LLM** (Ollama, no paid API)
   draft a different caption per platform - or write them by hand. Every field stays editable.
3. **Check and preview.** The server validates every destination (character limits, hashtag counts, media type, length,
   aspect ratio, account health, schedule) and returns the exact text that would be sent. Previews are an
   approximation, not the live platform UI.
4. **Post now or schedule.** Nothing is posted until you press the button *and* confirm. Each account becomes its own
   `SocialPost`; one failing never affects the others.
5. **Worker.** `socialPublishWorker` creates the platform container / upload, waits for processing, publishes, and
   marks the post **Published only after the platform confirmed it**.

Data model: `SocialCampaign` (the promotion and its per-platform copy), `SocialPost` (one per destination - the durable
history row), `PlatformAccount` (shared with YouTube; tokens encrypted), `OAuthState` (single-use CSRF state).

## Safety properties

- **No double posts.** A partial unique index (`dedupeKey`) refuses a duplicate of a live post. The platform container /
  upload id is saved the moment it exists; `publishAttemptedAt` is saved **before** the publish call. A run that finds
  an unconfirmed publish first asks the platform whether the post exists. If it cannot tell, the post stops as
  **"outcome unknown"** and a person decides ("It isn't posted - retry"). It never guesses.
- **Retry is per destination.** Retrying Facebook cannot touch a successful Instagram post.
- **Transient failures** (network, 5xx, rate limits) retry with exponential backoff (rate limits wait longer);
  **permanent ones** (invalid media, rejected content, revoked permission) fail immediately with an explanation and the
  action to take. A revoked / expired grant flags the account **Needs reconnecting** and the dashboard says so.
- **Daily allowances** (Instagram 100/24 h, Threads 250/24 h, Facebook Reels 30/24 h) are counted locally and, where
  Meta offers an endpoint, checked remotely; a post waits for the allowance instead of failing.
- **Ownership.** Vireon has no login (single user). Every record carries the owner id `local` and every query is scoped
  by it, so adding authentication later is a one-function change (`resolveOwner()` in `middleware/publishingGuard.js`).
- **CSRF.** The OAuth `state` is 256-bit random, stored only as a SHA-256 hash, single-use and expires in 10 minutes.
  The callback redirects only to a fixed frontend path. State-changing API requests from a foreign `Origin` are refused.

## 1. Meta app (Facebook + Instagram)

1. <https://developers.facebook.com/apps> -> **Create app**. Choose the use case for managing Pages / **Facebook Login**
   and, for Instagram, **Instagram API with Facebook Login** (`instagram_content_publish`).
2. **App settings -> Basic**: copy **App ID** -> `META_APP_ID`, **App secret** -> `META_APP_SECRET`.
3. **Facebook Login -> Settings -> Valid OAuth Redirect URIs**: add exactly
   `https://<your-host>/api/social/oauth/meta/callback` (for local development `http://localhost:3000/api/social/oauth/meta/callback`
   is accepted while the app is in Development mode). Put the same string in `META_REDIRECT_URI`.
   Optional but recommended: set **Deauthorize callback** `https://<host>/api/social/webhooks/meta/deauthorize` and
   **Data deletion request URL** `https://<host>/api/social/webhooks/meta/data-deletion` (these only fire if Meta can
   reach the URL over the internet - see section 3).
4. Permissions Vireon requests: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `read_insights`,
   `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`.
5. **Development mode vs Live.** In Development mode only people with a role on the app (admin / developer / tester)
   can connect, permissions work without review, and **posts are real posts**. For anyone else the permissions need
   **Advanced Access via App Review** (and usually Business Verification). Since Vireon is single-user, Development
   mode with your own account is the intended setup.

**Facebook Page requirements:** you must be able to perform the `CREATE_CONTENT` task on the Page (Vireon skips Pages
where you cannot). Publishing is public-only.

**Instagram requirements** (Meta documentation): a **Professional** (Business or Creator) account **linked to a Facebook
Page**. If the Page requires **Page Publishing Authorization**, Meta blocks publishing until it is completed. Images must be
**JPEG**. Instagram video is published as a Reel. Limits: 100 API-published posts per 24 h.

**The Instagram video path.** Meta fetches Instagram media from a public URL. Vireon uses that whenever
`SOCIAL_PUBLIC_MEDIA_BASE_URL` is set (section 3). Without it, Vireon tries Meta's *resumable upload* (bytes sent straight
from MinIO to `rupload.facebook.com`). **Meta documents that only for apps using Facebook Login for Business**, and Vireon uses
classic Facebook Login, so it may be refused for your app - the post then fails with Meta's own message. *Untested.*
If it fails, set up the public media URL.

## 2. Threads app

1. Same developer account -> create a **separate app** with the **Access the Threads API** use case.
2. **Threads app ID / secret** (App settings -> Basic, *Threads* section) -> `THREADS_APP_ID`, `THREADS_APP_SECRET`.
3. **Valid redirect URIs**: `https://<your-host>/api/social/oauth/threads/callback` -> `THREADS_REDIRECT_URI`. Optionally
   set the uninstall / delete callbacks to `.../api/social/webhooks/threads/deauthorize` and `.../data-deletion`.
4. Scopes requested: `threads_basic`, `threads_content_publish`, `threads_manage_insights`. Add yourself as a **Threads
   tester** (App roles) and accept the invite in the Threads app while in Development mode.
5. **Tokens:** the short-lived token (1 h) is exchanged on the server for a **60-day** token. The worker renews it
   (`refresh_access_token`) when it is within 10 days of expiry (Threads only allows it once the token is >=24 h old). A token that is
   not renewed within 60 days expires and cannot be refreshed - the account then shows **Needs reconnecting**.

Threads rules Vireon enforces (documented by Meta): 500 characters (emoji counted by UTF-8 bytes), max 5 links, video
<= 5 min / <= 1 GB / <= 1920 px wide, images JPEG/PNG <= 8 MB, 250 posts per 24 h. Link attachments only on text posts.

## 3. Public media (Threads, Instagram images)

Meta downloads these files itself, so they need a **public https URL**. Vireon is deliberately private (no login), so it
does **not** expose the app. Instead the worker mints a **signed, expiring, read-only link to exactly one stored file**:

    GET|HEAD  https://<public-origin>/api/social/media/<signed-token>/<file>

The token is an HMAC (key derived from `PUBLISHING_TOKEN_ENCRYPTION_KEY`) over `{bucket, key, expiry}`; without a valid,
unexpired token the route answers a bare 404. It supports `Range`, never lists or writes, and a leaked link dies at expiry
(`SOCIAL_MEDIA_TOKEN_TTL_MS`, default 6 h).

You must make **only that path** reachable from the internet and set `SOCIAL_PUBLIC_MEDIA_BASE_URL=https://<public-origin>`.
Do **not** use `tailscale funnel` on the whole app. Example nginx server block on a public host / tunnel endpoint that
forwards to the Vireon API:

```nginx
server {
  listen 443 ssl;
  server_name media.example.com;
  # ... TLS ...
  location ^~ /api/social/media/ { proxy_pass http://<vireon-api>:3000; proxy_set_header Host $host; }
  location ^~ /api/social/webhooks/ { proxy_pass http://<vireon-api>:3000; }
  location / { return 404; }
}
```

A Cloudflare Tunnel with a path-restricted ingress rule does the same job. Without this setting, Threads media posts and
Instagram image posts are **refused up front with an explanation**; Facebook posts and Threads text posts still work.

Also required by Meta for video: MP4/MOV, H.264/HEVC, AAC audio, `moov` atom at the front (Remotion's output is fine).

## 4. Environment variables

Placeholders only - copy `.env.example` / `backend/.env.example`. Secrets live in the environment, never in code.
`PUBLISHING_TOKEN_ENCRYPTION_KEY` is **shared with YouTube publishing**: generate once
(`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`), back it up, and give the **same value
to every process** (API container and native workers, dev and prod). A worker with a different key cannot read tokens: it
retries and shows "credentials unreadable" but deliberately does **not** flip the account to *needs reconnecting*.

| Variable | Meaning |
|---|---|
| `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` | Meta app (all three, or none) |
| `META_GRAPH_VERSION` | Graph API version, default `v25.0` |
| `THREADS_APP_ID`, `THREADS_APP_SECRET`, `THREADS_REDIRECT_URI` | Threads app (all three, or none) |
| `PUBLISHING_TOKEN_ENCRYPTION_KEY` | 32-byte key for token encryption and media-link signing |
| `PUBLISHING_FRONTEND_URL` | where the browser lands after OAuth (default first `CORS_ORIGIN`) |
| `SOCIAL_PUBLIC_MEDIA_BASE_URL` | public https origin serving `/api/social/media/*` (optional) |
| `SOCIAL_MEDIA_TOKEN_TTL_MS` | lifetime of a signed media link (default 6 h) |
| `SOCIAL_MAX_IMAGE_BYTES`, `SOCIAL_MAX_VIDEO_BYTES` | upload caps (default 8 MB / 1 GB) |
| `SOCIAL_MAX_ATTEMPTS` | automatic tries per post (default 5) |
| `SOCIAL_WORKER_CONCURRENCY` | simultaneous posts (default 2) |
| `SOCIAL_SCHEDULER_INTERVAL_MS` | how often due scheduled posts are promoted (default 30 s) |
| `SOCIAL_MIN_SCHEDULE_LEAD_MS`, `SOCIAL_MAX_SCHEDULE_AHEAD_DAYS` | schedule window (default 2 min / 180 days) |
| `SOCIAL_INSIGHTS_CACHE_MS` | analytics cache (default 30 min) |
| `SOCIAL_INSTAGRAM_DAILY_LIMIT`, `SOCIAL_FACEBOOK_DAILY_LIMIT`, `SOCIAL_THREADS_DAILY_LIMIT` | local 24 h allowance; can only be lowered below Meta's own |

Startup validation (`config/validate.js`) refuses a half-filled app section, a non-https redirect URI (http only for localhost)
and a missing encryption key, naming the exact variable.

## 5. Local development

```bash
# terminal 1-3 (as usual): API, frontend, plus the social worker
npm run dev:api
npm run dev:frontend
npm run dev:social-worker
```

- Use `http://localhost:3000/api/social/oauth/meta/callback` (and `/threads/`) as the redirect URIs; Meta accepts `http` for
  localhost only in Development mode.
- Dev and prod share one Mongo database and one Redis queue (by design). **Only run a dev social worker if it has the same
  `PUBLISHING_TOKEN_ENCRYPTION_KEY` as prod**, and remember any worker can pick up any post.
- **There is no Meta sandbox for publishing.** In Development mode, posts to your own accounts are real. The *Check*
  step validates content without posting; there is deliberately no "fake publish" mode, so a success you see is a real one.
  Tests never use real credentials (next section).

## 6. Production deployment

1. Put the `META_*`, `THREADS_*` values and the encryption key in the repo-root `.env` (read by Docker Compose; the API
   container gets them through `docker-compose.yml`) **and** in `backend/.env` (read by the native worker).
2. Register the worker: re-run `deploy\install-workers.ps1` (adds **`VireonSocialWorker`**) or register just that task by
   hand, then `Start-ScheduledTask VireonSocialWorker`. Redeploy the API container.
3. Register `https://<your-tailscale-host>/api/social/oauth/meta/callback` (and `/threads/`) on the apps. The OAuth redirect
   passes through *your browser*, so a tailnet-only address works for connecting accounts.
4. Optionally set up the public media path (section 3).

## 7. Scheduling and worker operation

- A scheduled post is a `SocialPost` in status `SCHEDULED` with a **UTC** `scheduledFor`; the time zone you picked is kept
  only for display. **Mongo is the source of truth.**
- Two things deliver it: a delayed BullMQ job (precise) and the worker's **scheduler tick** (every 30 s) which atomically
  promotes due posts to `QUEUED`. Lose Redis, restart the worker, or run two workers: the post still goes out once.
- The recovery sweep re-queues posts whose queue entry or retry timer was lost, or whose worker died mid-run (expired lease).
- Scheduled posts do **not** depend on a browser being open.
- Editing a scheduled post's text or time, or cancelling it, is atomic against the worker; a post already being sent cannot be
  cancelled (it is on its way to the platform).
- The worker also renews Threads tokens every 6 hours and flags accounts whose access lapsed, so the dashboard asks you to
  reconnect *before* the next post fails.

## 8. Analytics

Numbers come only from the platforms' APIs, cached for 30 minutes, read a few posts at a time (rate limits). *Update from
platforms* refreshes stale posts. A metric no post reported is **"Not available"**, never 0; a total says how many posts
contributed. Meta delays some metrics up to 48 h, has deprecated several (Instagram `impressions`/`plays`; Facebook
`post_impressions*`), and Threads has no reach. Link **clicks** are not available per post, so they are not shown.
Facebook insight metric names change often (v25 / v26) - an unsupported one simply shows as unavailable with Meta's reason.

## 9. Troubleshooting

| Message / code | Meaning and fix |
|---|---|
| `AUTH_REVOKED` - "no longer accepts this account's saved access" (Meta codes 190, 102) | Token expired or revoked, password changed, role removed. **Reconnect** on the Accounts tab, then *Retry*. |
| `PERMISSION_DENIED` (codes 10, 200) | A permission was refused or never granted (e.g. `pages_manage_posts`). Reconnect and leave every box ticked; in Live mode the permission needs App Review. |
| "Required permissions were not granted" after connecting | You unticked a permission in Meta's dialog. Connect again. |
| "No usable Page found" | No Page where you can create content was shared. Reconnect and select a Page. |
| `PUBLIC_MEDIA_UNAVAILABLE` | Threads / Instagram-image media needs `SOCIAL_PUBLIC_MEDIA_BASE_URL` (section 3). |
| `MEDIA_INVALID` | Meta rejected the file (codec, size, length, ratio). Re-render or pick another file, then retry. Not retried automatically. |
| `MEDIA_UNREACHABLE` | Meta could not download the public URL (tunnel down, link expired). Retried automatically. |
| `MEDIA_NOT_READY` / "still processing" | Meta was slow; the worker re-checks every 2 min up to the limit, then fails - retry later. |
| `RATE_LIMITED` (4, 17, 32, 613, 80000-80014) | Backs off 1, 2, 4 ... up to 15 min, automatically. |
| `PUBLISH_LIMIT_REACHED` | 24 h allowance used up; the post waits and continues by itself. |
| `ACCOUNT_INELIGIBLE` | Not a professional Instagram account, not linked to a Page, or restricted. Fix on Instagram, reconnect. |
| `CONTENT_REJECTED` (368) | Meta's policy/spam check blocked it. Edit the text or media. |
| `OUTCOME_UNKNOWN` | The publish request was sent but never confirmed. **Open the account on the platform.** If the post is there, nothing to do; if not, press *It isn't posted - retry*. |
| `CREDENTIALS_UNREADABLE` | This worker's `PUBLISHING_TOKEN_ENCRYPTION_KEY` differs from the one used to connect. Use the same key everywhere, or reconnect. |
| Redirect-URI error on Meta's page | `META_REDIRECT_URI` must equal a *Valid OAuth Redirect URI* exactly (https, trailing slash included if Meta added one). |
| Posts stay *Queued* | The social worker is not running (`Start-ScheduledTask VireonSocialWorker` / `npm run dev:social-worker`) or uses another Redis. |

## 10. Tests

```bash
cd backend  && npx jest tests/social       # 260+ tests: OAuth state, encryption, ownership, validation, publishing,
                                           # partial failure, scheduling persistence, recovery, retries, rate limits, analytics
cd frontend && npx vitest run src/pages/promotion
```

External platforms are replaced by stateful fakes (`backend/tests/social/helpers/platforms.js`) and an in-memory Mongo
(`backend/tests/publishing/helpers/fakeMongo.js`). CI never needs a real account.

## 11. Not done / known limits

- **Not verified against real Meta / Threads accounts or App Review** (see the status note at the top).
- Instagram through *Instagram Login* (no Facebook Page) is not implemented; Instagram accounts connect through their linked Page.
- Instagram **resumable upload** is attempted without a public URL but is documented by Meta for Facebook Login for Business only.
- Video length / size / shape come from the generation record (flagged as estimated in the UI), not from probing the rendered file.
- Carousels, Stories, scheduled posts using the *platform's* scheduler, comment management and content-event webhooks are out of scope.
- Facebook per-post reach/view metric names are best-effort and may need adjusting once tested against real Page data.
