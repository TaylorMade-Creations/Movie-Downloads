[CmdletBinding()]
param(
    [string]$LibraryRoot = 'C:\Users\kylet\OneDrive\Desktop\Movie downloads',
    [string]$TaskName = 'Movie Room Library Watcher',
    [int]$IntervalMinutes = 15
)

$ErrorActionPreference = 'Stop'
$syncScript = Join-Path $PSScriptRoot 'wake-movie-library-worker.ps1'
if (-not (Test-Path -LiteralPath $syncScript)) {
    throw "Library worker wake script not found: $syncScript"
}

$shell = (Get-Command pwsh.exe -ErrorAction SilentlyContinue)
if (-not $shell) { $shell = Get-Command powershell.exe -ErrorAction Stop }
$escapedScript = $syncScript.Replace('"', '\"')
$escapedRoot = $LibraryRoot.Replace('"', '\"')
$arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + $escapedScript + '" -LibraryRoot "' + $escapedRoot + '"'
$action = New-ScheduledTaskAction -Execute $shell.Source -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes($IntervalMinutes) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) -RepetitionDuration (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -DontStopOnIdleEnd -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Wakes the Movie Room worker to organize completed downloads, write Jellyfin sidecars, and refresh metadata without deleting source media.' -Force | Out-Null
Write-Output "Installed '$TaskName' to wake the Movie Room worker for $LibraryRoot every $IntervalMinutes minutes."
