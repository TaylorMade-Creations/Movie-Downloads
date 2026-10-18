param(
  [string]$JobId = "cmcss-g4-place-value-expanded-form-test-20261005-113910",
  [string]$Root = $env:TAYLORMADE_EAST_KIDS_ROOT
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Root)) {
  throw "Missing TaylorMade automation root. Pass -Root or set TAYLORMADE_EAST_KIDS_ROOT."
}

function Get-DurationSeconds {
  param([string]$Path)
  $raw = & ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 -- $Path
  if (-not $raw) { throw "ffprobe could not read duration for $Path" }
  return [Math]::Round([double]$raw, 3)
}

function Require-File {
  param([string]$Path, [string]$Label)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Label is missing: $Path"
  }
  return (Resolve-Path -LiteralPath $Path).Path
}

$renderRoot = Join-Path $Root "04_Rendered_Shorts\$JobId"
$assemblyRoot = Join-Path $Root "05_Local_Assembly\$JobId"
$readyRoot = Join-Path $Root "04_Ready_To_Upload"
$metadataRoot = Join-Path $Root "03_Metadata_Thumbnails"
$cliQueueRoot = Join-Path $Root "12_CLI_Review_Queue"
$handoffRoot = Join-Path $Root "03_Generation_Jobs\handoff_packets\$JobId"

New-Item -ItemType Directory -Force -Path $assemblyRoot, $readyRoot, $metadataRoot, $cliQueueRoot, $handoffRoot | Out-Null

$agent1Folder = if ($env:TAYLORMADE_AGENT1_FOLDER) { $env:TAYLORMADE_AGENT1_FOLDER } else { "agent-1" }
$agent2Folder = if ($env:TAYLORMADE_AGENT2_FOLDER) { $env:TAYLORMADE_AGENT2_FOLDER } else { "agent-2" }
$agent3Folder = if ($env:TAYLORMADE_AGENT3_FOLDER) { $env:TAYLORMADE_AGENT3_FOLDER } else { "agent-3" }
$agent1 = Require-File (Join-Path $renderRoot "$agent1Folder\agent-1-clips-01-03-final-30s.mp4") "Agent 1 final cumulative clip"
$agent2 = Require-File (Join-Path $renderRoot "$agent2Folder\agent-2-clips-04-05-final-20s.mp4") "Agent 2 final cumulative clip"
$agent3 = Require-File (Join-Path $renderRoot "$agent3Folder\agent-3-clips-06-08-final-30s.mp4") "Agent 3 final cumulative clip"

$inputs = @(
  [pscustomobject]@{ order = 1; agent = "agent-1"; path = $agent1; expected_role = "overall clips 1-3: place value hook, thousands, hundreds" },
  [pscustomobject]@{ order = 2; agent = "agent-2"; path = $agent2; expected_role = "overall clips 4-5: tens and ones" },
  [pscustomobject]@{ order = 3; agent = "agent-3"; path = $agent3; expected_role = "overall clips 6-8: expanded form, why it matters, quick check" }
)

foreach ($input in $inputs) {
  $input | Add-Member -NotePropertyName duration_seconds -NotePropertyValue (Get-DurationSeconds $input.path) -Force
}

$concatList = Join-Path $assemblyRoot "concat-agent-finals.txt"
$concatLines = foreach ($input in $inputs) {
  $safe = $input.path.Replace("'", "'\''")
  "file '$safe'"
}
Set-Content -LiteralPath $concatList -Value $concatLines -Encoding UTF8

$draftVideo = Join-Path $assemblyRoot "CMCSS Grade 4 Place Value Expanded Form - agent finals stitched review.mp4"
$readyVideo = Join-Path $readyRoot "CMCSS Grade 4 Place Value Expanded Form - CLI review draft.mp4"

& ffmpeg -y -hide_banner -loglevel error `
  -f concat -safe 0 -i $concatList `
  -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p" `
  -c:v libx264 -preset veryfast -crf 20 `
  -c:a aac -b:a 128k `
  -movflags +faststart `
  $draftVideo

Copy-Item -LiteralPath $draftVideo -Destination $readyVideo -Force

$draftDuration = Get-DurationSeconds $draftVideo
$timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")

$metadataPath = Join-Path $metadataRoot "CMCSS Grade 4 Place Value Expanded Form metadata.json"
$metadata = [ordered]@{
  title = "4th Grade Math: Place Value and Expanded Form"
  description = "A short CMCSS-aligned fourth grade math review that helps students read a four-digit number by place value and write it in expanded form. Students identify thousands, hundreds, tens, and ones, then practice with 5,724."
  tags = @("CMCSS", "4th grade math", "place value", "expanded form", "elementary math", "Kiddo Learn", "TaylorMade", "education")
  made_for_kids_recommendation = $true
  visibility_recommendation = "review_only_until_kyle_approves_upload"
  thumbnail_text = "Place Value: 5,724"
  thumbnail_prompt = "Friendly classroom-style thumbnail with a clean place-value chart for 5,724, bright but not overly colorful, readable text, fourth grade math style."
  source_video = $draftVideo
  ready_video = $readyVideo
  status = "cli_review_pending"
  created_at = $timestamp
  job_id = $JobId
  input_clips = $inputs
  stitched_duration_seconds = $draftDuration
}
$metadata | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $metadataPath -Encoding UTF8

$cliHandoffPath = Join-Path $cliQueueRoot "$JobId.cli-review-handoff.json"
$cliPromptPath = Join-Path $cliQueueRoot "$JobId.cli-review-prompt.txt"

$cliPrompt = @"
You are the TaylorMade assembly, metadata, and CLI review agent for this CMCSS Grade 4 video.

Goal:
Create the final edited review draft from the stitched Gemini outputs. Do not publish. Do not upload. Prepare a reviewed video and metadata package for Kyle's approval.

Video inputs, in strict order:
1. Agent 1 final cumulative clip: clips 1-3, 30 seconds, place value hook plus thousands and hundreds.
2. Agent 2 final cumulative clip: clips 4-5, 20 seconds, tens and ones.
3. Agent 3 final cumulative clip: clips 6-8, 30 seconds, expanded form, why place value matters, quick check.

Use the stitched draft:
$draftVideo

Metadata sidecar:
$metadataPath

Edit requirements:
- Watch for repeated explanations, repeated title-card behavior, or any awkward handoff between agent outputs.
- Stitch only the useful video sections together in story order.
- If the lesson needs more clarity, add low-cost local educational support only: captions, a place-value chart, an expanded-form overlay, a quick-check pause, or a simple bridge card.
- If an external edit/generation prompt is needed, draft that prompt clearly and save it with the review notes.
- Keep the final lesson child-friendly for fourth grade, clear, and worth rewatching.
- Target an average 2-5 minute lesson when enough useful free Gemini clips/local support exist; if the lesson is naturally shorter, make it complete rather than padded.
- Use free/local edits first. If paid/API video editing or generation is needed, stop and request Kyle's approval for that specific provider/action before spending.
- Do not use any Gemini account until the reset/relay watcher says the target account is ready.
- Do not upload or publish; stage only for Kyle's approval.

Expected final handoff:
- final reviewed MP4 path
- updated metadata JSON path
- thumbnail prompt or thumbnail image path
- edit notes explaining any cuts, overlays, or added support
- upload readiness status set to review_only_until_kyle_approves_upload
"@
$cliPrompt | Set-Content -LiteralPath $cliPromptPath -Encoding UTF8

$cliHandoff = [ordered]@{
  job_id = $JobId
  status = "ready_for_assembly_metadata_cli_review_agent"
  created_at = $timestamp
  trigger = "agent_3_final_cumulative_video_verified"
  budget_policy = "free_first_no_paid_spend_without_specific_kyle_approval"
  target_duration_minutes = "2-5"
  paid_actions_allowed_without_fresh_confirmation = $false
  stitched_draft_video = $draftVideo
  ready_review_video = $readyVideo
  metadata_json = $metadataPath
  cli_review_prompt = $cliPromptPath
  source_inputs = $inputs
  next_agent = "assembly_metadata_cli_review"
  upload_status = "not_uploaded_review_only"
  notes = @(
    "This is not a direct YouTube upload trigger.",
    "The CLI review agent must decide whether to trim, stitch, add local support overlays, or draft an external edit prompt.",
    "Only after reviewed output and Kyle approval should the upload queue status be changed."
  )
}
$cliHandoff | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $cliHandoffPath -Encoding UTF8

$statePath = Join-Path $handoffRoot "post-agent3-assembly-state.json"
$state = [ordered]@{
  job_id = $JobId
  status = "ready_for_cli_review"
  updated_at = $timestamp
  agent_3_final_video = $agent3
  stitched_draft_video = $draftVideo
  ready_review_video = $readyVideo
  metadata_json = $metadataPath
  cli_review_handoff = $cliHandoffPath
  cli_review_prompt = $cliPromptPath
  duration_seconds = $draftDuration
}
$state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $statePath -Encoding UTF8

[pscustomobject]@{
  status = "ready_for_cli_review"
  job_id = $JobId
  duration_seconds = $draftDuration
  stitched_draft_video = $draftVideo
  ready_review_video = $readyVideo
  metadata_json = $metadataPath
  cli_review_handoff = $cliHandoffPath
  cli_review_prompt = $cliPromptPath
} | ConvertTo-Json -Depth 6
