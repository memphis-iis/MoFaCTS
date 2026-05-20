$ErrorActionPreference = 'Stop'

param(
  [switch]$Production,
  [switch]$RemoveOtherPlaywrightMcp
)

$projectRoot = Split-Path -Parent $PSScriptRoot

Push-Location $projectRoot
try {
  $composeFiles = @('-f', 'docker-compose.yml')
  if ($Production) {
    $composeFiles += @('-f', 'docker-compose.production.yml')
  }

  if ($RemoveOtherPlaywrightMcp) {
    $composeContainerIds = docker compose @composeFiles ps -q playwright-mcp
    $composeContainerSet = @{}
    foreach ($id in $composeContainerIds) {
      if ($id) {
        $composeContainerSet[$id.Trim()] = $true
      }
    }

    $playwrightContainers = docker ps -aq --filter "ancestor=mcr.microsoft.com/playwright/mcp" --filter "ancestor=mofacts-playwright-mcp"
    foreach ($containerId in $playwrightContainers) {
      $trimmed = $containerId.Trim()
      if ($trimmed -and -not $composeContainerSet.ContainsKey($trimmed)) {
        Write-Host "Removing non-compose Playwright MCP container $trimmed"
        docker rm -f $trimmed | Out-Null
      }
    }
  }

  docker compose @composeFiles stop playwright-mcp | Out-Null
  docker compose @composeFiles rm -f playwright-mcp | Out-Null
  docker compose @composeFiles up --build -d playwright-mcp
  docker compose @composeFiles ps playwright-mcp
} finally {
  Pop-Location
}

