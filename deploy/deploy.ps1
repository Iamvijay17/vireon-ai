<#
 Pull-based deploy for the Windows Vireon server. Runs from the PRODUCTION
 checkout (a separate clone from your dev folder), normally via the
 VireonDeployPoll scheduled task every 5 minutes.

   deploy.ps1 -Poll              deploy origin/main if CI built images for it
   deploy.ps1 -Tag sha-abc123    deploy a specific image tag
   deploy.ps1 -Rollback          return to the previous good version

 Safety: images only exist for commits that passed CI (deploy.yml pushes them
 after ci.yml succeeds), so "no image yet" simply means "not ready - skip".
 A failed health check automatically rolls back to the previous version.
#>
param([switch]$Poll, [switch]$Rollback, [string]$Tag, [switch]$Force)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
$stateDir = Join-Path $repo '.deploy'
New-Item -ItemType Directory -Force $stateDir | Out-Null
$stateFile = Join-Path $stateDir 'state.json'
$logFile = Join-Path $stateDir 'deploy.log'
$workers = @('VireonVideoWorker', 'VireonCourseWorker')

function Log($m) { $l = "$(Get-Date -Format s) $m"; Write-Host $l; Add-Content $logFile $l }
function Load-State { if (Test-Path $stateFile) { Get-Content $stateFile -Raw | ConvertFrom-Json } else { [pscustomobject]@{ current = ''; previous = ''; bad = @() } } }
function Save-State($s) { $s | ConvertTo-Json | Set-Content $stateFile }

function Wait-Healthy([int]$seconds = 120) {
  $end = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $end) {
    try { if ((Invoke-RestMethod 'http://127.0.0.1:8080/health' -TimeoutSec 5).status -eq 'ok') { return $true } } catch {}
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

function Apply([string]$tag, [string]$sha) {
  Log "Deploying $tag"
  $env:IMAGE_TAG = $tag
  docker compose pull backend frontend
  if ($LASTEXITCODE -ne 0) { throw "image $tag not available" }
  if ($sha) {
    git checkout --quiet $sha
    if ($LASTEXITCODE -ne 0) { throw "git checkout $sha failed" }
  }
  if (git diff --name-only HEAD@{1} HEAD 2>$null | Select-String 'package-lock.json') {
    Log 'Lockfile changed - npm ci'
    npm ci --prefix backend --omit=dev
    if (Test-Path backend\remotion\package.json) { npm ci --prefix backend\remotion }
  }
  docker compose up -d --remove-orphans
  if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed' }
  foreach ($w in $workers) { Stop-ScheduledTask $w -ErrorAction SilentlyContinue }
  Start-Sleep 3
  foreach ($w in $workers) { Start-ScheduledTask $w -ErrorAction SilentlyContinue }
  if (-not (Wait-Healthy)) { throw 'health check failed' }
}

$state = Load-State
try {
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
    Save-State $state; Log "Deploy OK: $Tag"
  } catch {
    Log "DEPLOY FAILED ($($_.Exception.Message)) - rolling back to '$prev'"
    $state.bad = @($state.bad) + $Tag
    if ($prev) {
      try { Apply $prev ($prev -replace '^sha-', ''); Log "Rolled back to $prev" } catch { Log "ROLLBACK ALSO FAILED: $($_.Exception.Message)" }
    }
    Save-State $state; exit 1
  }
} catch { Log "ERROR: $($_.Exception.Message)"; exit 1 }
