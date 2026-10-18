[CmdletBinding()]
param(
    [string]$LibraryRoot = 'C:\Users\kylet\OneDrive\Desktop\Movie downloads',
    [int]$StabilitySeconds = 90,
    [switch]$SkipIncompleteWatcher
)

$ErrorActionPreference = 'Stop'
$logRoot = Join-Path $LibraryRoot '_Recovery\Logs'
$logPath = Join-Path $logRoot 'movie-library-worker-wake.log'
$syncScript = Join-Path $PSScriptRoot 'run-movie-library-sync.ps1'
$incompleteWatcher = Join-Path $PSScriptRoot 'watch-incomplete-movie-downloads.ps1'

if (-not (Test-Path -LiteralPath $logRoot)) {
    New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
}

function Write-WakeLog {
    param(
        [Parameter(Mandatory = $true)][string]$Level,
        [Parameter(Mandatory = $true)][string]$Message
    )

    $line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level.ToUpperInvariant().PadRight(7).Substring(0, 7), $Message
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
    Write-Output $line
}

Write-WakeLog -Level 'START' -Message "Movie library worker wake requested for $LibraryRoot"

if (-not $SkipIncompleteWatcher -and (Test-Path -LiteralPath $incompleteWatcher -PathType Leaf)) {
    Write-WakeLog -Level 'CHECK' -Message 'Checking .incomplete downloads for finished uploads/conversions.'
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $incompleteWatcher -LibraryRoot $LibraryRoot -StabilitySeconds $StabilitySeconds -Once
    if ($LASTEXITCODE -ne 0) {
        Write-WakeLog -Level 'WARN' -Message "Incomplete watcher exited with code $LASTEXITCODE; continuing with library sync."
    }
}

if (-not (Test-Path -LiteralPath $syncScript -PathType Leaf)) {
    throw "Library sync script not found: $syncScript"
}

Write-WakeLog -Level 'SYNC' -Message 'Organizing loose downloads, writing missing sidecars, and refreshing Jellyfin artwork/metadata.'
& powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $syncScript -LibraryRoot $LibraryRoot
if ($LASTEXITCODE -ne 0) {
    throw "Movie library sync failed with exit code $LASTEXITCODE."
}

Write-WakeLog -Level 'DONE' -Message 'Movie library worker wake complete.'
