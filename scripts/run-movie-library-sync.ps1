[CmdletBinding()]
param(
    [string]$LibraryRoot = 'C:\Users\kylet\OneDrive\Desktop\Movie downloads'
)

$ErrorActionPreference = 'Stop'
$normalizer = Join-Path $PSScriptRoot 'normalize-movie-library.ps1'
& powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $normalizer -LibraryRoot $LibraryRoot -Apply -FolderizeMovies -OrganizeSeries
if ($LASTEXITCODE -ne 0) { throw "Movie library normalization failed with exit code $LASTEXITCODE." }

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    & node scripts/sync-jellyfin-metadata.mjs
    if ($LASTEXITCODE -ne 0) { throw "Jellyfin metadata sync failed with exit code $LASTEXITCODE." }
} finally {
    Pop-Location
}
