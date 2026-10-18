param(
  [Parameter(Mandatory=$true)]
  [object[]]$Path,

  [string]$ReportPath
)

$ErrorActionPreference = 'Stop'

$knownCorrections = @(
  [pscustomobject]@{ found = 'thedds'; suggestion = 'texts' }
  [pscustomobject]@{ found = 'aremisspelled'; suggestion = 'are misspelled' }
  [pscustomobject]@{ found = 'scrips'; suggestion = 'scripts' }
  [pscustomobject]@{ found = 'seriers'; suggestion = 'series' }
  [pscustomobject]@{ found = 'sepretmenu'; suggestion = 'separate menu' }
  [pscustomobject]@{ found = 'sepret'; suggestion = 'separate' }
  [pscustomobject]@{ found = 'deataled'; suggestion = 'detailed' }
  [pscustomobject]@{ found = 'possable'; suggestion = 'possible' }
  [pscustomobject]@{ found = 'automateion'; suggestion = 'automation' }
  [pscustomobject]@{ found = 'domination'; suggestion = 'document automation' }
  [pscustomobject]@{ found = 'Jim and I'; suggestion = 'Gemini' }
  [pscustomobject]@{ found = 'C and CSS'; suggestion = 'CMCSS' }
  [pscustomobject]@{ found = 'FedEx messages'; suggestion = 'Codex messages' }
  [pscustomobject]@{ found = 'invetor'; suggestion = 'inventor' }
  [pscustomobject]@{ found = 'scienctist'; suggestion = 'scientist' }
  [pscustomobject]@{ found = 'Benjamen'; suggestion = 'Benjamin' }
  [pscustomobject]@{ found = 'Franklen'; suggestion = 'Franklin' }
  [pscustomobject]@{ found = 'Pensylvania'; suggestion = 'Pennsylvania' }
  [pscustomobject]@{ found = 'Pennslyvania'; suggestion = 'Pennsylvania' }
  [pscustomobject]@{ found = 'Gazete'; suggestion = 'Gazette' }
  [pscustomobject]@{ found = 'Parliment'; suggestion = 'Parliament' }
  [pscustomobject]@{ found = 'Albney'; suggestion = 'Albany' }
  [pscustomobject]@{ found = 'Congres'; suggestion = 'Congress' }
  [pscustomobject]@{ found = 'coloney'; suggestion = 'colony' }
  [pscustomobject]@{ found = 'colonys'; suggestion = 'colonies' }
  [pscustomobject]@{ found = 'persistant'; suggestion = 'persistent' }
  [pscustomobject]@{ found = 'persuasivee'; suggestion = 'persuasive' }
  [pscustomobject]@{ found = 'curiousity'; suggestion = 'curiosity' }
  [pscustomobject]@{ found = 'goverment'; suggestion = 'government' }
  [pscustomobject]@{ found = 'governement'; suggestion = 'government' }
  [pscustomobject]@{ found = 'unifed'; suggestion = 'unified' }
  [pscustomobject]@{ found = 'thriteen'; suggestion = 'thirteen' }
)

$results = @()

foreach ($filePath in $Path) {
  if (-not (Test-Path -LiteralPath $filePath)) {
    $results += [pscustomobject]@{
      path = $filePath
      line = 0
      status = 'missing_file'
      found = ''
      suggestion = ''
      context = ''
    }
    continue
  }

  $lines = Get-Content -LiteralPath $filePath
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $lineText = [string]$lines[$i]
    foreach ($entry in $knownCorrections) {
      $bad = $entry.found
      $pattern = '(?<![A-Za-z0-9])' + [regex]::Escape($bad) + '(?![A-Za-z0-9])'
      if ($lineText -match $pattern) {
        $results += [pscustomobject]@{
          path = $filePath
          line = $i + 1
          status = 'possible_misspelling'
          found = $bad
          suggestion = $entry.suggestion
          context = $lineText.Trim()
        }
      }
    }
  }
}

$summary = [ordered]@{
  checked_at = (Get-Date).ToString('o')
  checked_files = $Path
  issue_count = @($results).Count
  status = $(if (@($results).Count -eq 0) { 'passed_no_known_misspellings_found' } else { 'needs_text_review' })
  issues = @($results)
}

if ($ReportPath) {
  $helper = Join-Path $PSScriptRoot 'Save-CompatiblePipelineFile.ps1'
  if (Test-Path -LiteralPath $helper) {
    & $helper -Path $ReportPath -Content $summary -Format Json
  } else {
    $summary | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $ReportPath -Encoding UTF8
  }
}

$summary | ConvertTo-Json -Depth 20
