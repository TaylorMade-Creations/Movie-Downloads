param(
  [string]$Root = $env:TAYLORMADE_EAST_KIDS_ROOT,
  [int]$TargetMinMinutes = 2,
  [int]$TargetMaxMinutes = 5
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Root)) {
  throw "Missing TaylorMade automation root. Pass -Root or set TAYLORMADE_EAST_KIDS_ROOT."
}

function ConvertTo-SafeName {
  param([string]$Name)
  $safe = $Name -replace '[^\w\-. ]+', ''
  $safe = $safe.Trim() -replace '\s+', '-'
  if ([string]::IsNullOrWhiteSpace($safe)) { return "untitled-video" }
  return $safe.ToLowerInvariant()
}

function Get-DurationSeconds {
  param([string]$Path)
  $raw = & ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 -- $Path
  if (-not $raw) { throw "ffprobe could not read duration for $Path" }
  return [Math]::Round([double]$raw, 3)
}

$readyRoot = Join-Path $Root "04_Ready_To_Upload"
$metadataRoot = Join-Path $Root "03_Metadata_Thumbnails"
$cliQueueRoot = Join-Path $Root "12_CLI_Review_Queue"
$logRoot = Join-Path $Root "07_Automation_Logs"

New-Item -ItemType Directory -Force -Path $readyRoot, $metadataRoot, $cliQueueRoot, $logRoot | Out-Null

$created = @()
$videos = Get-ChildItem -LiteralPath $readyRoot -File -Filter "*.mp4" -ErrorAction SilentlyContinue

foreach ($video in $videos) {
  $base = [IO.Path]::GetFileNameWithoutExtension($video.Name)
  $cleanBase = $base -replace '\s*-\s*(final review|CLI review draft|extended \d+min review|stitched review).*$', ''
  $safe = ConvertTo-SafeName $base
  $handoffPath = Join-Path $cliQueueRoot "$safe.cli-review-handoff.json"
  $promptPath = Join-Path $cliQueueRoot "$safe.cli-review-prompt.txt"

  if (Test-Path -LiteralPath $handoffPath) {
    continue
  }

  $metadataCandidates = @(
    (Join-Path $metadataRoot "$base metadata.json"),
    (Join-Path $metadataRoot "$base.json"),
    (Join-Path $metadataRoot "$cleanBase metadata.json"),
    (Join-Path $metadataRoot "$cleanBase.json")
  )
  $metadataPath = $metadataCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $metadataPath) {
    $metadataPath = Join-Path $metadataRoot "$cleanBase metadata.json"
  }

  $duration = Get-DurationSeconds $video.FullName
  $createdAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")

  $prompt = @"
You are the TaylorMade assembly, metadata, and CLI review agent.

Input stitched MP4:
$($video.FullName)

Metadata sidecar:
$metadataPath

Budget:
- No fixed spending cap is assigned by default.
- Prefer free/local edits first: reuse approved Gemini clips, trim, reorder, overlay captions, add simple educational bridge cards, improve metadata, and prepare an edit prompt.
- Use CLI review to make the video worth watching, clear enough to rewatch, and educational enough for the lesson.
- If paid/API video editing or generation is needed, stop and request Kyle's approval for that specific provider/action before spending.

Task:
1. Review the stitched MP4 and metadata.
2. Decide whether it needs trimming, better stitching, added lesson information, captions, a place-value chart, a bridge scene, audio notes, or thumbnail changes.
3. Draft the exact prompt/instructions needed for the next edit/generation tool.
4. If local editing is enough, create an edited review draft and save it back into the TaylorMade ready/review folders.
5. Target an average 2-5 minute lesson when enough useful free clips/local support exist; if the lesson is naturally shorter, make it complete rather than padded.
6. Keep status review-only. Do not upload, publish, schedule, premiere, delete source files, enter login/MFA/CAPTCHA/security steps, or change YouTube settings.

Expected output:
- reviewed MP4 path or edit plan
- updated metadata path
- thumbnail prompt or image path
- concise review notes
- upload readiness status: review_only_until_kyle_approves_upload
"@
  $prompt | Set-Content -LiteralPath $promptPath -Encoding UTF8

  $handoff = [ordered]@{
    status = "ready_for_cli_agent_review"
    created_at = $createdAt
    source_video = $video.FullName
    duration_seconds = $duration
    metadata_json = $metadataPath
    cli_review_prompt = $promptPath
    budget_policy = "free_first_no_paid_spend_without_specific_kyle_approval"
    target_duration_minutes = "$TargetMinMinutes-$TargetMaxMinutes"
    local_first = $true
    free_source_first = $true
    upload_after_review = $false
    upload_status = "not_uploaded_review_only"
    allowed_actions = @(
      "inspect_video",
      "trim_locally",
      "stitch_locally",
      "add_local_captions",
      "add_local_educational_overlays",
      "draft_external_edit_prompt",
      "update_metadata"
    )
    blocked_actions = @(
      "publish",
      "upload_without_kyle_approval",
      "change_youtube_visibility",
      "spend_over_budget",
      "enter_login_mfa_captcha",
      "delete_source_files"
    )
  }
  $handoff | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $handoffPath -Encoding UTF8
  $created += $handoffPath
}

$logPath = Join-Path $logRoot "cli-review-queue-watcher-last-run.json"
[ordered]@{
  ran_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
  ready_folder = $readyRoot
  cli_queue_folder = $cliQueueRoot
  created_count = $created.Count
  created = $created
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $logPath -Encoding UTF8

[pscustomobject]@{
  status = "ok"
  created_count = $created.Count
  created = $created
  log = $logPath
} | ConvertTo-Json -Depth 5
