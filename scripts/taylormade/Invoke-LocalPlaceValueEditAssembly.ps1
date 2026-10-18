param(
  [string]$Root = $env:TAYLORMADE_EAST_KIDS_ROOT,
  [string]$JobId = "cmcss-g4-place-value-expanded-form-test-20261005-113910"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Root)) {
  throw "Missing TaylorMade automation root. Pass -Root or set TAYLORMADE_EAST_KIDS_ROOT."
}

$assemblyDir = Join-Path $Root "05_Local_Assembly\$JobId"
$readyDir = Join-Path $Root "04_Ready_To_Upload"
$renderDir = Join-Path $Root "04_Rendered_Shorts\$JobId"
$metadataDir = Join-Path $Root "03_Metadata_Thumbnails"

Write-Host "=== TaylorMade Local Place Value Video Assembly & Edit Pipeline ===" -ForegroundColor Cyan
Write-Host "Target: 150 seconds (2m 30s) CMCSS Grade 4 Math Lesson" -ForegroundColor Green

# This FFmpeg build cannot decode SVG directly, so rasterize every SVG card/overlay
# to a 1280x720 PNG first using the installed browser's headless screenshot mode.
$browserCandidates = @(
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
)
$browserExe = $browserCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $browserExe) {
  throw "No Chrome/Edge executable found for SVG rasterization."
}

Add-Type -AssemblyName System.Drawing.Common

function New-FallbackCardPng {
  param([string]$SvgPath, [string]$PngPath)
  $name = [IO.Path]::GetFileNameWithoutExtension($SvgPath)
  $svgText = Get-Content -LiteralPath $SvgPath -Raw
  $matches = [regex]::Matches($svgText, ">([^<>]{2,})<")
  $lines = @()
  foreach ($m in $matches) {
    $t = [System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value).Trim()
    if ($t -and $t -notmatch "^[#{}.;:/<>=-]+$" -and $lines -notcontains $t) {
      $lines += $t
    }
  }
  if ($lines.Count -eq 0) {
    $lines = @($name -replace "-", " ")
  }

  $bmp = New-Object System.Drawing.Bitmap 1280,720
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $bg = [System.Drawing.Color]::FromArgb(22, 55, 48)
  $g.Clear($bg)
  $chalk = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(245,245,230))
  $gold = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(248,210,100))
  $muted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(190,225,210))
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(230,230,210)), 4

  $titleFont = New-Object System.Drawing.Font "Segoe UI", 48, ([System.Drawing.FontStyle]::Bold)
  $bodyFont = New-Object System.Drawing.Font "Segoe UI", 34, ([System.Drawing.FontStyle]::Regular)
  $smallFont = New-Object System.Drawing.Font "Segoe UI", 26, ([System.Drawing.FontStyle]::Regular)

  $g.DrawRectangle($pen, 40, 35, 1200, 650)
  $y = 80
  $first = $true
  foreach ($line in $lines | Select-Object -First 9) {
    $font = if ($first) { $titleFont } elseif ($line.Length -gt 38) { $smallFont } else { $bodyFont }
    $brush = if ($first) { $gold } elseif ($line -match "=") { $gold } else { $chalk }
    $layout = New-Object System.Drawing.RectangleF 90, $y, 1100, 80
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString($line, $font, $brush, $layout, $fmt)
    $y += if ($first) { 95 } else { 70 }
    $first = $false
  }

  if ($name -match "overlay") {
    $g.Clear([System.Drawing.Color]::FromArgb(38, 82, 70))
    $line = ($lines | Select-Object -First 1)
    if (-not $line) { $line = $name -replace "-", " " }
    $layout = New-Object System.Drawing.RectangleF 30, 15, 1220, 690
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString($line, $bodyFont, $chalk, $layout, $fmt)
  }

  $bmp.Save($PngPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

function Convert-SvgToPng {
  param([string]$SvgPath, [string]$PngPath)
  if (-not (Test-Path -LiteralPath $SvgPath)) {
    throw "Missing SVG asset: $SvgPath"
  }
  $tmpProfile = Join-Path ([IO.Path]::GetTempPath()) ("tm-svg-raster-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $tmpProfile | Out-Null
  $htmlPath = Join-Path $tmpProfile "raster.html"
  $svgText = Get-Content -LiteralPath $SvgPath -Raw
  $html = @"
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { margin:0; width:1280px; height:720px; overflow:hidden; background:#101820; }
    svg { width:1280px !important; height:720px !important; display:block; }
  </style>
</head>
<body>
$svgText
</body>
</html>
"@
  Set-Content -LiteralPath $htmlPath -Value $html -Encoding UTF8
  $htmlUri = (New-Object System.Uri($htmlPath)).AbsoluteUri
  try {
    $args = @(
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      "--no-first-run",
      "--disable-extensions",
      "--user-data-dir=$tmpProfile",
      "--window-size=1280,720",
      "--screenshot=$PngPath",
      $htmlUri
    )
    $browserOutput = & $browserExe @args 2>&1
    $browserExit = $LASTEXITCODE
    Start-Sleep -Milliseconds 500
    if (($browserExit -ne 0 -and $null -ne $browserExit) -or -not (Test-Path -LiteralPath $PngPath)) {
      Write-Warning "Browser SVG rasterization failed for $SvgPath; using local fallback renderer."
      New-FallbackCardPng -SvgPath $SvgPath -PngPath $PngPath
    }
  } finally {
    Remove-Item -LiteralPath $tmpProfile -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# 1. Source Clips
$agent1Folder = if ($env:TAYLORMADE_AGENT1_FOLDER) { $env:TAYLORMADE_AGENT1_FOLDER } else { "agent-1" }
$agent2Folder = if ($env:TAYLORMADE_AGENT2_FOLDER) { $env:TAYLORMADE_AGENT2_FOLDER } else { "agent-2" }
$agent3Folder = if ($env:TAYLORMADE_AGENT3_FOLDER) { $env:TAYLORMADE_AGENT3_FOLDER } else { "agent-3" }
$agent1 = Join-Path $renderDir "$agent1Folder\agent-1-clips-01-03-final-30s.mp4"
$agent2 = Join-Path $renderDir "$agent2Folder\agent-2-clips-04-05-final-20s.mp4"
$agent3 = Join-Path $renderDir "$agent3Folder\agent-3-clips-06-08-final-30s.mp4"

if (-not (Test-Path -LiteralPath $agent1) -or -not (Test-Path -LiteralPath $agent2) -or -not (Test-Path -LiteralPath $agent3)) {
  throw "Missing one or more agent source clips in $renderDir"
}

# 2. Bridge Cards (SVG paths)
$b1Svg = Join-Path $assemblyDir "bridge-01-intro-standards.svg"
$b2Svg = Join-Path $assemblyDir "bridge-02-place-value-chart-4382.svg"
$b3Svg = Join-Path $assemblyDir "bridge-03-quick-check-pause.svg"
$b4Svg = Join-Path $assemblyDir "bridge-04-quick-check-solution-5724.svg"
$b5Svg = Join-Path $assemblyDir "bridge-05-summary-recap.svg"

$b1Png = Join-Path $assemblyDir "bridge-01-intro-standards.png"
$b2Png = Join-Path $assemblyDir "bridge-02-place-value-chart-4382.png"
$b3Png = Join-Path $assemblyDir "bridge-03-quick-check-pause.png"
$b4Png = Join-Path $assemblyDir "bridge-04-quick-check-solution-5724.png"
$b5Png = Join-Path $assemblyDir "bridge-05-summary-recap.png"

# Bridge MP4 targets
$b1Mp4 = Join-Path $assemblyDir "seg-01-intro-standards-12s.mp4"
$b2Mp4 = Join-Path $assemblyDir "seg-04-chart-4382-15s.mp4"
$b3Mp4 = Join-Path $assemblyDir "seg-07-quickcheck-pause-12s.mp4"
$b4Mp4 = Join-Path $assemblyDir "seg-08-solution-5724-16s.mp4"
$b5Mp4 = Join-Path $assemblyDir "seg-09-summary-recap-15s.mp4"

# Helper function to convert SVG to MP4 with silent 48kHz stereo AAC
function Render-BridgeMp4 {
  param([string]$PngPath, [string]$OutMp4, [int]$DurationSeconds)
  Write-Host "Rendering bridge card: $([IO.Path]::GetFileName($OutMp4)) ($DurationSeconds s)..." -ForegroundColor Yellow
  & ffmpeg -y -hide_banner -loglevel error `
    -loop 1 -r 24 -t $DurationSeconds -i $PngPath `
    -f lavfi -t $DurationSeconds -i anullsrc=channel_layout=stereo:sample_rate=48000 `
    -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p" `
    -c:v libx264 -preset veryfast -crf 20 `
    -c:a aac -b:a 128k `
    -shortest -movflags +faststart `
    $OutMp4
}

Write-Host "Rasterizing SVG cards and overlays with browser: $browserExe" -ForegroundColor Yellow
Convert-SvgToPng -SvgPath $b1Svg -PngPath $b1Png
Convert-SvgToPng -SvgPath $b2Svg -PngPath $b2Png
Convert-SvgToPng -SvgPath $b3Svg -PngPath $b3Png
Convert-SvgToPng -SvgPath $b4Svg -PngPath $b4Png
Convert-SvgToPng -SvgPath $b5Svg -PngPath $b5Png

Render-BridgeMp4 -PngPath $b1Png -OutMp4 $b1Mp4 -DurationSeconds 12
Render-BridgeMp4 -PngPath $b2Png -OutMp4 $b2Mp4 -DurationSeconds 15
Render-BridgeMp4 -PngPath $b3Png -OutMp4 $b3Mp4 -DurationSeconds 12
Render-BridgeMp4 -PngPath $b4Png -OutMp4 $b4Mp4 -DurationSeconds 16
Render-BridgeMp4 -PngPath $b5Png -OutMp4 $b5Mp4 -DurationSeconds 15

# 3. Clean and normalize the 3 Agent clips with overlay banners to mask garbled AI text
Write-Host "Applying clean overlays to Agent clips..." -ForegroundColor Yellow

$o1Svg = Join-Path $assemblyDir "overlay-01-intro-caption.svg"
$o2Svg = Join-Path $assemblyDir "overlay-02-tens-caption.svg"
$o3Svg = Join-Path $assemblyDir "overlay-03-transition-title.svg"
$o1Png = Join-Path $assemblyDir "overlay-01-intro-caption.png"
$o2Png = Join-Path $assemblyDir "overlay-02-tens-caption.png"
$o3Png = Join-Path $assemblyDir "overlay-03-transition-title.png"

Convert-SvgToPng -SvgPath $o1Svg -PngPath $o1Png
Convert-SvgToPng -SvgPath $o2Svg -PngPath $o2Png
Convert-SvgToPng -SvgPath $o3Svg -PngPath $o3Png

$seg2Mp4 = Join-Path $assemblyDir "seg-02-agent1-cleaned-30s.mp4"
$seg3Mp4 = Join-Path $assemblyDir "seg-03-agent2-cleaned-20s.mp4"
$seg5Mp4 = Join-Path $assemblyDir "seg-05-agent3-part1-cleaned-20s.mp4"
$seg6Mp4 = Join-Path $assemblyDir "seg-06-agent3-part2-cleaned-10s.mp4"

# Agent 1 cleaned (overlay 1 at bottom for first 10 seconds)
& ffmpeg -y -hide_banner -loglevel error `
  -i $agent1 -loop 1 -i $o1Png `
  -filter_complex "[1:v]scale=1280:120[ovl];[0:v][ovl]overlay=0:H-130:enable='between(t,0,10)'[v]" `
  -map "[v]" -map 0:a `
  -c:v libx264 -preset veryfast -crf 20 `
  -c:a aac -b:a 128k `
  -t 30.016 $seg2Mp4

# Agent 2 cleaned (overlay 2 at bottom for first 10 seconds to cover 'egf tlat tens')
& ffmpeg -y -hide_banner -loglevel error `
  -i $agent2 -loop 1 -i $o2Png `
  -filter_complex "[1:v]scale=1280:120[ovl];[0:v][ovl]overlay=0:H-130:enable='between(t,0,10)'[v]" `
  -map "[v]" -map 0:a `
  -c:v libx264 -preset veryfast -crf 20 `
  -c:a aac -b:a 128k `
  -t 20.01 $seg3Mp4

# Agent 3 Part 1 (first 20 seconds: expanded form and why it matters, overlay 3 to cover malformed title)
& ffmpeg -y -hide_banner -loglevel error `
  -i $agent3 -loop 1 -i $o3Png `
  -filter_complex "[1:v]scale=1280:140[ovl];[0:v][ovl]overlay=0:30:enable='between(t,0,8)'[v]" `
  -map "[v]" -map 0:a `
  -c:v libx264 -preset veryfast -crf 20 `
  -c:a aac -b:a 128k `
  -t 20.0 $seg5Mp4

# Agent 3 Part 2 (last 10 seconds: quick check intro)
& ffmpeg -y -hide_banner -loglevel error `
  -ss 20.0 -i $agent3 `
  -c:v libx264 -preset veryfast -crf 20 `
  -c:a aac -b:a 128k `
  -t 10.016 $seg6Mp4

# 4. Generate master concat list
$masterConcatList = Join-Path $assemblyDir "concat-extended-lesson.txt"
$segments = @($b1Mp4, $seg2Mp4, $seg3Mp4, $b2Mp4, $seg5Mp4, $seg6Mp4, $b3Mp4, $b4Mp4, $b5Mp4)

$concatLines = foreach ($seg in $segments) {
  $safe = $seg.Replace("'", "'\''")
  "file '$safe'"
}
Set-Content -LiteralPath $masterConcatList -Value $concatLines -Encoding UTF8

# 5. Final Concat Render
$outputMaster = Join-Path $assemblyDir "CMCSS Grade 4 Place Value Expanded Form - extended review 150s.mp4"
$readyOutput = Join-Path $readyDir "CMCSS Grade 4 Place Value Expanded Form - CLI edited review draft.mp4"

Write-Host "Stitching final extended 150s video..." -ForegroundColor Cyan
& ffmpeg -y -hide_banner -loglevel error `
  -f concat -safe 0 -i $masterConcatList `
  -c:v libx264 -preset veryfast -crf 20 `
  -c:a aac -b:a 128k `
  -movflags +faststart `
  $outputMaster

Copy-Item -LiteralPath $outputMaster -Destination $readyOutput -Force

Write-Host "Successfully assembled extended lesson!" -ForegroundColor Green
Write-Host "Output staged at: $readyOutput" -ForegroundColor Green
