<#
 Registers the two BullMQ workers as Windows scheduled tasks that start at
 logon and auto-restart on crash. Run once, in an elevated PowerShell, from
 the production checkout:   powershell -ExecutionPolicy Bypass -File deploy\install-workers.ps1
 Workers stay native (not Docker): they launch Ollama / Qwen3-TTS / MuseTalk /
 ComfyUI / Remotion from local paths and need the GPU.
#>
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $repo 'backend'
$node = (Get-Command node).Source
$user = "$env:USERDOMAIN\$env:USERNAME"

$tasks = @{
  'VireonVideoWorker'  = 'src\workers\videoWorker.js'
  'VireonCourseWorker' = 'src\workers\courseVideoWorker.js'
}
foreach ($name in $tasks.Keys) {
  $action   = New-ScheduledTaskAction -Execute $node -Argument $tasks[$name] -WorkingDirectory $backend
  $trigger  = New-ScheduledTaskTrigger -AtLogOn -User $user
  $settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
  Write-Host "Registered $name"
}

# MinIO (native, holds all generated media): start at logon, auto-restart. Takes ~10s to come up.
$minioScript = 'D:\Programs\minio\start-minio.ps1'
if (Test-Path $minioScript) {
  $mAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$minioScript`"" -WorkingDirectory (Split-Path $minioScript)
  $mSettings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName 'VireonMinio' -Action $mAction -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $user) -Settings $mSettings -Principal (New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited) -Force | Out-Null
  Write-Host 'Registered VireonMinio'
}

# Pull-based deploy poller: every 5 minutes.
$pollAction = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\deploy.ps1`" -Poll" -WorkingDirectory $repo
$pollTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName 'VireonDeployPoll' -Action $pollAction -Trigger $pollTrigger `
  -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew) `
  -Principal (New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited) -Force | Out-Null
Write-Host 'Registered VireonDeployPoll'
Write-Host 'Start workers now:  Start-ScheduledTask VireonVideoWorker; Start-ScheduledTask VireonCourseWorker'
