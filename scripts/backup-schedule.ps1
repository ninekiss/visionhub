[CmdletBinding()]
param(
  [ValidateSet("managed", "direct", "network")]
  [string]$DatabaseMode = "managed",
  [switch]$ForceFull
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $repoRoot

try {
  $composeFiles = @("--env-file", ".env", "-f", "infra/compose.yaml")
  switch ($DatabaseMode) {
    "managed" { $composeFiles += @("-f", "infra/compose.database.yaml") }
    "network" { $composeFiles += @("-f", "infra/compose.existing-db-network.yaml") }
    "direct"  { }
  }

  function Invoke-DbTool([string]$Name) {
    Write-Host "==> VisionHub db-tools $Name"
    $arguments = $script:composeFiles + @("run", "--rm", "db-tools", $Name)
    & docker compose @arguments
    if ($LASTEXITCODE -ne 0) {
      throw "db-tools command '$Name' failed with exit code $LASTEXITCODE."
    }
  }

  Invoke-DbTool "logical-backup"

  if ($DatabaseMode -eq "managed") {
    Invoke-DbTool "physical-init"
    $physicalRoot = Join-Path $repoRoot "backups\physical"
    $hasFull = $false
    if (Test-Path $physicalRoot) {
      $hasFull = @(
        Get-ChildItem -Path $physicalRoot -Directory -Filter "full-*" -ErrorAction SilentlyContinue |
          Where-Object { Test-Path (Join-Path $_.FullName "metadata.json") }
      ).Count -gt 0
    }

    $makeFull = $ForceFull -or -not $hasFull -or ((Get-Date).DayOfWeek -eq [System.DayOfWeek]::Sunday)
    if ($makeFull) {
      Invoke-DbTool "physical-backup-full"
    } else {
      Invoke-DbTool "physical-backup-incr"
    }
  }

  Write-Host "VisionHub database backup run completed."
}
finally {
  Pop-Location
}
