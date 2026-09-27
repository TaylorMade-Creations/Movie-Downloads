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
    # Keep every stage pointed at the same OneDrive-backed root that the
    # normalizer used. This prevents metadata/artwork from falling back to a
    # repository-local movies directory when the watcher runs unattended.
    $env:MOVIE_LIBRARY_ROOT = [IO.Path]::GetFullPath($LibraryRoot)
    & node --env-file-if-exists=.env --env-file-if-exists=.env.local --env-file-if-exists=.env.jellyfin.local scripts/sync-jellyfin-metadata.mjs
    if ($LASTEXITCODE -ne 0) { Write-Warning "Jellyfin metadata sync failed with exit code $LASTEXITCODE. Existing sidecars will still be used for artwork." }
    & node --env-file-if-exists=.env --env-file-if-exists=.env.local --env-file-if-exists=.env.jellyfin.local scripts/sync-jellyfin-artwork.mjs
    if ($LASTEXITCODE -ne 0) { throw "Movie artwork sync failed with exit code $LASTEXITCODE." }
} finally {
    Pop-Location
}
