# Deploying Vireon AI (₹0/month, no open ports)

## Architecture

```
 Your phone / laptop (Tailscale app installed)
        |  HTTPS (WireGuard, outbound-only from the PC)
        v
 Tailscale Serve  ──►  nginx (frontend container, 127.0.0.1:8080)
                          ├─ /            React build
                          ├─ /api, /socket.io  ──► backend container :3000
                          └─ /media/<bucket>/<key> (GET only) ──► MinIO :9000 (native)

 Windows PC (RTX 2060)
   Docker:  redis, backend (API), frontend (nginx), tailscale
   Native:  MinIO, Ollama(Gemma), Qwen3-TTS, MuseTalk, ComfyUI,
            videoWorker, courseVideoWorker (+ Remotion)   ← need the GPU / local paths
   Cloud:   MongoDB Atlas (free tier, already used)
```

**Never exposed:** MongoDB, Redis (127.0.0.1 only), MinIO console/admin/credentials
(nginx only forwards `GET/HEAD /media/vireon-{scenes,video,cache}/<object>`),
Ollama, TTS, MuseTalk, ComfyUI, workers.

> **Important:** the app has **no login** (`backend/src/middleware/auth.js` is a stub).
> Default access is **Tailscale Serve = private** (only devices you sign into your
> Tailscale account). Do **not** use Tailscale Funnel or the Cloudflare quick tunnel
> for anything but a short test until real auth is built — anyone with the URL could
> queue jobs on your GPU.

## 1. Prerequisites
- Windows 11, Node.js 22+, Git, PowerShell 7 or Windows PowerShell 5.1.
- Already working natively: MinIO (`D:\Programs\minio`), Ollama, Qwen3-TTS, MuseTalk.
- A GitHub repo for this project (Actions + GHCR are free; private repos get 2,000 CI min/month).
- PC set to **never sleep** (Settings → System → Power) and Docker/Tailscale start at login.

## 2. Install Docker Desktop
1. Install from docker.com (free for personal / small business use; check their terms).
2. Settings → General: enable *Start Docker Desktop when you sign in* and the WSL 2 engine.
3. Verify: `docker --version` and `docker compose version`.

GPU apps are deliberately **not** containerized (flaky on Windows with 6 GB VRAM).

## 3. Tailscale setup (free, no domain)
1. Create an account at tailscale.com (Google/GitHub login, free Personal plan).
2. Admin console → **DNS**: enable *MagicDNS* and *HTTPS Certificates*.
3. Admin console → **Settings → Keys** → generate an **auth key** (reusable). Put it in `.env` as `TS_AUTHKEY`.
4. Install the Tailscale app on every phone/laptop you'll use, signed into the same account.
5. Your URL will be `https://vireon.<tailnet-name>.ts.net` (shown in the admin console).

### Simplest path (used on this PC): host Tailscale, no auth key, no sidecar
If the Tailscale app is already installed on the server PC, skip the `tailscale` compose profile:
```powershell
& 'C:\Program Files\Tailscale	ailscale.exe' serve --bg --https=443 http://127.0.0.1:8080
```
First run prints a link to enable *Serve* on your tailnet (one click, your account). Then set
`PUBLIC_URL=https://<pc-name>.<tailnet>.ts.net` in `.env` and `docker compose up -d backend`
(the API's CORS allowlist must contain the URL users open). It is tailnet-only (private); never
run `tailscale funnel` while the app has no login.

### Alternative: Cloudflare Tunnel
A *named* tunnel (stable URL, Cloudflare Access login) needs a domain on Cloudflare —
**the domain costs money** (usually a few hundred ₹/year). Without a domain only the
random `trycloudflare.com` quick tunnel is possible (`--profile quicktunnel`; URL changes
each restart, public, no login). Cloudflare free plan also caps uploads at 100 MB and
restricts large video streaming through its proxy.

## 4. Environment variables
Two files, **both gitignored**; never commit secrets:

| File | Used by | Template |
|---|---|---|
| `.env` (repo root) | docker-compose (API container, Tailscale) | `.env.example` |
| `backend/.env` | native workers | `backend/.env.example` |

Root `.env` keys: `GHCR_OWNER`, `IMAGE_TAG`, `PUBLIC_URL` (your https URL), `MONGODB_URI`,
`MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `TS_AUTHKEY`.
Use the same MongoDB/MinIO values as your current `backend/.env`.
In `backend/.env` for workers: `NODE_ENV=production`, `REDIS_HOST=localhost`,
`MINIO_ENDPOINT=127.0.0.1`, plus your existing TTS/Avatar/ComfyUI start commands.

## 5. First deployment (production checkout)
Use a **separate clone** so deploys never touch your dev folder:
```powershell
git clone https://github.com/<you>/<repo>.git "C:\Programs\Video Generation\vireon-prod"
cd "C:\Programs\Video Generation\vireon-prod"
copy .env.example .env            # then edit .env
copy <dev>\backend\.env backend\.env   # then set NODE_ENV=production etc.
npm ci --prefix backend --omit=dev
npm ci --workspace=backend/remotion --include-workspace-root=false   # from the repo root
```
Make sure MinIO is running (`D:\Programs\minio\start-minio.ps1`), then bring up the stack
(first time builds locally; later deploys pull images from GHCR):
```powershell
docker compose --profile tailscale up -d --build
powershell -ExecutionPolicy Bypass -File deploy\install-workers.ps1   # elevated, once
Start-ScheduledTask VireonVideoWorker; Start-ScheduledTask VireonCourseWorker
```
Local check: <http://localhost:8080>. Remote: your `https://vireon.<tailnet>.ts.net`.

**Redis note:** the compose Redis owns `127.0.0.1:6379`; stop any native `redis-server` first.
Old queue state in `.redis-data` is not migrated (queues start empty).

## 6. GitHub Actions
- `ci.yml` (every push/PR, GitHub-hosted Linux): backend syntax + Jest, frontend lint/test/build,
  compose validation, Docker image builds (no push). **No AI or GPU work runs there.**
- `deploy.yml` (only after CI succeeds on `main`): builds and pushes
  `ghcr.io/<owner>/vireon-{backend,frontend}:sha-<commit>` to GitHub Container Registry.
- **Required GitHub secrets: none** (it uses the automatic `GITHUB_TOKEN`).
- Repo → Settings → Actions → General: set *Fork pull request workflows* to require approval.
- GHCR pulls: make the two packages **public** (Package settings), or on the PC run once
  `docker login ghcr.io -u <user>` with a classic PAT that has only `read:packages`.

### How the server gets updates (pull-based, no self-hosted runner)
The `VireonDeployPoll` scheduled task runs `deploy\deploy.ps1 -Poll` every minute. It:
1. fetches `origin/main`, derives `sha-<commit>`;
2. skips if that image doesn't exist yet (CI not finished/failed) or render jobs are active;
3. pulls images, checks out that commit, `npm ci` if lockfiles changed;
4. `docker compose up -d`, restarts both workers;
5. polls `http://127.0.0.1:8080/health`; on failure **rolls back automatically**.

Why not a self-hosted runner: it would execute repository code with your user's rights on
the PC that holds your keys and GPU. Pull-based keeps GitHub unable to run anything on the
PC. (If you ever add one: run it only for `main`, never for pull requests/forks.)

## 7. Day-to-day
| Task | Command (in the prod checkout) |
|---|---|
| Deploy | `git push origin main` → wait for CI + ≤1 min (or run `deploy\deploy.ps1 -Poll`) |
| Start | `docker compose --profile tailscale up -d` |
| Restart one service | `docker compose restart backend` |
| Restart workers | `Stop-ScheduledTask VireonVideoWorker; Start-ScheduledTask VireonVideoWorker` |
| Free Docker disk space | `deploy\deploy.ps1 -PruneOnly` (also runs after every deploy; keeps the running + previous version, `latest`, and `mongo:7` for backups) |
| Logs | `docker compose logs -f backend` · `.deploy\deploy.log` · `backend\logs\` |
| Health | `curl http://localhost:8080/health` → `{"status":"ok"}`; `docker compose ps` (readiness is the backend container's health) |
| Status of tunnel | `docker compose logs tailscale` |

**Disk space:** Docker keeps its data in one file (`%LOCALAPPDATA%\Docker\wsl\disk\docker_data.vhdx`, about 12 GB on this PC) that
does not shrink by itself after cleanup, so C: free space may not change. To hand the space back: quit Docker Desktop,
run `wsl --shutdown`, then in an elevated PowerShell `Optimize-VHD -Path "$env:LOCALAPPDATA\Docker\wsl\disk\docker_data.vhdx" -Mode Full`
(needs the Hyper-V module), and start Docker Desktop again. Vireon is offline while Docker is stopped.

### App version

Every deploy gets its own version, shown at the bottom of the sidebar (hover for
commit and build time). It is `<major.minor>.<run number>`: major.minor comes from
the root `package.json` `version` (bump it by hand for a feature release), and the
patch is the `deploy.yml` run number, so it rises on every deploy. `deploy.yml`
passes it to the frontend and backend images as build args; a hand-built or dev
build shows `<version>-dev`. The API reports its own at `GET /api/version` (and
logs it at startup); the sidebar tooltip lists both, so a mismatch is visible. An already-open tab keeps running the JS it loaded, so it
checks `/api/version` every minute and shows a "new version available - Reload" banner after a deploy.

## 8. Rollback
Every deploy keeps the previous working image tag in `.deploy\state.json`.
- Automatic: failed health check → previous version restored.
- Manual: `powershell -File deploy\deploy.ps1 -Rollback`
- Specific version: `powershell -File deploy\deploy.ps1 -Tag sha-<commit> -Force`
A failed commit is remembered and not retried until a newer commit lands.

## 8b. Alerts (ntfy, free)
`deploy\watchdog.ps1` runs every 2 minutes (task `VireonWatchdog`). It restarts a stopped MinIO/worker task,
and sends a push when API, MinIO, Docker, Tailscale or disk (<10 GB) fail (after 2 checks) and when they recover,
when a video job fails, or when a job shows no progress for 45 min. `deploy.ps1` also reports success/failure.
- Channel: the topic in `.deploy
tfy-topic.txt` (gitignored; treat as a password). Subscribe in the ntfy app
  (iOS/Android) or at `https://ntfy.sh/<topic>` in a browser. Messages contain no secrets.
- Test: `powershell -File deploy\watchdog.ps1 -Test`. New topic: overwrite the file and resubscribe.
- Not covered: the whole PC being off or offline (nothing on it can send an alert).

**"The whole PC is off/offline" alert (dead-man's switch, optional, free).** The watchdog cannot report its own PC being down, so
it pings a healthchecks.io URL on every pass (every 2 min) and healthchecks.io alerts you when the pings STOP. If the PC is up but
the API, MinIO or Docker is down, it pings `<url>/fail` instead (instant alert).
1. Create a free account at healthchecks.io -> Add Check: name `Vireon PC`, Period `5 minutes`, Grace `5 minutes`. Copy the ping URL.
2. Integrations -> add *ntfy* (same topic as in `.deploy\ntfy-topic.txt`) so it reaches your phone like the other alerts (email works too).
3. On the PC: `Set-Content 'C:\Programs\Video Generation\vireon-prod\.deploy\healthcheck-url.txt' '<ping URL>'` (gitignored; treat the URL like a password).
4. Test: `powershell -File deploy\watchdog.ps1 -Test` (also pings), then check the check turned green. Remove the file to turn it off.

## 8c. Backups and restore
`deployackup.ps1` runs nightly at 03:00 (task `VireonBackup`; runs at next start if the PC was off) and writes to
`E:\VireonBackups` (a different physical disk than MinIO's `D:`; the whole set is ~0.5 GB):
- `mongoireon-<date>.archive.gz`: Atlas dump, newest 14 kept. Needs Docker running (uses the `mongo:7` image).
- `minio\`: copy of `D:\Programs\minio-data`. Copy-only, **never deletes**, so a video deleted in the app can still be recovered here
  (the folder only grows; clean it by hand if needed).
Failures alert via ntfy; the watchdog also alerts if no successful backup for 36 h. Log: `.deployackup.log`. Run now: `deployackup.ps1`.
Not covered: E:/D: are inside this one PC (fire, theft, power surge). Copy `E:\VireonBackups` to an external drive now and then.

**Restore MongoDB** (into Atlas; only do this deliberately, it overwrites matching documents):
```powershell
$env:RESTORE_URI = '<your Atlas URI>'   # not saved anywhere
docker run --rm -e RESTORE_URI -v "E:\VireonBackups\mongo:/backup:ro" mongo:7 sh -c 'mongorestore --uri=$RESTORE_URI --archive=/backup/<file>.archive.gz --gzip --drop'
```
Test a backup without touching Atlas: restore into a throwaway `docker run -d --name t mongo:7` and count documents (done on 2026-10-02: 12 video jobs matched).

**Restore media:** stop MinIO (`Stop-ScheduledTask VireonMinio`, then end `minio.exe`), copy `E:\VireonBackups\minio` back over
`D:\Programs\minio-data` with `robocopy E:\VireonBackups\minio D:\Programs\minio-data /E`, then `Start-ScheduledTask VireonMinio`.

## 8d. Image generation (ComfyUI)
Scene images (workers) and **Image Studio** (`/images`, runs inside the API container) both use ComfyUI with the
Qwen-Image 2.1 workflow (`backend/workflows/qwen-image-2.1.api.json`).
- ComfyUI is the scheduled task **`VireonComfyUI`** (registered by `install-workers.ps1`, restarted by the watchdog). It
  reuses Comfy Desktop's Python env and model folders, listens on **127.0.0.1:8188 only** and has no `--enable-manager`.
  The API container reaches it at `host.docker.internal:8188`: Docker Desktop forwards that to the host's *loopback*, so
  ComfyUI is never exposed to the LAN and no firewall rule is needed.
- API container: `COMFYUI_*`, `IMAGE_*` and `GPU_COORDINATOR=redis` are set in `docker-compose.yml`. The container cannot
  start ComfyUI (`COMFYUI_AUTO_START=false`); if the task is down, Image Studio shows an error and the watchdog alerts.
- Native workers: `backend/.env` needs `COMFYUI_ENABLED=true`, `IMAGE_WORKFLOW_PATH` (absolute path to the workflow in this
  checkout), `IMAGE_STEPS/CFG/SAMPLER/SCHEDULER`, and `GPU_COORDINATOR=redis`. `COMFYUI_START_COMMAND`/`COMFYUI_WORKDIR`
  let a worker start ComfyUI itself if the task is down.
- **One 6 GB card is shared** by Ollama, TTS, ComfyUI and Remotion. `GPU_COORDINATOR=redis` must be set in BOTH the API
  container and the worker `.env`; otherwise Image Studio can load ComfyUI while a worker has a model loaded and the card OOMs.
- Speed on the RTX 2060: Fast ~40 s, Standard ~55 s, High ~75 s per 16:9 image; an "Avoid" prompt adds ~50%.
- Don't run Comfy Desktop at the same time as the task if you can avoid it: both want the GPU and port 8188.

## 9. Troubleshooting
- **Videos/audio show 502 Bad Gateway on `/media/...`:** MinIO is not running. It is the `VireonMinio` scheduled task
  (starts at logon, ~10 s to come up). Check `Get-ScheduledTask VireonMinio`, then `Start-ScheduledTask VireonMinio`.
- **Images not loading / 404 on `/media`:** MinIO must be running on `:9000`; the object path
  must be in `vireon-scenes|video|cache`. Windows Firewall may block Docker→host:9000 — allow
  inbound TCP 9000 for the Docker (vEthernet) profile only.
- **Backend unhealthy:** `docker compose logs backend`. Usual causes: Atlas IP allow-list
  (add your home IP or 0.0.0.0/0 for free tier), wrong `MONGODB_URI`, Redis not up.
- **Rate-limit hits for everyone:** `trust proxy` is set in production; ensure `NODE_ENV=production`.
- **Terminal windows pop up / flash on Windows:** Task Scheduler starting `powershell.exe` or `node.exe` opens a console, which on
  Windows 11 (Windows Terminal as default terminal) is a visible window - a flash every 1-2 minutes for the watchdog and deploy poller,
  and a permanent window for each worker. `-WindowStyle Hidden` does not help (it hides the window only after it appeared). All Vireon
  tasks therefore launch through `deployun-hidden.vbs` (`wscript.exe //B`, window style 0). Re-run `deploy\install-workers.ps1`
  to re-register them; a plain `powershell.exe`/`node.exe` action in Task Scheduler brings the windows back.
- **UI warns "course worker not running" / new jobs never start:** the workers and the API are on different Redis servers.
  Cause seen on 2026-10-02: after a reboot the worker started before Docker, saw no Redis and spawned its own native
  `redis-server.exe`; Docker's Redis then bound `127.0.0.1:6379` and the workers kept using the stray one (via `::1`).
  Check: `Get-NetTCPConnection -LocalPort 6379 -State Listen` must show ONLY Docker (`com.docker.backend` on 127.0.0.1);
  `Get-Process redis-server` must return nothing. Fix: `Stop-Process -Name redis-server`, then restart both worker tasks.
  Prevention (already in place): worker `.env` has `REDIS_HOST=127.0.0.1` and `REDIS_AUTOSTART=false`, and the watchdog
  alerts on a stray Redis or a missing course worker.
- **Do not run the dev stack (`npm run dev`) on this PC while production is up:** its API/workers would use the same
  Docker Redis (127.0.0.1:6379) and compete with the production workers for jobs. Stop the production tasks first, or give dev its own Redis port.
- **Workers can't reach Redis:** the compose Redis publishes `127.0.0.1:6379` — check no other
  Redis holds the port.
- **API health page shows Ollama/TTS offline:** the API container reaches them at
  `host.docker.internal`; Ollama binds 127.0.0.1 by default. This only affects the status
  display — workers (native) talk to them directly.
- **Tailscale 'certificate' errors:** enable HTTPS Certificates in the admin console DNS page.
- **PC rebooted:** Docker Desktop + the three scheduled tasks start at logon. Enable Windows
  auto-login if the PC is unattended.

## 10. Security considerations
- No auth in the app → keep access private (Tailscale Serve). Build login before any public exposure.
- Redis and Mongo are not reachable from your LAN (Redis bound to loopback; Mongo is Atlas with IP allow-list).
- MinIO is still bound to all interfaces by `start-minio.ps1` (`:9000`, `:9001`). Block inbound
  9000/9001 from LAN in Windows Firewall, or change the console to `127.0.0.1:9001`.
- Rotate the MinIO root credentials if they were ever shared; rotate `TS_AUTHKEY` after first use
  if it was reusable.
- `.env` files, Tailscale state and `.deploy/` are gitignored.
- Containers run the API as non-root; nginx hides its version and limits uploads to 100 MB.

## 11. Keeping it ₹0/month
Docker Desktop (personal use), Tailscale Personal, GitHub Actions + GHCR free tiers, MongoDB Atlas
M0, and all AI/render software run locally for free. Real costs are only electricity and your
existing internet. The only optional purchase is a domain (Cloudflare named tunnel). Free-tier limits
can change — re-check them occasionally.
