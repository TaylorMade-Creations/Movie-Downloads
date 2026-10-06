[CmdletBinding()]
param(
    [string]$LibraryRoot = 'C:\Users\kylet\OneDrive\Desktop\Movie downloads',
    [int]$PollSeconds = 60,
    [int]$StabilitySeconds = 90,
    [int]$ConversionTimeoutMinutes = 480,
    [switch]$Once
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$incompleteRoot = Join-Path $LibraryRoot '.incomplete'
$recoveryRoot = Join-Path $LibraryRoot '_Recovery\Converted_Originals_Pending_Delete'
$logRoot = Join-Path $LibraryRoot '_Recovery\Logs'
$logPath = Join-Path $logRoot 'incomplete-movie-watcher.log'
$syncScript = Join-Path $PSScriptRoot 'run-movie-library-sync.ps1'
$convertScript = Join-Path $env:USERPROFILE '.codex\skills\movie-room-media-conversion\scripts\convert-movie-room-media.ps1'

$videoExtensions = @('.mp4', '.m4v', '.mov', '.mkv', '.avi', '.wmv', '.webm', '.ts')

foreach ($dir in @($incompleteRoot, $recoveryRoot, $logRoot)) {
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

function Write-WatcherLog {
    param(
        [Parameter(Mandatory = $true)][string]$Level,
        [Parameter(Mandatory = $true)][string]$Message
    )

    $line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level.ToUpperInvariant().PadRight(7).Substring(0, 7), $Message
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
    Write-Output $line
}

function Get-UniquePath {
    param(
        [Parameter(Mandatory = $true)][string]$Directory,
        [Parameter(Mandatory = $true)][string]$FileName
    )

    $candidate = Join-Path $Directory $FileName
    if (-not (Test-Path -LiteralPath $candidate)) {
        return $candidate
    }

    $stem = [IO.Path]::GetFileNameWithoutExtension($FileName)
    $ext = [IO.Path]::GetExtension($FileName)
    $index = 1
    do {
        $candidate = Join-Path $Directory ('{0}_{1:000}{2}' -f $stem, $index, $ext)
        $index++
    } while (Test-Path -LiteralPath $candidate)

    return $candidate
}

function Test-StableFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $false
    }

    $first = (Get-Item -LiteralPath $Path -Force).Length
    Start-Sleep -Seconds $StabilitySeconds
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $false
    }
    $second = (Get-Item -LiteralPath $Path -Force).Length
    return ($first -eq $second -and $second -gt 0)
}

function Get-Sidecars {
    param([Parameter(Mandatory = $true)][IO.FileInfo]$VideoFile)

    $stem = [IO.Path]::GetFileNameWithoutExtension($VideoFile.Name)
    Get-ChildItem -LiteralPath $VideoFile.DirectoryName -File -Force |
        Where-Object {
            $_.BaseName -eq $stem -and
            $_.Extension.ToLowerInvariant() -in @('.nfo', '.srt', '.vtt', '.ass', '.ssa', '.jpg', '.jpeg', '.png')
        }
}

function Invoke-LibrarySync {
    if (-not (Test-Path -LiteralPath $syncScript -PathType Leaf)) {
        Write-WatcherLog -Level 'WARN' -Message "Library sync script missing: $syncScript"
        return
    }

    Write-WatcherLog -Level 'SYNC' -Message "Running Movie Room library sync after promotion."
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $syncScript -LibraryRoot $LibraryRoot
    if ($LASTEXITCODE -ne 0) {
        Write-WatcherLog -Level 'WARN' -Message "Library sync exited with code $LASTEXITCODE."
    }
}

function Move-OriginalToRecovery {
    param([Parameter(Mandatory = $true)][IO.FileInfo]$OriginalFile)

    $movieRecoveryRoot = Join-Path $recoveryRoot $OriginalFile.BaseName
    New-Item -ItemType Directory -Path $movieRecoveryRoot -Force | Out-Null

    $originalDestination = Get-UniquePath -Directory $movieRecoveryRoot -FileName $OriginalFile.Name
    Move-Item -LiteralPath $OriginalFile.FullName -Destination $originalDestination
    Write-WatcherLog -Level 'KEEP' -Message "Moved original to recovery review: $originalDestination"

    foreach ($sidecar in @(Get-Sidecars -VideoFile $OriginalFile)) {
        if (Test-Path -LiteralPath $sidecar.FullName) {
            $sidecarDestination = Get-UniquePath -Directory $movieRecoveryRoot -FileName $sidecar.Name
            Move-Item -LiteralPath $sidecar.FullName -Destination $sidecarDestination
            Write-WatcherLog -Level 'KEEP' -Message "Moved original sidecar to recovery review: $sidecarDestination"
        }
    }
}

function Promote-CompletedVideo {
    param(
        [Parameter(Mandatory = $true)][string]$VideoPath,
        [IO.FileInfo]$OriginalFile
    )

    $video = Get-Item -LiteralPath $VideoPath -Force
    $destination = Get-UniquePath -Directory $LibraryRoot -FileName $video.Name
    Move-Item -LiteralPath $video.FullName -Destination $destination
    Write-WatcherLog -Level 'PROMOTE' -Message "Moved completed video into library intake: $destination"

    $sidecarSource = if ($null -ne $OriginalFile) { $OriginalFile } else { $video }
    foreach ($sidecar in @(Get-Sidecars -VideoFile $sidecarSource)) {
        if (Test-Path -LiteralPath $sidecar.FullName) {
            $sidecarDestination = Get-UniquePath -Directory $LibraryRoot -FileName $sidecar.Name
            Copy-Item -LiteralPath $sidecar.FullName -Destination $sidecarDestination -Force:$false
            Write-WatcherLog -Level 'SIDECAR' -Message "Copied sidecar into library intake: $sidecarDestination"
        }
    }

    if ($null -ne $OriginalFile -and (Test-Path -LiteralPath $OriginalFile.FullName)) {
        Move-OriginalToRecovery -OriginalFile $OriginalFile
    }

    Invoke-LibrarySync
}

function Process-IncompleteVideo {
    param([Parameter(Mandatory = $true)][IO.FileInfo]$File)

    $extension = $File.Extension.ToLowerInvariant()
    if ($extension -notin $videoExtensions) {
        return
    }
    if ($File.Name -match '\.(part|crdownload|tmp)$') {
        return
    }

    $lockPath = Join-Path $File.DirectoryName ($File.Name + '.watcher.lock')
    $lockStream = $null
    try {
        try {
            $lockStream = [IO.File]::Open($lockPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        }
        catch {
            return
        }

        Write-WatcherLog -Level 'CHECK' -Message "Checking incomplete video: $($File.FullName)"
        if (-not (Test-StableFile -Path $File.FullName)) {
            Write-WatcherLog -Level 'WAIT' -Message "Still downloading or hydrating: $($File.Name)"
            return
        }

        if ($extension -eq '.mkv') {
            if (-not (Test-Path -LiteralPath $convertScript -PathType Leaf)) {
                Write-WatcherLog -Level 'ERROR' -Message "Conversion script missing: $convertScript"
                return
            }

            $outputPath = Join-Path $File.DirectoryName ($File.BaseName + '.firetv.mp4')
            Write-WatcherLog -Level 'CONVERT' -Message "Converting MKV to MP4 for Fire TV/Movie Room: $($File.Name)"
            & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $convertScript -SourcePath $File.FullName -OutputPath $outputPath -TimeoutMinutes $ConversionTimeoutMinutes -ProgressTimeoutMinutes 30 -WaitForStableMinutes 30
            if ($LASTEXITCODE -ne 0) {
                Write-WatcherLog -Level 'ERROR' -Message "Conversion failed with exit code $LASTEXITCODE for $($File.Name)"
                return
            }

            if (Test-Path -LiteralPath $outputPath -PathType Leaf) {
                Promote-CompletedVideo -VideoPath $outputPath -OriginalFile $File
            }
            else {
                Write-WatcherLog -Level 'ERROR' -Message "Expected converted output missing: $outputPath"
            }
            return
        }

        Promote-CompletedVideo -VideoPath $File.FullName
    }
    catch {
        Write-WatcherLog -Level 'ERROR' -Message "Processing failed for $($File.FullName): $($_.Exception.Message)"
    }
    finally {
        if ($lockStream) { $lockStream.Dispose() }
        if (Test-Path -LiteralPath $lockPath -PathType Leaf) {
            Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
        }
    }
}

function Invoke-IncompleteMoviePass {
    $candidates = Get-ChildItem -LiteralPath $incompleteRoot -File -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension.ToLowerInvariant() -in $videoExtensions } |
        Sort-Object LastWriteTime, Name

    foreach ($candidate in $candidates) {
        Process-IncompleteVideo -File $candidate
    }
}

Write-WatcherLog -Level 'START' -Message "Incomplete Movie Room watcher started. Incomplete=$incompleteRoot"

if ($Once) {
    Invoke-IncompleteMoviePass
    Write-WatcherLog -Level 'DONE' -Message 'One-shot incomplete movie pass complete.'
    return
}

while ($true) {
    Invoke-IncompleteMoviePass
    Start-Sleep -Seconds $PollSeconds
}
