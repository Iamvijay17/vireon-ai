<#
 Nightly backup (scheduled task VireonBackup, 03:00; runs missed jobs at next start).
   1. MongoDB Atlas -> gzip archive (mongodump inside the mongo:7 Docker image;
      the URI is passed via environment, never on a command line or in logs)
   2. MinIO data (generated audio/video) -> mirrored copy, NEVER deleting from
      the backup, so an accidental delete in the app can still be recovered
   3. keeps the newest -Keep Mongo archives; alerts via ntfy on any failure
 Backup target should be a different physical disk than the data (default E:).

   deploy\backup.ps1                run now
   deploy\backup.ps1 -Dest F:\Bk    other target
 Restore: see DEPLOYMENT.md "Backups and restore".
#>
param([string]$Dest = 'E:\VireonBackups', [int]$Keep = 14, [string]$MinioData = 'D:\Programs\minio-data')
$ErrorActionPreference = 'Continue'
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$repo = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $repo '.deploy'
New-Item -ItemType Directory -Force $stateDir | Out-Null
$log = Join-Path $stateDir 'backup.log'
function Log($m) { $l = "$(Get-Date -Format s) $m"; Write-Host $l; Add-Content $log $l }
function Notify([string]$title, [string]$msg, [string]$prio = 'high', [string]$tags = 'warning') {
  $tf = Join-Path $stateDir 'ntfy-topic.txt'
  if (-not (Test-Path $tf)) { return }
  try { Invoke-RestMethod -Method Post -Uri "https://ntfy.sh/$((Get-Content $tf -Raw).Trim())" -Body ([Text.Encoding]::UTF8.GetBytes($msg)) -Headers @{ Title = $title; Priority = $prio; Tags = $tags } -TimeoutSec 15 | Out-Null } catch { }
}
function Fail([string]$why) { Log "FAILED: $why"; Notify 'Vireon backup FAILED' $why; exit 1 }

if (-not (Test-Path (Split-Path -Qualifier $Dest))) { Fail "Backup drive $(Split-Path -Qualifier $Dest) not found" }
$mongoDir = Join-Path $Dest 'mongo'
$minioDir = Join-Path $Dest 'minio'
New-Item -ItemType Directory -Force $mongoDir, $minioDir | Out-Null

# --- 1. MongoDB -----------------------------------------------------------------
$uri = $null
foreach ($l in Get-Content (Join-Path $repo '.env')) { if ($l -match '^MONGODB_URI=(.*)$') { $uri = $Matches[1].Trim().Trim('"').Trim("'") } }
if (-not $uri) { Fail 'MONGODB_URI not found in .env' }
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$name = "vireon-$stamp.archive.gz"
$env:BACKUP_MONGODB_URI = $uri
# `$ is escaped so the shell INSIDE the container expands the variable, not PowerShell
$cmd = "mongodump --uri=`$BACKUP_MONGODB_URI --archive=/backup/$name --gzip --quiet"
docker run --rm -e BACKUP_MONGODB_URI -v "${mongoDir}:/backup" mongo:7 sh -c $cmd 2>&1 | ForEach-Object { Log "mongodump: $_" }
$code = $LASTEXITCODE
Remove-Item Env:\BACKUP_MONGODB_URI -ErrorAction SilentlyContinue
$file = Join-Path $mongoDir $name
if ($code -ne 0 -or -not (Test-Path $file) -or (Get-Item $file).Length -lt 1KB) { Remove-Item $file -ErrorAction SilentlyContinue; Fail "mongodump failed (exit $code)" }
Log ("MongoDB backup ok: $name ({0:N2} MB)" -f ((Get-Item $file).Length / 1MB))
Get-ChildItem $mongoDir -Filter 'vireon-*.archive.gz' | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep | ForEach-Object { Remove-Item $_.FullName -Force; Log "pruned $($_.Name)" }

# --- 2. MinIO media ---------------------------------------------------------------
if (-not (Test-Path $MinioData)) { Fail "MinIO data folder $MinioData not found" }
robocopy $MinioData $minioDir /E /XO /R:2 /W:5 /XD 'tmp' /NFL /NDL /NJH /NP /NS /NC 2>&1 | ForEach-Object { if ($_ -match '\S') { Log "robocopy: $_" } }
if ($LASTEXITCODE -ge 8) { Fail "robocopy failed (exit $LASTEXITCODE)" }   # 0-7 = success variants
$mb = [math]::Round(((Get-ChildItem $minioDir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum) / 1MB, 1)
Log "MinIO backup ok: $mb MB mirrored"

Set-Content (Join-Path $stateDir 'last-backup.txt') (Get-Date -Format s)
Log 'Backup complete'
