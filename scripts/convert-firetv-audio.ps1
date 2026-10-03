[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SourcePath,
    [string]$OutputPath,
    [string]$FfmpegPath = "C:\Program Files\Jellyfin\Server\ffmpeg.exe",
    [string]$FfprobePath = "C:\Program Files\Jellyfin\Server\ffprobe.exe"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) { throw "Missing source file: $SourcePath" }
if (-not (Test-Path -LiteralPath $FfmpegPath -PathType Leaf)) { throw "Missing ffmpeg: $FfmpegPath" }
if (-not (Test-Path -LiteralPath $FfprobePath -PathType Leaf)) { throw "Missing ffprobe: $FfprobePath" }

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = [IO.Path]::ChangeExtension($SourcePath, ".firetv.mp4")
}

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory) { New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null }
$partPath = "$OutputPath.part.mp4"

function Get-MediaProbe([string]$Path) {
    $json = & $FfprobePath -v error -show_entries "stream=codec_type,codec_name,channels:format=duration" -of json $Path 2>$null
    if ($LASTEXITCODE -ne 0) { throw "ffprobe failed for $Path" }
    return ($json | ConvertFrom-Json)
}

if (Test-Path -LiteralPath $OutputPath -PathType Leaf) {
    $existing = Get-MediaProbe $OutputPath
    $existingAudio = @($existing.streams | Where-Object codec_type -eq "audio")
    $existingVideo = @($existing.streams | Where-Object codec_type -eq "video")
    if ($existingVideo.Count -gt 0 -and $existingAudio.Count -gt 0 -and $existingAudio[0].codec_name -eq "aac") {
        Write-Output "already-verified output=$OutputPath"
        exit 0
    }
    throw "Refusing to overwrite an existing unverified output: $OutputPath"
}

if (Test-Path -LiteralPath $partPath -PathType Leaf) { Remove-Item -LiteralPath $partPath -Force }

Write-Output "converting source=$SourcePath"
& $FfmpegPath -hide_banner -loglevel warning -y -i $SourcePath `
    -map "0:v:0" -map "0:a?" -map_metadata 0 `
    -c:v copy -c:a aac -b:a 192k -ac 2 -movflags +faststart $partPath
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $partPath -PathType Leaf)) {
    if (Test-Path -LiteralPath $partPath -PathType Leaf) { Remove-Item -LiteralPath $partPath -Force }
    throw "ffmpeg failed with exit code $LASTEXITCODE"
}

$probe = Get-MediaProbe $partPath
$audio = @($probe.streams | Where-Object codec_type -eq "audio")
$video = @($probe.streams | Where-Object codec_type -eq "video")
if ($video.Count -eq 0 -or $audio.Count -eq 0 -or $audio[0].codec_name -ne "aac") {
    Remove-Item -LiteralPath $partPath -Force
    throw "Validation failed: video=$($video.Count) audio=$($audio.Count) audioCodec=$($audio[0].codec_name)"
}

Move-Item -LiteralPath $partPath -Destination $OutputPath
Write-Output "converted output=$OutputPath audioCodec=$($audio[0].codec_name) channels=$($audio[0].channels) duration=$([math]::Round([double]$probe.format.duration, 2))"
