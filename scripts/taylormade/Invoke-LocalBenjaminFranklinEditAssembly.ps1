param(
  [string]$Root = $env:TAYLORMADE_EAST_KIDS_ROOT,
  [string]$JobId = "cmcss-g4-ss-s03-benjamin-franklin-20261005"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Root)) {
  throw "Missing TaylorMade automation root. Pass -Root or set TAYLORMADE_EAST_KIDS_ROOT."
}

$assemblyDir = Join-Path $Root "05_Local_Assembly\$JobId"
$readyDir = Join-Path $Root "04_Ready_To_Upload"
$metadataDir = Join-Path $Root "03_Metadata_Thumbnails"

Write-Host "=== TaylorMade Local Benjamin Franklin Extended Video Assembly & Edit Pipeline ===" -ForegroundColor Cyan
Write-Host "Target: 215 seconds (3m 35s) CMCSS Grade 4 Social Studies Lesson" -ForegroundColor Green

# Locate browser executable for headless SVG rasterization (Chrome or Edge)
$browserCandidates = @(
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
)
$browserExe = $browserCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $browserExe) {
  Write-Warning "No standard Chrome/Edge executable found for SVG rasterization; will use fallback GDI+ renderer."
}

Add-Type -AssemblyName System.Drawing

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

  $bmp = New-Object System.Drawing.Bitmap 1920,1080
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $bg = [System.Drawing.Color]::FromArgb(28, 19, 12)
  $g.Clear($bg)
  $parchment = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(250, 245, 230))
  $darkBrown = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(43, 23, 4))
  $gold = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(200, 138, 30))
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(139, 90, 43)), 6

  $g.FillRectangle($parchment, 70, 60, 1780, 960)
  $g.DrawRectangle($pen, 70, 60, 1780, 960)

  $titleFont = New-Object System.Drawing.Font "Georgia", 48, ([System.Drawing.FontStyle]::Bold)
  $bodyFont = New-Object System.Drawing.Font "Segoe UI", 32, ([System.Drawing.FontStyle]::Regular)
  $smallFont = New-Object System.Drawing.Font "Segoe UI", 24, ([System.Drawing.FontStyle]::Regular)

  $y = 120
  $first = $true
  foreach ($line in $lines | Select-Object -First 10) {
    $font = if ($first) { $titleFont } elseif ($line.Length -gt 45) { $smallFont } else { $bodyFont }
    $brush = if ($first) { $gold } else { $darkBrown }
    $layout = New-Object System.Drawing.RectangleF 120, $y, 1680, 80
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString($line, $font, $brush, $layout, $fmt)
    $y += if ($first) { 95 } else { 75 }
    $first = $false
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
  if (-not $browserExe) {
    New-FallbackCardPng -SvgPath $SvgPath -PngPath $PngPath
    return
  }

  $tmpProfile = Join-Path ([IO.Path]::GetTempPath()) ("tm-franklin-raster-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $tmpProfile | Out-Null
  $htmlPath = Join-Path $tmpProfile "raster.html"
  $svgText = Get-Content -LiteralPath $SvgPath -Raw
  $html = @"
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { margin:0; width:1920px; height:1080px; overflow:hidden; background:#1c130c; }
    svg { width:1920px !important; height:1080px !important; display:block; }
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
      "--window-size=1920,1080",
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

# Helper function to convert PNG to 1080p MP4 with silent 48kHz stereo AAC
function Render-BridgeMp4 {
  param([string]$PngPath, [string]$OutMp4, [int]$DurationSeconds)
  Write-Host "Rendering bridge video segment: $([IO.Path]::GetFileName($OutMp4)) ($DurationSeconds s)..." -ForegroundColor Yellow
  & ffmpeg -y -hide_banner -loglevel error `
    -loop 1 -r 24 -t $DurationSeconds -i $PngPath `
    -f lavfi -t $DurationSeconds -i anullsrc=channel_layout=stereo:sample_rate=48000 `
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p" `
    -c:v libx264 -preset veryfast -crf 20 `
    -c:a aac -b:a 128k `
    -shortest -movflags +faststart `
    $OutMp4
  if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg failed rendering $OutMp4"
  }
}

# 1. Base Clips from current assembly folder
$baseClips = @(
  Join-Path $assemblyDir "clip-01.mp4",
  Join-Path $assemblyDir "clip-02.mp4",
  Join-Path $assemblyDir "clip-03.mp4",
  Join-Path $assemblyDir "clip-04.mp4",
  Join-Path $assemblyDir "clip-05.mp4",
  Join-Path $assemblyDir "clip-06.mp4",
  Join-Path $assemblyDir "clip-07.mp4",
  Join-Path $assemblyDir "clip-08.mp4"
)

foreach ($c in $baseClips) {
  if (-not (Test-Path -LiteralPath $c)) {
    throw "Missing required base clip: $c"
  }
}

# 2. Bridge Cards (SVG paths and target PNG/MP4 paths)
$bridges = @(
  @{ Name = "bridge-01-intro-standards"; Duration = 12 },
  @{ Name = "bridge-02-five-roles-showcase"; Duration = 15 },
  @{ Name = "bridge-03-albany-congress-context"; Duration = 15 },
  @{ Name = "bridge-04-albany-plan-diagram"; Duration = 15 },
  @{ Name = "bridge-05-join-or-die-breakdown"; Duration = 18 },
  @{ Name = "bridge-06-leadership-qualities"; Duration = 15 },
  @{ Name = "bridge-07-quickcheck-pause"; Duration = 15 },
  @{ Name = "bridge-08-quickcheck-solutions"; Duration = 15 },
  @{ Name = "bridge-09-chapter-2-review-tease"; Duration = 15 }
)

Write-Host "Rasterizing and rendering 9 educational bridge cards..." -ForegroundColor Cyan

$bridgeMp4s = @{}
foreach ($b in $bridges) {
  $svgPath = Join-Path $assemblyDir "$($b.Name).svg"
  $pngPath = Join-Path $assemblyDir "$($b.Name).png"
  $mp4Path = Join-Path $assemblyDir "$($b.Name)-$($b.Duration)s.mp4"

  Convert-SvgToPng -SvgPath $svgPath -PngPath $pngPath
  Render-BridgeMp4 -PngPath $pngPath -OutMp4 $mp4Path -DurationSeconds $b.Duration
  $bridgeMp4s[$b.Name] = $mp4Path
}

# 3. Assemble the 17-part sequence (Total Duration: 215 seconds = 3m 35s)
$lessonSegments = @(
  $bridgeMp4s["bridge-01-intro-standards"],      # Part 1 (12s) - Intro & Standards 4.15/4.16
  $baseClips[0],                                 # Part 2 (10s) - Clip 1: Hook & Portrait
  $bridgeMp4s["bridge-02-five-roles-showcase"],  # Part 3 (15s) - 5 Roles Detailed Showcase
  $baseClips[1],                                 # Part 4 (10s) - Clip 2: 5 Roles Narration
  $bridgeMp4s["bridge-03-albany-congress-context"], # Part 5 (15s) - Albany Congress 1754 Context
  $baseClips[2],                                 # Part 6 (10s) - Clip 3: Albany Congress
  $bridgeMp4s["bridge-04-albany-plan-diagram"],  # Part 7 (15s) - Albany Plan of Union & Rejection
  $baseClips[3],                                 # Part 8 (10s) - Clip 4: Albany Plan
  $bridgeMp4s["bridge-05-join-or-die-breakdown"],# Part 9 (18s) - "Join or Die" Symbol Analysis
  $baseClips[4],                                 # Part 10 (10s)- Clip 5: Join or Die
  $bridgeMp4s["bridge-06-leadership-qualities"], # Part 11 (15s)- 4 Leadership Qualities Matrix
  $baseClips[5],                                 # Part 12 (10s)- Clip 6: Leadership Qualities
  $bridgeMp4s["bridge-07-quickcheck-pause"],     # Part 13 (15s)- Interactive Quick-Check Pause
  $bridgeMp4s["bridge-08-quickcheck-solutions"], # Part 14 (15s)- Worked Answers & Explanations
  $baseClips[6],                                 # Part 15 (10s)- Clip 7: Review Summary
  $bridgeMp4s["bridge-09-chapter-2-review-tease"], # Part 16 (15s)- Chapter 2 Review Roadmap
  $baseClips[7]                                  # Part 17 (10s)- Clip 8: Next Lesson Tease
)

# 4. Generate master concat list
$masterConcatList = Join-Path $assemblyDir "concat-extended-lesson-215s.txt"
$concatLines = foreach ($seg in $lessonSegments) {
  $safe = $seg.Replace("'", "'\''")
  "file '$safe'"
}
Set-Content -LiteralPath $masterConcatList -Value $concatLines -Encoding UTF8

# 5. Final Concat Render
$outputMaster = Join-Path $assemblyDir "CMCSS Grade 4 Social Studies - Benjamin Franklin - extended review 215s.mp4"
$readyOutput = Join-Path $readyDir "CMCSS Grade 4 Social Studies - Benjamin Franklin - CLI edited review draft.mp4"

Write-Host "Stitching final extended 215s lesson video..." -ForegroundColor Cyan
& ffmpeg -y -hide_banner -loglevel error `
  -f concat -safe 0 -i $masterConcatList `
  -c:v libx264 -preset veryfast -crf 20 `
  -c:a aac -b:a 128k `
  -movflags +faststart `
  $outputMaster

if ($LASTEXITCODE -ne 0) {
  throw "ffmpeg concat failed for master output."
}

Copy-Item -LiteralPath $outputMaster -Destination $readyOutput -Force

Write-Host "Successfully assembled extended lesson (215 seconds / 3m 35s)!" -ForegroundColor Green
Write-Host "Master Assembly: $outputMaster" -ForegroundColor Green
Write-Host "Ready Staged Draft: $readyOutput" -ForegroundColor Green
