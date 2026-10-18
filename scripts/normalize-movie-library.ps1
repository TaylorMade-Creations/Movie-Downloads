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

function Get-MovieTitleParts([string]$CleanName) {
    $title = $CleanName
    $year = ''
    $match = [regex]::Match($CleanName, '^(?<title>.+?)\s*\(?(?<year>(?:19|20)\d{2})\)?$')
    if ($match.Success) {
        $title = $match.Groups['title'].Value.Trim(' ', '.', '-', '_')
        $year = $match.Groups['year'].Value
    }
    if ([string]::IsNullOrWhiteSpace($title)) { $title = $CleanName }
    return [pscustomobject]@{ Title = $title; Year = $year }
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
            $_.Name -eq "$stem.jellyfin.json" -or
            $_.Name -eq "$stem.srt" -or
            $_.Name -eq "$stem.vtt" -or
            $_.Name -eq "$stem.ass" -or
            $_.Name -eq "$stem.ssa" -or
            $_.Name -eq "$stem.en.srt" -or
            $_.Name -eq "$stem.en.vtt" -or
            $_.Name -eq "$stem.jpg" -or
            $_.Name -eq "$stem.jpeg" -or
            $_.Name -eq "$stem.png" -or
            $_.Name -eq "$stem-poster.jpg" -or
            $_.Name -eq "$stem-thumb.jpg" -or
            $_.Name -eq 'poster.jpg' -or
            $_.Name -eq 'folder.jpg' -or
            $_.Name -eq 'backdrop.jpg' -or
            $_.Name -eq 'fanart.jpg' -or
            $_.Name -eq 'movie.nfo'
        }
}

function Write-MovieMetadataSidecars {
    param(
        [Parameter(Mandatory = $true)][string]$DestinationDirectory,
        [Parameter(Mandatory = $true)][string]$DestinationName,
        [Parameter(Mandatory = $true)][string]$CleanName
    )

    if (-not $Apply) {
        Write-Output "DRY-RUN: metadata sidecars for $DestinationName in $DestinationDirectory"
        return
    }

    $stem = [IO.Path]::GetFileNameWithoutExtension($DestinationName)
    $parts = Get-MovieTitleParts $CleanName
    $relativeFolder = Get-RelativePath $DestinationDirectory
    $jsonPath = Join-Path $DestinationDirectory "$stem.jellyfin.json"
    $nfoPath = Join-Path $DestinationDirectory 'movie.nfo'

    if (-not (Test-Path -LiteralPath $jsonPath)) {
        $metadata = [ordered]@{
            title = $parts.Title
            year = if ($parts.Year) { [int]$parts.Year } else { $null }
            folder = $relativeFolder
            fileName = $DestinationName
            metadataSource = 'Movie Room library worker'
            createdAt = (Get-Date).ToUniversalTime().ToString('o')
        }
        $metadata | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $jsonPath -Encoding UTF8
        Write-Output "METADATA: created $jsonPath"
    }

    if (-not (Test-Path -LiteralPath $nfoPath)) {
        $yearElement = if ($parts.Year) { "  <year>$($parts.Year)</year>`n" } else { '' }
        $nfo = "<movie>`n  <title>$([System.Security.SecurityElement]::Escape($parts.Title))</title>`n$yearElement  <originaltitle>$([System.Security.SecurityElement]::Escape($parts.Title))</originaltitle>`n</movie>`n"
        Set-Content -LiteralPath $nfoPath -Value $nfo -Encoding UTF8
        Write-Output "METADATA: created $nfoPath"
    }
}

function Get-PrimaryVideoInDirectory {
    param([Parameter(Mandatory = $true)][string]$Directory)

    @(Get-ChildItem -LiteralPath $Directory -File -Force -ErrorAction SilentlyContinue |
        Where-Object { $videoExtensions -contains $_.Extension.ToLowerInvariant() } |
        Sort-Object @{ Expression = 'Length'; Descending = $true }, Name |
        Select-Object -First 1)[0]
}

function Move-OrphanSidecarsIntoMovieFolders {
    if (-not (Test-Path -LiteralPath $moviesRoot)) { return }

    $movieDirectories = @(Get-ChildItem -LiteralPath $moviesRoot -Directory -Force -ErrorAction SilentlyContinue)
    $movieByCleanName = @{}
    foreach ($directory in $movieDirectories) {
        $key = (Get-CleanName $directory.Name).ToLowerInvariant()
        if (-not $movieByCleanName.ContainsKey($key)) {
            $movieByCleanName[$key] = @()
        }
        $movieByCleanName[$key] += $directory

        $primaryVideo = Get-PrimaryVideoInDirectory -Directory $directory.FullName
        if ($null -ne $primaryVideo) {
            Write-MovieMetadataSidecars -DestinationDirectory $directory.FullName -DestinationName $primaryVideo.Name -CleanName ([IO.Path]::GetFileNameWithoutExtension($primaryVideo.Name))
        }
    }

    $orphanExtensions = @('.nfo', '.json', '.srt', '.vtt', '.ass', '.ssa', '.jpg', '.jpeg', '.png')
    $orphans = @(Get-ChildItem -LiteralPath $moviesRoot -File -Force -ErrorAction SilentlyContinue |
        Where-Object { $orphanExtensions -contains $_.Extension.ToLowerInvariant() } |
        Sort-Object Name)

    foreach ($orphan in $orphans) {
        $cleanName = Get-CleanName $orphan.Name
        $key = $cleanName.ToLowerInvariant()
        if (-not $movieByCleanName.ContainsKey($key) -or $movieByCleanName[$key].Count -ne 1) {
            Write-Output "REVIEW: orphan sidecar has no unique movie folder match: $($orphan.FullName)"
            continue
        }

        $targetDirectory = $movieByCleanName[$key][0].FullName
        $primaryVideo = Get-PrimaryVideoInDirectory -Directory $targetDirectory
        $targetName = $orphan.Name
        if ($null -ne $primaryVideo) {
            $suffix = if ($orphan.Name -match '(?i)\.jellyfin\.json$') { '.jellyfin.json' } else { $orphan.Extension.ToLowerInvariant() }
            $targetName = "$($primaryVideo.BaseName)$suffix"
        }
        $targetPath = Join-Path $targetDirectory $targetName
        if (Test-Path -LiteralPath $targetPath) {
            Write-Output "CONFLICT: orphan sidecar target exists: $($orphan.FullName) -> $targetPath"
            continue
        }
        if (-not $Apply) {
            Write-Output "DRY-RUN: orphan sidecar $($orphan.FullName) -> $targetPath"
            continue
        }
        Move-Item -LiteralPath $orphan.FullName -Destination $targetPath
        Write-Output "MOVED: orphan sidecar $($orphan.FullName) -> $targetPath"
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
        $sidecarName = $sidecar.Name
        if ($sidecar.BaseName -eq $File.BaseName) {
            $sidecarName = "$([IO.Path]::GetFileNameWithoutExtension($DestinationName))$($sidecar.Extension.ToLowerInvariant())"
        }
        $sidecarDestination = Join-Path $DestinationDirectory $sidecarName
        if (-not (Test-Path -LiteralPath $sidecarDestination)) {
            Move-Item -LiteralPath $sidecar.FullName -Destination $sidecarDestination
        }
    }
    Write-MovieMetadataSidecars -DestinationDirectory $DestinationDirectory -DestinationName $DestinationName -CleanName ([IO.Path]::GetFileNameWithoutExtension($DestinationName))
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

Move-OrphanSidecarsIntoMovieFolders

if ($Apply) {
    New-Item -ItemType Directory -Path $recoveryRoot -Force | Out-Null
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -LiteralPath (Join-Path $recoveryRoot 'movie-library-normalize.log') -Value "$stamp Examined=$($summary.Examined) Stable=$($summary.Stable) Moved=$($summary.Moved) Conflicts=$($summary.Conflicts) Skipped=$($summary.Skipped)"
}

Write-Output ("SUMMARY: Examined={0}; Stable={1}; Moved={2}; Conflicts={3}; Skipped={4}; Mode={5}" -f $summary.Examined, $summary.Stable, $summary.Moved, $summary.Conflicts, $summary.Skipped, ($(if ($Apply) { 'APPLY' } else { 'DRY-RUN' })))
