<#
 Registers every Vireon background job as a Windows scheduled task:
   VireonVideoWorker / VireonCourseWorker  BullMQ workers (start at logon, restart on crash)
   VireonMinio                              MinIO object storage (start at logon)
   VireonComfyUI                            ComfyUI, headless, 127.0.0.1:8188 (start at logon)
   VireonTTS                                Qwen3-TTS (Audio Studio), 127.0.0.1:7860 (start at logon)
   VireonWatchdog                           every 2 min: health checks, auto-restart, alerts
   VireonBackup                             nightly 03:00
   VireonDeployPoll                         every 1 min: pull-based deploy
 Safe to re-run: existing tasks are replaced. Run from the production checkout:
   powershell -ExecutionPolicy Bypass -File deploy\install-workers.ps1
 Workers stay native (not Docker): they launch Ollama / Qwen3-TTS / MuseTalk /
 ComfyUI / Remotion from local paths and need the GPU.

 Every task is launched through deploy\run-hidden.vbs so no terminal window ever
 appears (see that file for why plain powershell.exe / node.exe do not work).
#>
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $repo 'backend'
$node = (Get-Command node).Source
$user = "$env:USERDOMAIN\$env:USERNAME"
$wscript = Join-Path $env:WINDIR 'System32\wscript.exe'
$runHidden = Join-Path $PSScriptRoot 'run-hidden.vbs'
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

# An action that runs `$Program $ProgramArgs` with no visible window.
function New-HiddenAction([string]$Program, [string]$ProgramArgs, [string]$WorkDir) {
  $argLine = "//B //Nologo `"$runHidden`" `"$Program`" $ProgramArgs"
  New-ScheduledTaskAction -Execute $wscript -Argument $argLine -WorkingDirectory $WorkDir
}

# Settings for long-running tasks that must come back after a crash.
function New-ServiceSettings {
  New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
}

function Register([string]$Name, $Action, $Trigger, $Settings) {
  Register-ScheduledTask -TaskName $Name -Action $Action -Trigger $Trigger -Settings $Settings -Principal $principal -Force | Out-Null
  Write-Host "Registered $Name"
}

$psArgs = '-NoProfile -ExecutionPolicy Bypass'

# Workers
$workers = @{
  'VireonVideoWorker'  = 'src\workers\videoWorker.js'
  'VireonCourseWorker' = 'src\workers\courseVideoWorker.js'
}
foreach ($name in $workers.Keys) {
  Register $name (New-HiddenAction $node $workers[$name] $backend) (New-ScheduledTaskTrigger -AtLogOn -User $user) (New-ServiceSettings)
}

# MinIO (native, holds all generated media). Takes ~10 s to come up after logon.
$minioScript = 'D:\Programs\minio\start-minio.ps1'
if (Test-Path $minioScript) {
  Register 'VireonMinio' (New-HiddenAction 'powershell.exe' "$psArgs -File `"$minioScript`"" (Split-Path $minioScript)) `
    (New-ScheduledTaskTrigger -AtLogOn -User $user) (New-ServiceSettings)
}

# ComfyUI (native, headless): scene images in the workers and Image Studio in the API
# container. The container can't launch it, so it is an always-on task, bound to the
# host's loopback only (Docker Desktop forwards host.docker.internal there) - never
# listening on the LAN. It reuses Comfy Desktop's own Python environment and model
# folders, and deliberately has no --enable-manager (no remote custom-node installs).
$comfyRoot = Join-Path $env:LOCALAPPDATA 'Comfy-Desktop\ComfyUI-Installs\Personal'
$comfyPython = Join-Path $comfyRoot 'ComfyUI\.venv\Scripts\python.exe'
$comfyShared = Join-Path $env:LOCALAPPDATA 'Comfy-Desktop\ComfyUI-Shared'
$comfyModels = Get-ChildItem (Join-Path $env:APPDATA 'Comfy Desktop\instance-model-paths') -Filter '*.yaml' -ErrorAction SilentlyContinue | Select-Object -First 1
if ((Test-Path $comfyPython) -and $comfyModels) {
  $comfyArgs = "-s ComfyUI\main.py --listen 127.0.0.1 --port 8188 --extra-model-paths-config `"$($comfyModels.FullName)`" " +
    "--input-directory `"$comfyShared\input`" --output-directory `"$comfyShared\output`""
  Register 'VireonComfyUI' (New-HiddenAction $comfyPython $comfyArgs $comfyRoot) `
    (New-ScheduledTaskTrigger -AtLogOn -User $user) (New-ServiceSettings)
} else {
  Write-Host 'ComfyUI (Comfy Desktop install) not found - VireonComfyUI not registered; image generation stays off.'
}

# Qwen3-TTS (native, always on): Audio Studio runs in the API container, which can't
# launch GPU apps (TTS_AUTO_START=false there), so the server must already be up.
# Gradio binds 127.0.0.1:7860 and Docker Desktop forwards host.docker.internal to it,
# like ComfyUI above. It only loads a model on the first request and the backend's GPU
# manager asks it to unload (/unload_all_models) when idle or when another service
# needs the card, so staying up costs almost no VRAM. The workers reuse it too: they
# only spawn their own copy when nothing answers on :7860.
$ttsRoot = Join-Path (Split-Path $repo) 'local-ai\qwen3-tts'
$ttsPython = Join-Path $ttsRoot 'venv\Scripts\python.exe'
if ((Test-Path $ttsPython) -and (Test-Path (Join-Path $ttsRoot 'app.py'))) {
  Register 'VireonTTS' (New-HiddenAction $ttsPython '-u -X utf8 app.py --log tts-server.log' $ttsRoot) `
    (New-ScheduledTaskTrigger -AtLogOn -User $user) (New-ServiceSettings)
} else {
  Write-Host "Qwen3-TTS not found at $ttsRoot - VireonTTS not registered; Audio Studio stays off."
}

# Watchdog: every 2 minutes.
Register 'VireonWatchdog' (New-HiddenAction 'powershell.exe' "$psArgs -File `"$PSScriptRoot\watchdog.ps1`"" $repo) `
  (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 2)) `
  (New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries)

# Nightly backup at 03:00 (runs at next start if the PC was off).
Register 'VireonBackup' (New-HiddenAction 'powershell.exe' "$psArgs -File `"$PSScriptRoot\backup.ps1`"" $repo) `
  (New-ScheduledTaskTrigger -Daily -At 3am) `
  (New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2))

# Pull-based deploy poller: every minute (a no-change poll is just a git fetch).
Register 'VireonDeployPoll' (New-HiddenAction 'powershell.exe' "$psArgs -File `"$PSScriptRoot\deploy.ps1`" -Poll" $repo) `
  (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1)) `
  (New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew)

Write-Host 'Start workers now:  Start-ScheduledTask VireonVideoWorker; Start-ScheduledTask VireonCourseWorker'
