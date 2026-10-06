param(
  [string]$Root = $env:TAYLORMADE_EAST_KIDS_ROOT,
  [int]$MaxAttempts = 6,
  [string]$Model = "gemini-3.8-flash",
  [int]$TimeoutSeconds = 0,
  [string]$JobNameContains = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Root)) {
  throw "Missing TaylorMade automation root. Pass -Root or set TAYLORMADE_EAST_KIDS_ROOT."
}

$queueRoot = Join-Path $Root "12_CLI_Review_Queue"
$logRoot = Join-Path $Root "07_Automation_Logs"
$pathwayFile = Join-Path $Root "09_Account_Rotation\gemini-cli-account-pathways.json"
New-Item -ItemType Directory -Force -Path $queueRoot, $logRoot | Out-Null

# Browser Gemini accounts and Gemini CLI are separate routes.
# Browser accounts are used for free video generation. Gemini CLI currently uses
# the local Gemini CLI/API-key route configured outside this repository.
# Keep this explicit so the automation does not confuse browser tab state with
# CLI auth state.
$pathway = $null
if (Test-Path -LiteralPath $pathwayFile) {
  try { $pathway = Get-Content -LiteralPath $pathwayFile -Raw | ConvertFrom-Json } catch { $pathway = $null }
}

$apiKeyPresent = [bool]([Environment]::GetEnvironmentVariable("GEMINI_API_KEY", "User")) -or
  [bool]([Environment]::GetEnvironmentVariable("GEMINI_API_KEY", "Process")) -or
  [bool]([Environment]::GetEnvironmentVariable("GEMINI_API_KEY", "Machine"))

$handoffs = Get-ChildItem -LiteralPath $queueRoot -File -Filter "*.cli-review-handoff.json" -ErrorAction SilentlyContinue
$processed = @()

foreach ($handoffFile in $handoffs) {
  $handoff = Get-Content -LiteralPath $handoffFile.FullName -Raw | ConvertFrom-Json
  $base = $handoffFile.Name -replace '\.cli-review-handoff\.json$', ''
  if (-not [string]::IsNullOrWhiteSpace($JobNameContains) -and $base -notlike "*$JobNameContains*") {
    continue
  }
  $statusPath = Join-Path $queueRoot "$base.cli-run-status.json"
  $outputPath = Join-Path $queueRoot "$base.gemini-cli-output.txt"
  $promptPath = $handoff.cli_review_prompt

  if (-not (Test-Path -LiteralPath $promptPath)) {
    continue
  }

  $status = $null
  if (Test-Path -LiteralPath $statusPath) {
    try { $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json } catch { $status = $null }
  }

  if ($status -and $status.status -eq "completed_cli_review_output_received") {
    continue
  }

  $attempt = 1
  if ($status -and $status.attempt_count) {
    $attempt = [int]$status.attempt_count + 1
  }
  if ($attempt -gt $MaxAttempts) {
    continue
  }

  $prompt = Get-Content -LiteralPath $promptPath -Raw
  $spendLine = if (($handoff.PSObject.Properties.Name -contains "paid_spend_approved") -and $handoff.paid_spend_approved -and ($handoff.PSObject.Properties.Name -contains "budget_usd_max")) {
    "Kyle has approved paid/API editing or generation for this specific job up to `$" + $handoff.budget_usd_max + ". Keep or stay under that cap."
  } else {
    "No paid/API spending is approved by default. If a paid/API route is needed, stop and request Kyle's approval for that specific provider/action before spending."
  }
  $editDirective = if ($handoff.PSObject.Properties.Name -contains "edit_directive") { $handoff.edit_directive } else { "Keep the existing stitched video as the base; improve it without replacing it unless Kyle explicitly asks." }
  $wrapper = @"
$prompt

Run this as an automated TaylorMade CLI review attempt number $attempt of $MaxAttempts.

Important boundaries:
- $spendLine
- $editDirective
- Use free/local edits first and use the CLI to make the lesson worth watching and educational.
- Do not upload or publish.
- Do not change YouTube visibility or channel settings.
- Do not enter login, MFA, CAPTCHA, security, or billing steps.
- Create/update files only inside $Root.
- Prefer local review/editing first.
- If network/API/video generation is unavailable, explain the blocker and produce a local edit plan.
"@

  $nowStart = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
  [ordered]@{
    job = $base
    status = "running_cli_review"
    attempt_count = $attempt
    started_at = $nowStart
    cli = "gemini"
    model = $Model
    timeout_seconds = $TimeoutSeconds
    wait_policy = if ($TimeoutSeconds -le 0) { "wait_until_finished" } else { "bounded_timeout" }
    cli_auth_route = if ($pathway) { $pathway.cli_review_route.current_auth_type } else { "gemini-api-key" }
    api_key_present = $apiKeyPresent
    browser_accounts_are_separate = $true
    source_video = $handoff.source_video
    handoff_json = $handoffFile.FullName
    prompt_file = $promptPath
    output_log = $outputPath
    budget_policy = if ($handoff.PSObject.Properties.Name -contains "budget_policy") { $handoff.budget_policy } else { "free_first_no_paid_spend_without_specific_kyle_approval" }
    target_duration_minutes = if ($handoff.PSObject.Properties.Name -contains "target_duration_minutes") { $handoff.target_duration_minutes } else { "2-5" }
    result = "Gemini CLI review attempt is running."
  } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $statusPath -Encoding UTF8

  $promptTemp = Join-Path $queueRoot "$base.gemini-cli-wrapper-prompt.txt"
  $wrapper | Set-Content -LiteralPath $promptTemp -Encoding UTF8

  $job = Start-Job -ScriptBlock {
    param($WorkRoot, $PromptFile, $ModelName)
    $env:GEMINI_CLI_TRUST_WORKSPACE = "true"
    Push-Location -LiteralPath $WorkRoot
    try {
      Get-Content -LiteralPath $PromptFile -Raw |
        gemini --skip-trust `
          --model $ModelName `
          --prompt "TaylorMade CLI review job: inspect and improve the staged stitched MP4 under the provided constraints." `
          --approval-mode auto_edit `
          --include-directories $WorkRoot `
          --output-format text 2>&1
      $code = $LASTEXITCODE
    } finally {
      Pop-Location
    }
    [pscustomobject]@{
      exit_code = $code
    }
  } -ArgumentList $Root, $promptTemp, $Model

  if ($TimeoutSeconds -le 0) {
    $completed = Wait-Job -Job $job
  } else {
    $completed = Wait-Job -Job $job -Timeout $TimeoutSeconds
  }
  if ($completed) {
    $received = Receive-Job -Job $job -Keep
    $exitObj = $received | Where-Object { $_ -is [pscustomobject] -and $_.PSObject.Properties.Name -contains "exit_code" } | Select-Object -Last 1
    $cmdOutput = $received | Where-Object { -not ($_ -is [pscustomobject] -and $_.PSObject.Properties.Name -contains "exit_code") }
    $exitCode = if ($exitObj) { [int]$exitObj.exit_code } else { 0 }
  } else {
    Stop-Job -Job $job -ErrorAction SilentlyContinue
    $cmdOutput = @("Gemini CLI timed out after $TimeoutSeconds seconds. This is marked retryable.")
    $exitCode = 124
  }
  Remove-Job -Job $job -Force -ErrorAction SilentlyContinue

  $cmdOutput | Set-Content -LiteralPath $outputPath -Encoding UTF8
  $joined = ($cmdOutput -join "`n")
  $now = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")

  if ($exitCode -eq 0 -and $joined -notmatch "fetch failed") {
    $newStatus = "completed_cli_review_output_received"
    $nextAction = "Review Gemini CLI output and apply or approve any recommended edit package."
  } elseif ($exitCode -eq 124) {
    $newStatus = "blocked_retryable"
    $nextAction = "Retry later; Gemini CLI exceeded the configured timeout."
  } else {
    $newStatus = "blocked_retryable"
    $nextAction = "Retry later when Gemini CLI network/model access is available."
  }

  [ordered]@{
    job = $base
    status = $newStatus
    attempt_count = $attempt
    updated_at = $now
    cli = "gemini"
    model = $Model
    timeout_seconds = $TimeoutSeconds
    wait_policy = if ($TimeoutSeconds -le 0) { "wait_until_finished" } else { "bounded_timeout" }
    cli_auth_route = if ($pathway) { $pathway.cli_review_route.current_auth_type } else { "gemini-api-key" }
    api_key_present = $apiKeyPresent
    browser_accounts_are_separate = $true
    source_video = $handoff.source_video
    handoff_json = $handoffFile.FullName
    prompt_file = $promptPath
    output_log = $outputPath
    budget_policy = if ($handoff.PSObject.Properties.Name -contains "budget_policy") { $handoff.budget_policy } else { "free_first_no_paid_spend_without_specific_kyle_approval" }
    target_duration_minutes = if ($handoff.PSObject.Properties.Name -contains "target_duration_minutes") { $handoff.target_duration_minutes } else { "2-5" }
    exit_code = $exitCode
    result = if ($newStatus -eq "blocked_retryable") { "Gemini CLI did not complete successfully. See output_log." } else { "Gemini CLI produced review output. See output_log." }
    next_action = $nextAction
  } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $statusPath -Encoding UTF8

  $processed += [ordered]@{
    job = $base
    status = $newStatus
    attempt = $attempt
    output_log = $outputPath
  }
}

$logPath = Join-Path $logRoot "gemini-cli-review-runner-last-run.json"
[ordered]@{
  ran_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
  processed_count = $processed.Count
  processed = $processed
} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $logPath -Encoding UTF8

[pscustomobject]@{
  status = "ok"
  processed_count = $processed.Count
  processed = $processed
  log = $logPath
} | ConvertTo-Json -Depth 6
