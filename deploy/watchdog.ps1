<#
 Vireon watchdog. Runs every 2 minutes (scheduled task VireonWatchdog).
   - restarts stopped MinIO / worker scheduled tasks
   - checks API health, Docker containers, Tailscale, disk space, failed or
     stuck video jobs
   - sends a phone/desktop push via ntfy.sh on problems AND on recovery
 Dead-man's switch (optional): if .deploy\healthcheck-url.txt holds a
 healthchecks.io ping URL, every pass pings it (or <url>/fail when the API,
 MinIO or Docker is down). The watchdog cannot report that the PC itself is
 off; healthchecks.io notices the pings STOPPING and alerts you instead.
 Alert channel: the topic name in .deploy\ntfy-topic.txt (treat it like a
 password: anyone who knows it can read/post). Messages never contain secrets.
   deploy\watchdog.ps1 -Test     send a test notification and exit
#>
param([switch]$Test)
$ErrorActionPreference = 'Continue'
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$repo = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $repo '.deploy'
New-Item -ItemType Directory -Force $stateDir | Out-Null
$topicFile = Join-Path $stateDir 'ntfy-topic.txt'
$pingFile = Join-Path $stateDir 'healthcheck-url.txt'
$stateFile = Join-Path $stateDir 'watchdog-state.json'
$api = 'http://127.0.0.1:8080'

function Notify([string]$title, [string]$msg, [string]$prio = 'default', [string]$tags = '') {
  if (-not (Test-Path $topicFile)) { return }
  $topic = (Get-Content $topicFile -Raw).Trim()
  try {
    Invoke-RestMethod -Method Post -Uri "https://ntfy.sh/$topic" -Body ([Text.Encoding]::UTF8.GetBytes($msg)) `
      -Headers @{ Title = $title; Priority = $prio; Tags = $tags } -TimeoutSec 15 | Out-Null
  } catch { }
}

# Pings the dead-man's switch. -Fail marks this run as "PC is up but Vireon is not".
function Ping-DeadMansSwitch([switch]$Fail) {
  if (-not (Test-Path $pingFile)) { return }
  $url = (Get-Content $pingFile -Raw).Trim().TrimEnd('/')
  if (-not $url) { return }
  if ($Fail) { $url += '/fail' }
  try { Invoke-RestMethod -Uri $url -TimeoutSec 10 | Out-Null } catch { }
}

if ($Test) {
  Notify 'Vireon test' 'Alerts are working.' 'default' 'white_check_mark'
  Ping-DeadMansSwitch
  Write-Host ('sent (dead-man switch ping: ' + $(if (Test-Path $pingFile) { 'yes' } else { 'not configured' }) + ')')
  exit 0
}

# --- state -----------------------------------------------------------------
$state = @{ fails = @{}; alerted = @{}; seenFailedJobs = @(); stuckAlerted = @() }
if (Test-Path $stateFile) {
  try {
    $raw = Get-Content $stateFile -Raw | ConvertFrom-Json
    foreach ($k in $raw.fails.PSObject.Properties) { $state.fails[$k.Name] = [int]$k.Value }
    foreach ($k in $raw.alerted.PSObject.Properties) { $state.alerted[$k.Name] = [bool]$k.Value }
    $state.seenFailedJobs = @($raw.seenFailedJobs)
    $state.stuckAlerted = @($raw.stuckAlerted)
  } catch { }
}
$firstRun = -not (Test-Path $stateFile)

# Report a condition: alert after 2 consecutive failures, and again on recovery.
function Report([string]$name, [string]$problem) {
  if ($problem) {
    $state.fails[$name] = 1 + [int]$state.fails[$name]
    if ($state.fails[$name] -ge 2 -and -not $state.alerted[$name]) {
      $state.alerted[$name] = $true
      Notify "Vireon: $name DOWN" $problem 'high' 'rotating_light'
    }
  } else {
    if ($state.alerted[$name]) { Notify "Vireon: $name recovered" "$name is OK again." 'default' 'white_check_mark' }
    $state.fails[$name] = 0
    $state.alerted[$name] = $false
  }
}

# --- 1. scheduled tasks: restart if not running ----------------------------
foreach ($t in 'VireonMinio', 'VireonVideoWorker', 'VireonCourseWorker') {
  $task = Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
  if (-not $task) { continue }
  if ($task.State -ne 'Running') {
    Start-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
    Notify "Vireon: $t restarted" "$t was not running; the watchdog restarted it." 'default' 'wrench'
  }
}

# --- 2. API health through nginx -------------------------------------------
$p = $null
try { if ((Invoke-RestMethod "$api/health" -TimeoutSec 8 -ErrorAction Stop).status -ne 'ok') { $p = 'API /health is not ok' } }
catch { $p = 'API/nginx not responding on port 8080' }
Report 'API' $p

# --- 3. MinIO ---------------------------------------------------------------
$p = $null
try { Invoke-WebRequest 'http://127.0.0.1:9000/minio/health/live' -UseBasicParsing -TimeoutSec 8 -ErrorAction Stop | Out-Null }
catch { $p = 'MinIO not responding: videos and audio will fail (502).' }
Report 'MinIO' $p

# --- 4. Docker containers ---------------------------------------------------
$p = $null
$rows = @(docker ps -a --filter 'name=vireon-' --format '{{.Names}}|{{.Status}}' 2>$null)
if ($LASTEXITCODE -ne 0 -or $rows.Count -lt 3) { $p = 'Docker is down or containers are missing.' }
else {
  $bad = @($rows | Where-Object { $_ -notmatch '\(healthy\)' } | ForEach-Object { ($_ -split '\|')[0] })
  if ($bad.Count -gt 0) { $p = 'Unhealthy containers: ' + ($bad -join ', ') }
}
Report 'Docker' $p

# --- 5. Tailscale -----------------------------------------------------------
$p = $null
try {
  $ts = & 'C:\Program Files\Tailscale\tailscale.exe' status --json 2>$null | ConvertFrom-Json
  if ($ts.BackendState -ne 'Running') { $p = "Tailscale is $($ts.BackendState): remote access is down." }
} catch { $p = 'Tailscale status unavailable.' }
Report 'Tailscale' $p

# --- 6. Disk space ----------------------------------------------------------
foreach ($d in 'C', 'D') {
  $disk = Get-PSDrive -Name $d -ErrorAction SilentlyContinue
  if ($disk) {
    $freeGb = [math]::Round($disk.Free / 1GB, 1)
    $p = $null
    if ($freeGb -lt 10) { $p = "Drive ${d}: only $freeGb GB free." }
    Report "Disk $d" $p
  }
}

# --- 6b. Backup freshness ---------------------------------------------------
$lb = Join-Path $stateDir 'last-backup.txt'
$p = $null
if (Test-Path $lb) {
  $age = (New-TimeSpan -Start ([datetime](Get-Content $lb -Raw).Trim()) -End (Get-Date)).TotalHours
  if ($age -gt 36) { $p = "Last successful backup was $([int]$age) hours ago." }
} else { $p = 'No successful backup recorded yet.' }
Report 'Backup' $p

# --- 7. Failed / stuck video jobs ------------------------------------------
try {
  $jobs = (Invoke-RestMethod "$api/api/videos?limit=30" -TimeoutSec 15 -ErrorAction Stop).jobs
  $failedNow = @($jobs | Where-Object { $_.status -eq 'FAILED' })
  foreach ($j in $failedNow) {
    if ($state.seenFailedJobs -notcontains $j._id) {
      if (-not $firstRun) {
        $msg = "Job $($j._id) failed"
        if ($j.error.message) { $msg += ': ' + $j.error.message }
        Notify 'Vireon: video job failed' $msg 'high' 'x'
      }
      $state.seenFailedJobs += $j._id
    }
  }
  $state.seenFailedJobs = @($state.seenFailedJobs | Select-Object -Last 200)

  $busy = 'SCRIPT_GENERATION', 'GENERATING_AUDIO', 'GENERATING_AVATAR', 'GENERATING_IMAGES', 'PREPARING_ASSETS', 'RENDERING', 'UPLOADING'
  foreach ($j in ($jobs | Where-Object { $busy -contains $_.status -and $_.updatedAt })) {
    $age = (New-TimeSpan -Start ([datetime]$j.updatedAt).ToUniversalTime() -End (Get-Date).ToUniversalTime()).TotalMinutes
    if ($age -gt 45 -and $state.stuckAlerted -notcontains $j._id) {
      Notify 'Vireon: job may be stuck' "Job $($j._id) has been in $($j.status) for $([int]$age) min with no update." 'high' 'hourglass'
      $state.stuckAlerted += $j._id
    }
  }
  $state.stuckAlerted = @($state.stuckAlerted | Select-Object -Last 100)
} catch { }

# --- 8. Dead-man's switch ----------------------------------------------------
# Healthy = what users need works right now. Disk/Tailscale/backup problems
# alert through ntfy but don't make the PC count as "dead".
if (($state.fails['API'] -eq 0) -and ($state.fails['MinIO'] -eq 0) -and ($state.fails['Docker'] -eq 0)) {
  Ping-DeadMansSwitch
} else {
  Ping-DeadMansSwitch -Fail
}

$state | ConvertTo-Json -Depth 4 | Set-Content $stateFile
