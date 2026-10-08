<#
 Pull-based deploy for the Windows Vireon server. Runs from the PRODUCTION
 checkout (a separate clone from your dev folder), normally via the
 VireonDeployPoll scheduled task every minute.

   deploy.ps1 -Poll                    deploy origin/main if CI built images for it
   deploy.ps1 -Tag sha-<40 hex>        deploy a specific immutable image tag
   deploy.ps1 -Rollback                return to the previous good version
   deploy.ps1 -PruneOnly               just clean up old Docker images/cache (also runs after every deploy)

 Immutable deploys: production only ever runs sha-<full commit> image tags
 (never `latest`). Backend and frontend are always pulled for the SAME commit;
 if either image is missing the deploy is skipped, and both images' OCI
 revision label must match the commit before anything is replaced.

 Verified deploys: a deploy counts as successful only after (1) backend,
 frontend and redis containers are running and healthy on the expected image
 tag, (2) GET /health, /api/version (commit) and the frontend page answer through
 nginx, and (3) nothing restarted or went unhealthy during a short stability
 window (-StabilitySec).

 Automatic rollback: if the new version fails to start, fails verification or
 crashes during the window, the previous known-good tag (state.json) is restored
 and verified the same way. A failed commit is remembered and not retried.

 State (.deploy/, gitignored):
   state.json      current / previous / bad tags, last failure
   manifest.json   what is running now: commit, images (+digests), version,
                   build timestamp, deploy time, previous commit
   deploy.log      every step; secrets are redacted
 Safety: images only exist for commits that passed CI (deploy.yml pushes them
 after ci.yml succeeds), so "no image yet" simply means "not ready - skip".

 -SkipWorkers / -SkipPrune / -BaseUrl exist for the deploy self-test on a
 machine that has a real stack running; leave them alone in production.
#>
param(
  [switch]$Poll, [switch]$Rollback, [string]$Tag, [switch]$Force, [switch]$PruneOnly,
  [string]$BaseUrl = 'http://127.0.0.1:8080',
  [int]$HealthTimeoutSec = 180,
  [int]$StabilitySec = 30,
  [switch]$SkipWorkers, [switch]$SkipPrune
)
# Continue: native tools (docker, git, npm) write progress to stderr, which 'Stop' would treat as failure.
# Failures are detected via $LASTEXITCODE below.
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
$stateDir = Join-Path $repo '.deploy'
New-Item -ItemType Directory -Force $stateDir | Out-Null
$stateFile = Join-Path $stateDir 'state.json'
$manifestFile = Join-Path $stateDir 'manifest.json'
$logFile = Join-Path $stateDir 'deploy.log'
$workers = @('VireonVideoWorker', 'VireonCourseWorker')
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# Anything that could carry a secret is masked before it reaches the log, the
# console or a push notification: user:password@ in URLs (MongoDB URI, Redis)
# and KEY=value / "key": "value" pairs for password-like keys.
function Redact([string]$s) {
  if (-not $s) { return $s }
  $s = [regex]::Replace($s, '(?i)([a-z][a-z0-9+.\-]*://)[^/\s:@]+:[^@\s/]+@', '$1***:***@')
  $s = [regex]::Replace($s, '(?i)\b(pass(?:word|wd)?|secret|token|authkey|api[_-]?key|access[_-]?key|credential|MONGODB_URI)(["'']?\s*[=:]\s*["'']?)[^\s"'',;&]+', '$1$2***')
  return $s
}
function Log($m) { $l = Redact "$(Get-Date -Format s) $m"; Write-Host $l; Add-Content $logFile $l }
function Notify([string]$title, [string]$msg, [string]$prio = 'default', [string]$tags = '') {
  $tf = Join-Path $stateDir 'ntfy-topic.txt'
  if (-not (Test-Path $tf)) { return }
  try { Invoke-RestMethod -Method Post -Uri "https://ntfy.sh/$((Get-Content $tf -Raw).Trim())" -Body ([Text.Encoding]::UTF8.GetBytes((Redact $msg))) -Headers @{ Title = $title; Priority = $prio; Tags = $tags } -TimeoutSec 15 | Out-Null } catch { }
}

# Write to a temp file and rename, so a crash or power cut can never leave a
# half-written state.json (which would lose the rollback target).
function Save-Json($obj, [string]$path) {
  $tmp = "$path.tmp"
  [IO.File]::WriteAllText($tmp, ($obj | ConvertTo-Json -Depth 6), $utf8NoBom)
  Move-Item -Force $tmp $path
}
function Load-State {
  $s = $null
  if (Test-Path $stateFile) { try { $s = Get-Content $stateFile -Raw | ConvertFrom-Json } catch { Log "state.json unreadable ($($_.Exception.Message)) - starting from empty state" } }
  if (-not $s) { $s = [pscustomobject]@{} }
  foreach ($k in 'current', 'previous') { if ($s.PSObject.Properties.Name -notcontains $k) { $s | Add-Member -NotePropertyName $k -NotePropertyValue '' } }
  if ($s.PSObject.Properties.Name -notcontains 'bad') { $s | Add-Member -NotePropertyName bad -NotePropertyValue @() }
  if ($s.PSObject.Properties.Name -notcontains 'lastFailure') { $s | Add-Member -NotePropertyName lastFailure -NotePropertyValue $null }
  return $s
}
function Save-State($s) { Save-Json $s $stateFile }

# Only an immutable commit tag may be deployed. `latest` (or any other mutable
# tag) is refused so production can never drift to "whatever was pushed last".
function Assert-ShaTag([string]$tag) {
  if ($tag -notmatch '^sha-[0-9a-f]{40}$') {
    throw "refusing to deploy tag '$tag': production deploys immutable sha-<40 hex commit> tags only (never 'latest')"
  }
}

# Every deploy pulls a new pair of images and leaves the previous ones behind;
# on a PC whose C: drive is small that adds up. Keep only the version running
# now, the previous one (the rollback target) and `latest`; remove the other
# Vireon sha-tagged images, dangling layers and week-old build cache. Targeted
# on purpose: never `docker image prune -a`, which would also delete mongo:7
# (needed by the nightly backup) and other images that are merely idle.
function Prune-Docker([string[]]$keepTags) {
  # Housekeeping must never fail a deploy (it runs inside the deploy's try/catch).
  try {
  $keep = @($keepTags | Where-Object { $_ }) + 'latest'
  $before = (Get-PSDrive C).Free
  $refs = @(docker image ls --format '{{.Repository}}:{{.Tag}}' 2>$null | Where-Object { $_ -match '/vireon-(backend|frontend):sha-' })
  foreach ($ref in $refs) {
    $tag = $ref.Substring($ref.LastIndexOf(':') + 1)
    if ($keep -notcontains $tag) {
      docker image rm $ref 2>&1 | Out-Null   # refuses (harmlessly) if a container still uses it
      if ($LASTEXITCODE -eq 0) { Log "pruned image $ref" }
    }
  }
  docker image prune -f 2>&1 | Out-Null
  docker builder prune -f --filter 'until=168h' 2>&1 | Out-Null
  $freed = [math]::Round(((Get-PSDrive C).Free - $before) / 1MB)
  Log "Docker cleanup done (C: free changed by $freed MB; Docker may release its disk file lazily)"
  } catch { Log "Docker cleanup skipped: $($_.Exception.Message)" }
}

# --- images -------------------------------------------------------------------
# The refs compose will run for $tag (docker-compose.yml: ghcr.io/<owner>/vireon-*:<IMAGE_TAG>).
function Get-ImageRefs([string]$tag) {
  $env:IMAGE_TAG = $tag
  $imgs = @(docker compose config --images 2>$null)
  [pscustomobject]@{
    Backend  = ($imgs | Where-Object { $_ -match '/vireon-backend:' } | Select-Object -First 1)
    Frontend = ($imgs | Where-Object { $_ -match '/vireon-frontend:' } | Select-Object -First 1)
  }
}
function Get-ImageInfo([string]$ref) {
  if (-not $ref) { return $null }
  $raw = docker image inspect $ref --format '{{index .Config.Labels "org.opencontainers.image.revision"}}|{{index .Config.Labels "org.opencontainers.image.version"}}|{{index .Config.Labels "org.opencontainers.image.created"}}|{{json .RepoDigests}}' 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $raw) { return $null }
  $p = ([string]$raw).Trim() -split '\|', 4
  $digest = ''
  try { $d = @($p[3] | ConvertFrom-Json); if ($d.Count -gt 0) { $digest = [string]$d[0] } } catch { }
  [pscustomobject]@{ Revision = $p[0]; Version = $p[1]; Created = $p[2]; Digest = $digest }
}
# Backend and frontend must both come from the commit being deployed. Images
# built before revision labels existed (rollback targets from older deploys)
# have none; the sha tag is then the only evidence, which is noted in the log.
function Assert-ImageMatchesCommit([string]$ref, [string]$sha) {
  $info = Get-ImageInfo $ref
  if (-not $info) { throw "image $ref is not present locally after pull" }
  if ($info.Revision -and $info.Revision -ne $sha) { throw "image $ref was built from commit $($info.Revision), expected $sha" }
  if (-not $info.Revision) { Log "note: $ref has no revision label (built before labels were added) - trusting its sha tag" }
}

# Keep IMAGE_TAG in .env at the running immutable tag, so a hand-typed
# `docker compose up -d` stays on the deployed version instead of `latest`.
function Set-EnvImageTag([string]$tag) {
  $envFile = Join-Path $repo '.env'
  if (-not (Test-Path $envFile)) { return }
  try {
    $text = [IO.File]::ReadAllText($envFile)
    if ($text -match '(?m)^IMAGE_TAG=') { $text = [regex]::Replace($text, '(?m)^IMAGE_TAG=[^\r\n]*', "IMAGE_TAG=$tag") }
    else { $text = $text.TrimEnd() + [Environment]::NewLine + "IMAGE_TAG=$tag" + [Environment]::NewLine }
    [IO.File]::WriteAllText($envFile, $text, $utf8NoBom)
  } catch { Log "WARNING: could not update IMAGE_TAG in .env: $($_.Exception.Message)" }
}

# --- verification -------------------------------------------------------------
function Get-ServiceStatus([string]$svc) {
  $id = docker compose ps -a -q $svc 2>$null | Select-Object -First 1
  if (-not $id) { return [pscustomobject]@{ Service = $svc; Found = $false; State = 'missing'; Health = 'none'; Restarts = 0; Image = ''; StartedAt = ''; ExitCode = '' } }
  $raw = docker inspect $id --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.RestartCount}}|{{.Config.Image}}|{{.State.StartedAt}}|{{.State.ExitCode}}' 2>$null
  $p = ([string]$raw).Trim() -split '\|'
  if ($p.Count -lt 6) { return [pscustomobject]@{ Service = $svc; Found = $false; State = 'unknown'; Health = 'none'; Restarts = 0; Image = ''; StartedAt = ''; ExitCode = '' } }
  [pscustomobject]@{ Service = $svc; Found = $true; State = $p[0]; Health = $p[1]; Restarts = [int]$p[2]; Image = $p[3]; StartedAt = $p[4]; ExitCode = $p[5] }
}
function Invoke-Probe([string]$path) {
  try {
    $r = Invoke-WebRequest -Uri "$BaseUrl$path" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    return [pscustomobject]@{ Ok = $true; Status = [int]$r.StatusCode; Body = [string]$r.Content; Error = '' }
  } catch {
    $code = 0
    try { $code = [int]$_.Exception.Response.StatusCode } catch { }
    return [pscustomobject]@{ Ok = $false; Status = $code; Body = ''; Error = $_.Exception.Message }
  }
}
# One verification pass. $baseline (from an earlier passing pass) additionally
# flags containers that restarted since then.
function Test-DeploymentOnce([string]$tag, [string]$sha, $baseline) {
  $problems = @()
  $snap = @{}
  foreach ($svc in 'redis', 'backend', 'frontend') {
    $s = Get-ServiceStatus $svc
    $snap[$svc] = $s
    if (-not $s.Found) { $problems += "${svc}: container missing"; continue }
    if ($s.State -ne 'running') { $problems += "${svc}: state=$($s.State) exitCode=$($s.ExitCode) restarts=$($s.Restarts)"; continue }
    if ($s.Health -ne 'healthy' -and $s.Health -ne 'none') { $problems += "${svc}: docker health=$($s.Health)" }
    if ($svc -ne 'redis' -and -not $s.Image.EndsWith(":$tag")) { $problems += "${svc}: running image '$($s.Image)' is not the expected tag $tag" }
    if ($baseline -and $baseline[$svc]) {
      $b = $baseline[$svc]
      if ($s.Restarts -ne $b.Restarts -or $s.StartedAt -ne $b.StartedAt) { $problems += "${svc}: restarted during verification (restarts $($b.Restarts)->$($s.Restarts))" }
    }
  }

  # Backend, reached the way users reach it: through nginx on the published port.
  $h = Invoke-Probe '/health'
  if (-not $h.Ok) { $problems += "GET /health failed (HTTP $($h.Status)): $($h.Error)" }
  else { try { if ((ConvertFrom-Json $h.Body).status -ne 'ok') { $problems += "GET /health did not report status ok" } } catch { $problems += 'GET /health returned non-JSON' } }

  $ver = $null
  $v = Invoke-Probe '/api/version'
  if (-not $v.Ok) { $problems += "GET /api/version failed (HTTP $($v.Status)): $($v.Error)" }
  else {
    try {
      $ver = ConvertFrom-Json $v.Body
      if (-not $ver.commit -or -not $sha.StartsWith([string]$ver.commit)) { $problems += "backend reports commit '$($ver.commit)', expected $($sha.Substring(0, 7))" }
    } catch { $problems += 'GET /api/version returned non-JSON' }
  }

  # Frontend: the app shell, and (images built since build stamps were added)
  # the commit it was built from. Older images answer /version.json with the
  # SPA index.html, which is not JSON and is simply skipped.
  $f = Invoke-Probe '/'
  if (-not $f.Ok) { $problems += "GET / (frontend) failed (HTTP $($f.Status)): $($f.Error)" }
  elseif ($f.Body -notmatch 'id="root"') { $problems += 'GET / did not return the app shell' }
  $fv = Invoke-Probe '/version.json'
  if ($fv.Ok) {
    $stamp = $null
    try { $stamp = ConvertFrom-Json $fv.Body } catch { }
    if ($stamp -and $stamp.commit -and $stamp.commit -ne $sha) { $problems += "frontend reports commit '$($stamp.commit)', expected $sha" }
  }
  return [pscustomobject]@{ Ok = ($problems.Count -eq 0); Problems = $problems; Snapshot = $snap; Version = $ver }
}
# Wait for the stack to come up healthy (retrying: containers need seconds to
# start), then keep watching for -StabilitySec so a crash loop or a service that
# goes unhealthy right after starting is caught while we can still roll back.
function Wait-DeploymentHealthy([string]$tag, [string]$sha) {
  $deadline = (Get-Date).AddSeconds($HealthTimeoutSec)
  $r = $null
  do {
    $r = Test-DeploymentOnce $tag $sha $null
    if ($r.Ok) { break }
    Start-Sleep 3
  } while ((Get-Date) -lt $deadline)
  if (-not $r.Ok) {
    return [pscustomobject]@{ Ok = $false; Reason = "not healthy after ${HealthTimeoutSec}s: " + ($r.Problems -join '; '); Last = $r }
  }
  Log "Healthy: containers running, /health + /api/version + frontend OK. Watching ${StabilitySec}s for instability"
  $baseline = $r.Snapshot
  $end = (Get-Date).AddSeconds($StabilitySec)
  $strikes = 0
  while ((Get-Date) -lt $end) {
    Start-Sleep 5
    $c = Test-DeploymentOnce $tag $sha $baseline
    if ($c.Ok) { $strikes = 0; $r = $c; continue }
    $strikes++
    $fatal = @($c.Problems | Where-Object { $_ -match 'restarted|state=|missing' })
    if ($fatal.Count -gt 0 -or $strikes -ge 2) {
      return [pscustomobject]@{ Ok = $false; Reason = "became unhealthy during the ${StabilitySec}s verification window: " + ($c.Problems -join '; '); Last = $c }
    }
  }
  return [pscustomobject]@{ Ok = $true; Reason = ''; Last = $r }
}

# Everything an operator needs after a failed deploy, in one block of the log:
# what we tried to deploy, what we fall back to, why it failed, and container state.
function Write-FailureReport([string]$target, [string]$prev, [string]$reason) {
  Log '------------- DEPLOY FAILURE REPORT -------------'
  Log "target sha   : $target"
  Log "previous sha : $(if ($prev) { $prev } else { '(none recorded)' })"
  Log "reason       : $reason"
  Log 'containers   :'
  docker compose ps -a --format '{{.Service}} state={{.State}} status="{{.Status}}" image={{.Image}}' 2>$null | ForEach-Object { Log "  $_" }
  Log 'backend log (last 25 lines, secrets redacted):'
  docker compose logs --no-color --tail 25 backend 2>&1 | ForEach-Object { Log "  | $_" }
  Log '-------------------------------------------------'
}

function Write-Manifest([string]$tag, [string]$prevTag) {
  try {
    $refs = Get-ImageRefs $tag
    $b = Get-ImageInfo $refs.Backend
    $f = Get-ImageInfo $refs.Frontend
    $ver = $script:LastVerification.Version
    $manifest = [ordered]@{
      schema         = 1
      commit         = $tag -replace '^sha-', ''
      tag            = $tag
      version        = $(if ($ver -and $ver.version) { [string]$ver.version } elseif ($b) { $b.Version } else { '' })
      buildTimestamp = $(if ($ver -and $ver.buildDate) { [string]$ver.buildDate } elseif ($b) { $b.Created } else { '' })
      backendImage   = $refs.Backend
      backendDigest  = $(if ($b) { $b.Digest } else { '' })
      frontendImage  = $refs.Frontend
      frontendDigest = $(if ($f) { $f.Digest } else { '' })
      previousCommit = $(if ($prevTag) { $prevTag -replace '^sha-', '' } else { '' })
      deployedAt     = (Get-Date).ToUniversalTime().ToString('o')
    }
    Save-Json $manifest $manifestFile
    Log "manifest written: $manifestFile"
  } catch { Log "WARNING: could not write manifest: $($_.Exception.Message)" }
}

function Active-Jobs {
  $n = 0
  foreach ($q in 'video-rendering', 'course-video-processing') {   # queue names: backend/src/queues
    $c = docker compose exec -T redis redis-cli llen "bull:${q}:active" 2>$null
    if ($c -match '^\d+$') { $n += [int]$c }
  }
  return $n
}

# Stopping a worker task only ends its wscript.exe host (run-hidden.vbs); the
# node.exe worker it started keeps running, orphaned, on the old code. Every
# deploy used to leave one more pair of stale workers on the shared queue. So
# after stopping the tasks, also end the node processes in the form the tasks
# launch them - `node.exe  src\workers\<name>.js` with a backslash and no
# --watch. Dev workers (`node --watch src/workers/...`) never match.
function Stop-Workers {
  foreach ($w in $workers) { Stop-ScheduledTask $w -ErrorAction SilentlyContinue }
  $pattern = '^"?[^"]*node\.exe"?\s+src\\workers\\(videoWorker|courseVideoWorker)\.js\s*$'
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -match $pattern } |
    ForEach-Object {
      $name = if ($_.CommandLine -match $pattern) { $Matches[1] } else { 'worker' }
      Log "Stopping worker process $($_.ProcessId) ($name)"
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

# Set once Apply starts replacing things. A failure before that (image not
# published, label mismatch) changed nothing, so there is nothing to roll back.
$script:Mutated = $false
$script:LastVerification = $null

function Apply([string]$tag) {
  Assert-ShaTag $tag
  $sha = $tag.Substring(4)
  $script:Mutated = $false
  Log "Deploying $tag"
  $env:IMAGE_TAG = $tag
  docker compose pull backend frontend
  if ($LASTEXITCODE -ne 0) { throw "image $tag not available" }
  $refs = Get-ImageRefs $tag
  Assert-ImageMatchesCommit $refs.Backend $sha
  Assert-ImageMatchesCommit $refs.Frontend $sha
  $script:Mutated = $true
  git checkout --quiet --force $sha
  if ($LASTEXITCODE -ne 0) { throw "git checkout $sha failed" }
  if (git diff --name-only HEAD@{1} HEAD 2>$null | Select-String 'package-lock.json') {
    Log 'Lockfile changed - npm ci'
    npm ci --prefix backend --omit=dev
    npm ci --workspace=backend/remotion --include-workspace-root=false
  }
  docker compose up -d --remove-orphans
  if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed' }
  if (-not $SkipWorkers) {
    Stop-Workers
    Start-Sleep 3
    foreach ($w in $workers) { Start-ScheduledTask $w -ErrorAction SilentlyContinue }
  }
  $res = Wait-DeploymentHealthy $tag $sha
  if (-not $res.Ok) { throw $res.Reason }
  $script:LastVerification = $res.Last
  Set-EnvImageTag $tag
  if (-not $SkipWorkers) {
    # Native workers depend on the GPU / MinIO / Ollama, not just on this code,
    # so a stopped worker is reported loudly but does not by itself roll back.
    foreach ($w in $workers) {
      $t = Get-ScheduledTask $w -ErrorAction SilentlyContinue
      if ($t -and $t.State -ne 'Running') { Log "WARNING: worker task $w is '$($t.State)' after the deploy" }
    }
  }
}

$state = Load-State
$lock = New-Object System.Threading.Mutex($false, 'Local\VireonDeploy')
$locked = $false
try {
  # One deploy at a time: a verified deploy takes minutes, and a manual run
  # must not start a second one underneath the scheduled poller.
  $locked = $lock.WaitOne(0)
  if (-not $locked) { Log 'Another deploy is already running - exiting'; exit 0 }

  if ($PruneOnly) { Prune-Docker @($state.current, $state.previous); exit 0 }

  if ($Rollback) {
    if (-not $state.previous) { throw 'no previous version recorded' }
    Assert-ShaTag $state.previous
    Log "Manual rollback to $($state.previous) (from $($state.current))"
    Apply $state.previous
    Write-Manifest $state.previous $state.current
    $state.current, $state.previous = $state.previous, $state.current
    Save-State $state; Log 'Rollback OK'; exit 0
  }

  if ($Poll) {
    git fetch --quiet origin main
    $sha = (git rev-parse origin/main).Trim()
    $Tag = "sha-$sha"
    if ($Tag -eq $state.current -or $state.bad -contains $Tag) { exit 0 }
  }
  if (-not $Tag) { throw 'specify -Poll, -Tag or -Rollback' }
  Assert-ShaTag $Tag
  $sha = $Tag.Substring(4)

  if (-not $Force -and (Active-Jobs) -gt 0) { Log 'Render jobs active - deferring deploy'; exit 0 }

  # Image missing = CI not finished/failed for this commit: skip quietly.
  # Both images must exist for the SAME sha tag, or nothing is deployed.
  $env:IMAGE_TAG = $Tag
  docker compose pull backend frontend 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { if ($Poll) { exit 0 } else { throw "image $Tag not available" } }

  $prev = $state.current
  try {
    Apply $Tag
    Write-Manifest $Tag $prev
    $state.previous = $prev; $state.current = $Tag; $state.lastFailure = $null
    Save-State $state
    Log "Deploy OK: $Tag (previous: $(if ($prev) { $prev } else { 'none' }))"
    if (-not $SkipPrune) { Prune-Docker @($Tag, $prev) }
    Notify 'Vireon deployed' "Now running $($Tag.Substring(0,[Math]::Min(14,$Tag.Length)))" 'low' 'rocket'
  } catch {
    $reason = $_.Exception.Message
    Write-FailureReport $Tag $prev $reason
    $state.bad = @($state.bad | Where-Object { $_ }) + $Tag
    if (-not $script:Mutated) {
      $rollbackResult = 'not needed - nothing had been replaced yet'
    } elseif (-not $prev) {
      $rollbackResult = 'IMPOSSIBLE - no previous version recorded; the failed version is still running'
    } else {
      Log "ROLLING BACK to $prev"
      try {
        Apply $prev
        Write-Manifest $prev ''
        $rollbackResult = "OK - restored and verified $prev"
      } catch {
        $rollbackResult = "FAILED - $($_.Exception.Message)"
        Write-FailureReport $prev '' "rollback verification failed: $($_.Exception.Message)"
      }
    }
    Log "DEPLOY FAILED: $Tag | previous: $(if ($prev) { $prev } else { 'none' }) | rollback: $rollbackResult"
    $state.lastFailure = [pscustomobject]@{ tag = $Tag; previous = $prev; at = (Get-Date).ToUniversalTime().ToString('o'); reason = (Redact $reason); rollback = $rollbackResult }
    Notify 'Vireon deploy FAILED' "Deploy of $($Tag.Substring(0,[Math]::Min(14,$Tag.Length))) failed: $reason. Rollback: $rollbackResult" 'high' 'warning'
    Save-State $state; exit 1
  }
} catch { Log "ERROR: $($_.Exception.Message)"; exit 1 }
finally { if ($locked) { try { $lock.ReleaseMutex() } catch { } } }
