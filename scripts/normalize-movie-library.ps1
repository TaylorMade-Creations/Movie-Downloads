[CmdletBinding()]
param(
    [string]$LibraryRoot = 'C:\Users\kylet\OneDrive\Desktop\Movie downloads',
    [switch]$Apply,
    [switch]$FolderizeMovies,
    [switch]$OrganizeSeries,
    [int]$StabilitySeconds = 2
)

$ErrorActionPreference = 'Stop'
$videoExtensions = @('.mp4', '.mkv', '.m4v', '.mov', '.webm', '.avi', '.wmv', '.ts')
$root = [IO.Path]::GetFullPath($LibraryRoot)
$moviesRoot = Join-Path $root 'Movies'
$seriesRoot = Join-Path $root 'TV Shows'
$recoveryRoot = Join-Path $root '_Recovery'

function Get-RelativePath([string]$Path) {
    $fullPath = [IO.Path]::GetFullPath($Path)
    if ($fullPath.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
        return $fullPath.Substring($root.Length).TrimStart('\', '/').Replace('\', '/')
    }
    return $fullPath.Replace('\', '/')
}

function Test-IntakeCandidate([IO.FileInfo]$File) {
    $relative = Get-RelativePath $File.FullName
    $parts = $relative -split '/'
    if ($parts.Count -eq 0) { return $false }
    if ($parts[0] -in @('Applications', '_Recovery', 'TV Shows', '.incomplete', 'Mac')) { return $false }
    if ($parts[0] -eq 'Movies' -and $parts.Count -ge 3) { return $false }
    return $videoExtensions -contains $File.Extension.ToLowerInvariant()
}

function Test-StableFile([IO.FileInfo]$File) {
    if ($StabilitySeconds -le 0) { return $true }
    $before = (Get-Item -LiteralPath $File.FullName -Force).Length
    Start-Sleep -Seconds $StabilitySeconds
    $after = (Get-Item -LiteralPath $File.FullName -Force).Length
    return $before -eq $after
}

function Get-CleanName([string]$Value) {
    $name = [IO.Path]::GetFileNameWithoutExtension($Value)
    $name = $name -replace '(?i)^\s*(?:www\.)?[^\s]+\.(?:com|org|net)\s*[-_ ]*', ''
    $name = $name -replace '(?i)^\s*(?:www\s+)?(?:torrenting|uindex)\s+(?:com|org)\s*[-_ ]*', ''
    $name = $name -replace '[._]+', ' '
    $name = $name -replace '(?i)\[[^\]]*(?:1080p|720p|WEB|Blu.?Ray|x26|HEVC)[^\]]*\]', ''
    $name = $name -replace '(?i)\b(?:2160p|1080p|720p|576p|480p|WEB[- ]?DL|WEB[- ]?Rip|Blu[- ]?Ray|HDTV|BRRip|DVDRip|x264|x265|H264|H265|HEVC|AVC|AAC|EAC3|DDP?\.?\d(?:\.\d)?|DTS|Atmos|HDR|10bit|PROPER|REMASTERED|EXTENDED|LIMITED|COMPLETE|RELEASE|DiMEPiECE|OFT|BONE|EVO|YTS|RARBG)\b.*$', ''
    $name = $name -replace '(?i)\s+-\s+(?:DiMEPiECE|OFT|BONE|EVO|YTS|RARBG)\s*$', ''
    $name = $name -replace '\s+', ' '
    $name = $name.Trim(' ', '.', '-', '_')
    if ([string]::IsNullOrWhiteSpace($name)) { return 'Untitled video' }
    return $name
}

function Get-SeriesInfo([string]$Name) {
    $base = [IO.Path]::GetFileNameWithoutExtension($Name)
    $match = [regex]::Match($base, '(?i)^(?<show>.+?)\s*(?:S(?<season>\d{1,2})E(?<episode>\d{1,2})|(?<season2>\d{1,2})x(?<episode2>\d{2}))\b')
    if (-not $match.Success) { return $null }
    $seasonValue = if ($match.Groups['season'].Success) { $match.Groups['season'].Value } else { $match.Groups['season2'].Value }
    $episodeValue = if ($match.Groups['episode'].Success) { $match.Groups['episode'].Value } else { $match.Groups['episode2'].Value }
    $show = Get-CleanName $match.Groups['show'].Value
    if ([string]::IsNullOrWhiteSpace($show)) { return $null }
    return [pscustomobject]@{
        Show = $show
        Season = [int]$seasonValue
        Episode = [int]$episodeValue
    }
}

function Get-Sidecars([IO.FileInfo]$File) {
    $stem = [IO.Path]::GetFileNameWithoutExtension($File.Name)
    Get-ChildItem -LiteralPath $File.DirectoryName -File -Force |
        Where-Object {
            $_.Name -eq "$stem.nfo" -or
            $_.Name -eq "$stem.jpg" -or
            $_.Name -eq "$stem.jpeg" -or
            $_.Name -eq "$stem.png" -or
            $_.Name -eq 'poster.jpg' -or
            $_.Name -eq 'folder.jpg'
        }
}

function Move-IntakeFile([IO.FileInfo]$File, [string]$DestinationDirectory, [string]$DestinationName) {
    $destinationPath = Join-Path $DestinationDirectory $DestinationName
    if (Test-Path -LiteralPath $destinationPath) {
        Write-Output "CONFLICT: $($File.FullName) -> $destinationPath (left in place)"
        return $false
    }
    if (-not $Apply) {
        Write-Output "DRY-RUN: $($File.FullName) -> $destinationPath"
        return $true
    }

    New-Item -ItemType Directory -Path $DestinationDirectory -Force | Out-Null
    $sidecars = @(Get-Sidecars $File)
    Move-Item -LiteralPath $File.FullName -Destination $destinationPath
    foreach ($sidecar in $sidecars) {
        $sidecarDestination = Join-Path $DestinationDirectory $sidecar.Name
        if (-not (Test-Path -LiteralPath $sidecarDestination)) {
            Move-Item -LiteralPath $sidecar.FullName -Destination $sidecarDestination
        }
    }
    Write-Output "MOVED: $($File.FullName) -> $destinationPath"
    return $true
}

if (-not (Test-Path -LiteralPath $root)) {
    throw "Library root does not exist: $root"
}

if (-not $FolderizeMovies -and -not $OrganizeSeries) {
    $FolderizeMovies = $true
    $OrganizeSeries = $true
}

$files = @()
$files += @(Get-ChildItem -LiteralPath $root -File -Force)
$topLevelDirectories = Get-ChildItem -LiteralPath $root -Directory -Force
foreach ($directory in $topLevelDirectories) {
    if ($directory.Name -in @('Applications', '_Recovery', 'TV Shows', '.incomplete', 'Mac')) {
        continue
    }
    if ($directory.Name -eq 'Movies') {
        # qBittorrent is configured to place completed files directly here.
        # Do not recurse through already-organized title folders.
        $files += @(Get-ChildItem -LiteralPath $directory.FullName -File -Force)
        continue
    }
    $files += @(Get-ChildItem -LiteralPath $directory.FullName -Recurse -File -Force)
}
$files = @($files | Where-Object { Test-IntakeCandidate $_ } | Sort-Object FullName)
$summary = [ordered]@{ Examined = 0; Stable = 0; Moved = 0; Conflicts = 0; Skipped = 0 }

foreach ($file in $files) {
    $summary.Examined++
    try {
        if (-not (Test-StableFile $file)) {
            $summary.Skipped++
            Write-Output "SKIP (still changing): $($file.FullName)"
            continue
        }
        $summary.Stable++
        $series = Get-SeriesInfo $file.Name
        if ($series -and $OrganizeSeries) {
            $seasonDirectory = Join-Path (Join-Path $seriesRoot $series.Show) ("{0} Season {1:D2}" -f $series.Show, $series.Season)
            $cleanStem = Get-CleanName $file.Name
            $targetName = "$cleanStem$($file.Extension.ToLowerInvariant())"
            if (Move-IntakeFile $file $seasonDirectory $targetName) { $summary.Moved++ } else { $summary.Conflicts++ }
            continue
        }
        if (-not $FolderizeMovies) { continue }
        $title = Get-CleanName $file.Name
        $movieDirectory = Join-Path $moviesRoot $title
        $targetName = "$title$($file.Extension.ToLowerInvariant())"
        if (Move-IntakeFile $file $movieDirectory $targetName) { $summary.Moved++ } else { $summary.Conflicts++ }
    } catch {
        $summary.Skipped++
        Write-Output "REVIEW: $($file.FullName) :: $($_.Exception.Message)"
    }
}

if ($Apply) {
    New-Item -ItemType Directory -Path $recoveryRoot -Force | Out-Null
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -LiteralPath (Join-Path $recoveryRoot 'movie-library-normalize.log') -Value "$stamp Examined=$($summary.Examined) Stable=$($summary.Stable) Moved=$($summary.Moved) Conflicts=$($summary.Conflicts) Skipped=$($summary.Skipped)"
}

Write-Output ("SUMMARY: Examined={0}; Stable={1}; Moved={2}; Conflicts={3}; Skipped={4}; Mode={5}" -f $summary.Examined, $summary.Stable, $summary.Moved, $summary.Conflicts, $summary.Skipped, ($(if ($Apply) { 'APPLY' } else { 'DRY-RUN' })))
