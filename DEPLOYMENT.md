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
npm ci --prefix backend\remotion
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
The `VireonDeployPoll` scheduled task runs `deploy\deploy.ps1 -Poll` every 5 minutes. It:
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
| Deploy | `git push origin main` → wait for CI + ≤5 min (or run `deploy\deploy.ps1 -Poll`) |
| Start | `docker compose --profile tailscale up -d` |
| Restart one service | `docker compose restart backend` |
| Restart workers | `Stop-ScheduledTask VireonVideoWorker; Start-ScheduledTask VireonVideoWorker` |
| Logs | `docker compose logs -f backend` · `.deploy\deploy.log` · `backend\logs\` |
| Health | `curl http://localhost:8080/health` → `{"status":"ok"}`; `docker compose ps` (readiness is the backend container's health) |
| Status of tunnel | `docker compose logs tailscale` |

## 8. Rollback
Every deploy keeps the previous working image tag in `.deploy\state.json`.
- Automatic: failed health check → previous version restored.
- Manual: `powershell -File deploy\deploy.ps1 -Rollback`
- Specific version: `powershell -File deploy\deploy.ps1 -Tag sha-<commit> -Force`
A failed commit is remembered and not retried until a newer commit lands.

## 9. Troubleshooting
- **Images not loading / 404 on `/media`:** MinIO must be running on `:9000`; the object path
  must be in `vireon-scenes|video|cache`. Windows Firewall may block Docker→host:9000 — allow
  inbound TCP 9000 for the Docker (vEthernet) profile only.
- **Backend unhealthy:** `docker compose logs backend`. Usual causes: Atlas IP allow-list
  (add your home IP or 0.0.0.0/0 for free tier), wrong `MONGODB_URI`, Redis not up.
- **Rate-limit hits for everyone:** `trust proxy` is set in production; ensure `NODE_ENV=production`.
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
