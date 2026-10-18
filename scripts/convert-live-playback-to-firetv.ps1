[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Title,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [string]$AppOrigin = 'https://movie-downloads-six.vercel.app',
    [string]$FfmpegPath = 'C:\Program Files\Jellyfin\Server\ffmpeg.exe',
    [string]$FfprobePath = 'C:\Program Files\Jellyfin\Server\ffprobe.exe',

    [ValidateRange(1, 1440)]
    [int]$TimeoutMinutes = 240,

    [ValidateRange(1, 120)]
    [int]$ProgressTimeoutMinutes = 30,

    [ValidateRange(0, 600)]
    [int]$DurationToleranceSeconds = 45
)

$ErrorActionPreference = 'Stop'

function Fail([string]$Message) { throw $Message }

function Get-Probe([string]$InputPath) {
    $probeJson = & $FfprobePath -v error -show_entries 'stream=codec_type,codec_name,channels:format=duration' -of json $InputPath 2>$null
    if ($LASTEXITCODE -ne 0) { Fail "ffprobe failed for $InputPath" }
    return ($probeJson | ConvertFrom-Json)
}

if (-not (Test-Path -LiteralPath $FfmpegPath -PathType Leaf)) { Fail "Missing ffmpeg: $FfmpegPath" }
if (-not (Test-Path -LiteralPath $FfprobePath -PathType Leaf)) { Fail "Missing ffprobe: $FfprobePath" }

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory) { New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null }

$partPath = "$OutputPath.part.mp4"
$progressPath = "$OutputPath.progress.log"
$logPath = "$OutputPath.conversion.log"
$lockPath = "$OutputPath.lock"

$lockStream = $null
try {
    try {
        $lockStream = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    } catch {
        Fail "Another conversion is already running for $OutputPath (lock: $lockPath)"
    }

    if (Test-Path -LiteralPath $OutputPath -PathType Leaf) {
        Fail "Refusing to overwrite existing output: $OutputPath"
    }

    if (Test-Path -LiteralPath $partPath -PathType Leaf) { Remove-Item -LiteralPath $partPath -Force }
    if (Test-Path -LiteralPath $progressPath -PathType Leaf) { Remove-Item -LiteralPath $progressPath -Force }

    $library = (Invoke-RestMethod -Uri "$AppOrigin/api/library?refresh=1" -TimeoutSec 120).movies
    $movie = $library | Where-Object { $_.title -eq $Title } | Select-Object -First 1
    if (-not $movie) { Fail "Movie not found in live library: $Title" }

    $body = @{ movieId = $movie.id; preview = $true } | ConvertTo-Json -Compress
    $playback = Invoke-RestMethod -Uri "$AppOrigin/api/playback" `
        -Method Post `
        -ContentType 'application/json' `
        -Headers @{ Origin = $AppOrigin } `
        -Body $body `
        -TimeoutSec 60

    if (-not $playback.url) { Fail 'No playback URL returned.' }

    # A redirected OneDrive transfer can end early while FFmpeg still exits
    # successfully. Read the source duration first so a partial MP4 can never
    # be promoted to the Fire TV playback filename.
    $sourceProbe = Get-Probe $playback.url
    $sourceDurationSeconds = [double]$sourceProbe.format.duration
    if ($sourceDurationSeconds -le 0) {
        Fail 'The OneDrive source did not report a usable duration.'
    }

    "sourceTitle=$Title`nsourceId=$($movie.id)`noutput=$OutputPath`nstarted=$((Get-Date).ToString('o'))`ninput=onedrive-playback-url`nsourceDurationSeconds=$sourceDurationSeconds" |
        Set-Content -LiteralPath $logPath -Encoding UTF8

    Write-Output "converting title=$Title output=$OutputPath"
    $arguments = @(
        '-hide_banner', '-nostdin', '-loglevel', 'warning', '-y',
        '-i', $playback.url,
        '-map', '0:v:0', '-map', '0:a?', '-map_metadata', '0',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
        '-movflags', '+faststart', '-progress', $progressPath, $partPath
    )
    $argumentString = ($arguments | ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' }) -join ' '
    $process = Start-Process -FilePath $FfmpegPath -ArgumentList $argumentString -NoNewWindow -PassThru -RedirectStandardError $logPath
    $deadline = (Get-Date).AddMinutes($TimeoutMinutes)
    $lastProgressAt = Get-Date
    $lastProgressValue = ''
    $lastOutputBytes = -1L
    $nextHeartbeat = Get-Date

    while (-not $process.HasExited) {
        Start-Sleep -Seconds 10
        $process.Refresh()

        $outputBytes = if (Test-Path -LiteralPath $partPath -PathType Leaf) { (Get-Item -LiteralPath $partPath).Length } else { 0L }
        $progressValue = ''
        if (Test-Path -LiteralPath $progressPath -PathType Leaf) {
            $progressValue = ((Get-Content -LiteralPath $progressPath -Tail 8 -ErrorAction SilentlyContinue) -join '; ')
        }
        if (($progressValue -and $progressValue -ne $lastProgressValue) -or $outputBytes -gt $lastOutputBytes) {
            $lastProgressAt = Get-Date
            $lastProgressValue = $progressValue
            $lastOutputBytes = $outputBytes
            if ($progressValue) { Write-Output "progress $progressValue" }
        }
        if ((Get-Date) -ge $nextHeartbeat) {
            $elapsedMinutes = [math]::Round(((Get-Date) - ($deadline.AddMinutes(-$TimeoutMinutes))).TotalMinutes, 1)
            Write-Output "heartbeat elapsed=$elapsedMinutes min outputBytes=$outputBytes"
            $nextHeartbeat = (Get-Date).AddSeconds(20)
        }
        if ((Get-Date) -ge $deadline) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            Fail "FFmpeg exceeded the $TimeoutMinutes minute timeout. Review $logPath"
        }
        if (((Get-Date) - $lastProgressAt).TotalMinutes -ge $ProgressTimeoutMinutes) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            Fail "FFmpeg made no progress for $ProgressTimeoutMinutes minutes. Review $logPath"
        }
    }

    if ($process.ExitCode -ne 0) { Fail "FFmpeg failed with exit code $($process.ExitCode). Review $logPath" }
    if (-not (Test-Path -LiteralPath $partPath -PathType Leaf)) { Fail 'Part file missing after ffmpeg.' }

    $probe = Get-Probe $partPath
    $video = @($probe.streams | Where-Object codec_type -eq 'video')
    $audio = @($probe.streams | Where-Object { $_.codec_type -eq 'audio' -and $_.codec_name -eq 'aac' })
    if ($video.Count -eq 0 -or $audio.Count -eq 0) {
        Fail 'Validation failed: output must contain video and AAC audio.'
    }
    $outputDurationSeconds = [double]$probe.format.duration
    $minimumDurationSeconds = [math]::Max(1, $sourceDurationSeconds - $DurationToleranceSeconds)
    if ($outputDurationSeconds -lt $minimumDurationSeconds) {
        Fail "Validation failed: output duration $outputDurationSeconds seconds is shorter than the $minimumDurationSeconds second minimum from the source."
    }

    Move-Item -LiteralPath $partPath -Destination $OutputPath
    Add-Content -LiteralPath $logPath -Value "completed=$((Get-Date).ToString('o')) sourceDurationSeconds=$sourceDurationSeconds outputDurationSeconds=$outputDurationSeconds audio=aac channels=$($audio[0].channels)"
    Write-Output "converted output=$OutputPath durationSeconds=$outputDurationSeconds audioCodec=aac channels=$($audio[0].channels)"
} finally {
    if ($lockStream) { $lockStream.Dispose() }
    if (Test-Path -LiteralPath $lockPath -PathType Leaf) {
        Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
    }
}
