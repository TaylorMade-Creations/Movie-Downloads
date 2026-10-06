param(
  [Parameter(Mandatory=$true)]
  [string]$Path,

  [Parameter(Mandatory=$true)]
  [AllowNull()]
  $Content,

  [ValidateSet('Json','Text')]
  [string]$Format = 'Json'
)

$ErrorActionPreference = 'Stop'

$fullPath = [System.IO.Path]::GetFullPath($Path)
$parent = Split-Path -Parent $fullPath
if (-not (Test-Path -LiteralPath $parent)) {
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
}

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

if ($Format -eq 'Json') {
  if ($Content -is [string]) {
    $text = $Content
    $null = $text | ConvertFrom-Json
  } else {
    $text = $Content | ConvertTo-Json -Depth 50
  }
  $text = $text.TrimStart([char]0xFEFF)
  [System.IO.File]::WriteAllText($fullPath, $text + [Environment]::NewLine, $utf8NoBom)
  return
}

$textContent = [string]$Content
$textContent = $textContent.TrimStart([char]0xFEFF)
[System.IO.File]::WriteAllText($fullPath, $textContent, $utf8NoBom)
