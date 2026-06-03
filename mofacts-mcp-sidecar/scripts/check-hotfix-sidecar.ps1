param(
  [switch]$Start,
  [switch]$Restart
)

$ErrorActionPreference = 'Stop'

$sidecarRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Resolve-Path (Join-Path $sidecarRoot '..')
$hotfixUrl = 'http://localhost:3200'
$mcpUrl = 'http://localhost:8931/mcp'
$composeArgs = @('-f', 'docker-compose.yml', '-f', 'docker-compose.hotfix-dev.yml')

function Test-HttpEndpoint {
  param(
    [string]$Name,
    [string]$Url
  )

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 8
    [pscustomobject]@{
      Name = $Name
      Url = $Url
      Reachable = $true
      Status = [int]$response.StatusCode
      Note = 'HTTP request completed.'
    }
  } catch {
    $response = $_.Exception.Response
    if ($response -and $response.StatusCode) {
      [pscustomobject]@{
        Name = $Name
        Url = $Url
        Reachable = $true
        Status = [int]$response.StatusCode
        Note = 'Endpoint responded with a non-2xx status.'
      }
      return
    }

    [pscustomobject]@{
      Name = $Name
      Url = $Url
      Reachable = $false
      Status = ''
      Note = $_.Exception.Message
    }
  }
}

function Invoke-SidecarCompose {
  param([string[]]$CommandArgs)

  Push-Location $sidecarRoot
  try {
    docker compose @composeArgs @CommandArgs
  } finally {
    Pop-Location
  }
}

Write-Host 'MoFaCTS hotfix Playwright MCP check'
Write-Host "Repo: $repoRoot"
Write-Host "Sidecar: $sidecarRoot"
Write-Host ''

if ($Restart) {
  Write-Host 'Restarting hotfix sidecar...'
  Invoke-SidecarCompose -CommandArgs @('up', '--build', '-d')
} elseif ($Start) {
  Write-Host 'Starting hotfix sidecar if needed...'
  Invoke-SidecarCompose -CommandArgs @('up', '--build', '-d')
}

Write-Host ''
Write-Host 'HTTP endpoints:'
Test-HttpEndpoint -Name 'Hotfix app' -Url $hotfixUrl | Format-Table -AutoSize
Test-HttpEndpoint -Name 'Playwright MCP' -Url $mcpUrl | Format-Table -AutoSize

Write-Host ''
Write-Host 'Sidecar compose services:'
try {
  Invoke-SidecarCompose -CommandArgs @('ps')
} catch {
  Write-Host "Unable to read sidecar compose status: $($_.Exception.Message)"
}

Write-Host ''
Write-Host 'Expected Codex tool namespace: mcp__mofacts_playwright__'
Write-Host 'If that namespace is absent from a Codex turn after this sidecar is reachable,'
Write-Host 'treat it as a Codex tool-exposure/session issue, not as evidence that the'
Write-Host 'MoFaCTS Playwright sidecar is unavailable.'
Write-Host ''
Write-Host 'Useful commands:'
Write-Host '  deploy\hotfix-dev.ps1 start'
Write-Host '  cd mofacts-mcp-sidecar'
Write-Host '  docker compose -f docker-compose.yml -f docker-compose.hotfix-dev.yml up --build'
