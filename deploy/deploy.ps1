<#
 Pull-based deploy for the Windows Vireon server. Runs from the PRODUCTION
 checkout (a separate clone from your dev folder), normally via the
 VireonDeployPoll scheduled task every minute.

   deploy.ps1 -Poll              deploy origin/main if CI built images for it
   deploy.ps1 -Tag sha-abc123    deploy a specific image tag
   deploy.ps1 -Rollback          return to the previous good version
   deploy.ps1 -PruneOnly         just clean up old Docker images/cache (also runs after every deploy)

 Safety: images only exist for commits that passed CI (deploy.yml pushes them
 after ci.yml succeeds), so "no image yet" simply means "not ready - skip".
 A failed health check automatically rolls back to the previous version.
#>
param([switch]$Poll, [switch]$Rollback, [string]$Tag, [switch]$Force, [switch]$PruneOnly)
# Continue: native tools (docker, git, npm) write progress to stderr, which 'Stop' would treat as failure.
# Failures are detected via $LASTEXITCODE below.
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
$stateDir = Join-Path $repo '.deploy'
New-Item -ItemType Directory -Force $stateDir | Out-Null
$stateFile = Join-Path $stateDir 'state.json'
$logFile = Join-Path $stateDir 'deploy.log'
$workers = @('VireonVideoWorker', 'VireonCourseWorker')

function Notify([string]$title, [string]$msg, [string]$prio = 'default', [string]$tags = '') {
  $tf = Join-Path $stateDir 'ntfy-topic.txt'
  if (-not (Test-Path $tf)) { return }
  try { Invoke-RestMethod -Method Post -Uri "https://ntfy.sh/$((Get-Content $tf -Raw).Trim())" -Body ([Text.Encoding]::UTF8.GetBytes($msg)) -Headers @{ Title = $title; Priority = $prio; Tags = $tags } -TimeoutSec 15 | Out-Null } catch { }
}
function Log($m) { $l = "$(Get-Date -Format s) $m"; Write-Host $l; Add-Content $logFile $l }
function Load-State { if (Test-Path $stateFile) { Get-Content $stateFile -Raw | ConvertFrom-Json } else { [pscustomobject]@{ current = ''; previous = ''; bad = @() } } }
function Save-State($s) { $s | ConvertTo-Json | Set-Content $stateFile }

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

function Wait-Healthy([int]$seconds = 120) {
  $end = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $end) {
    try { if ((Invoke-RestMethod 'http://127.0.0.1:8080/health' -TimeoutSec 5 -ErrorAction Stop).status -eq 'ok') { return $true } } catch {}
    Start-Sleep 3
  }
  return $false
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

function Apply([string]$tag, [string]$sha) {
  Log "Deploying $tag"
  $env:IMAGE_TAG = $tag
  docker compose pull backend frontend
  if ($LASTEXITCODE -ne 0) { throw "image $tag not available" }
  if ($sha) {
    git checkout --quiet --force $sha
    if ($LASTEXITCODE -ne 0) { throw "git checkout $sha failed" }
  }
  if (git diff --name-only HEAD@{1} HEAD 2>$null | Select-String 'package-lock.json') {
    Log 'Lockfile changed - npm ci'
    npm ci --prefix backend --omit=dev
    npm ci --workspace=backend/remotion --include-workspace-root=false
  }
  docker compose up -d --remove-orphans
  if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed' }
  Stop-Workers
  Start-Sleep 3
  foreach ($w in $workers) { Start-ScheduledTask $w -ErrorAction SilentlyContinue }
  if (-not (Wait-Healthy)) { throw 'health check failed' }
}

$state = Load-State
try {
  if ($PruneOnly) { Prune-Docker @($state.current, $state.previous); exit 0 }

  if ($Rollback) {
    if (-not $state.previous) { throw 'no previous version recorded' }
    Log "Manual rollback to $($state.previous)"
    Apply $state.previous ($state.previous -replace '^sha-', '')
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
  $sha = $Tag -replace '^sha-', ''

  if (-not $Force -and (Active-Jobs) -gt 0) { Log 'Render jobs active - deferring deploy'; exit 0 }

  # Image missing = CI not finished/failed for this commit: skip quietly.
  $env:IMAGE_TAG = $Tag
  docker compose pull backend frontend 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { if ($Poll) { exit 0 } else { throw "image $Tag not available" } }

  $prev = $state.current
  try {
    Apply $Tag $sha
    $state.previous = $prev; $state.current = $Tag
    Save-State $state; Log "Deploy OK: $Tag"; Prune-Docker @($Tag, $prev); Notify 'Vireon deployed' "Now running $($Tag.Substring(0,[Math]::Min(14,$Tag.Length)))" 'low' 'rocket'
  } catch {
    Log "DEPLOY FAILED ($($_.Exception.Message)) - rolling back to '$prev'"
    $state.bad = @($state.bad) + $Tag
    if ($prev) {
      try { Apply $prev ($prev -replace '^sha-', ''); Log "Rolled back to $prev" } catch { Log "ROLLBACK ALSO FAILED: $($_.Exception.Message)" }
    }
    Notify 'Vireon deploy FAILED' "Deploy of $($Tag.Substring(0,[Math]::Min(14,$Tag.Length))) failed: $($_.Exception.Message). Rolled back to previous version if one existed." 'high' 'warning'
    Save-State $state; exit 1
  }
} catch { Log "ERROR: $($_.Exception.Message)"; exit 1 }
