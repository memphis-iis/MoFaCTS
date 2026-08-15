param(
  [switch]$Start,
  [switch]$Restart
)

$ErrorActionPreference = 'Stop'

$sidecarRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Resolve-Path (Join-Path $sidecarRoot '..')
$deployRoot = Join-Path $repoRoot 'deploy'
$deployEnvFile = Join-Path $deployRoot '.env.local'
$localSidecarEnvFile = Join-Path $deployRoot 'local-hotfix\sidecar-mcp.env'
$localhostUrl = 'http://localhost:3200'
$mcpUrl = 'http://localhost:8931/mcp'
$composeArgs = @('--env-file', $localSidecarEnvFile, '-f', 'docker-compose.yml', '-f', 'docker-compose.local-server.yml')
$localDeployComposeArgs = @('compose', '--env-file', '.env.local', '-f', 'docker-compose.yml', '-f', 'docker-compose.local.yml')
$projectName = 'mofacts-mcp-sidecar'
$expectedServices = @('playwright-mcp', 'mongo-mcp')
$localSidecarUsername = 'mofacts_local_sidecar'

function Get-EnvFileValues {
  param([string]$Path)

  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
      $values[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
    }
  }

  return $values
}

function Get-RequiredEnvFileValue {
  param(
    [hashtable]$Values,
    [string]$Name,
    [string]$Path
  )

  $value = $Values[$Name]
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "$Path must define $Name"
  }

  return $value
}

function New-LocalSidecarPassword {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }

  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Write-LocalSidecarEnvFile {
  param(
    [string]$DatabaseName,
    [string]$ReplicaSetName,
    [string]$Password
  )

  $envDirectory = Split-Path -Parent $localSidecarEnvFile
  New-Item -ItemType Directory -Path $envDirectory -Force | Out-Null

  $encodedUsername = [Uri]::EscapeDataString($localSidecarUsername)
  $encodedPassword = [Uri]::EscapeDataString($Password)
  $encodedDatabaseName = [Uri]::EscapeDataString($DatabaseName)
  $encodedReplicaSetName = [Uri]::EscapeDataString($ReplicaSetName)
  $mongoUri = "mongodb://${encodedUsername}:${encodedPassword}@mongodb:27017/${encodedDatabaseName}?authSource=${encodedDatabaseName}&replicaSet=${encodedReplicaSetName}"

  @(
    "MOFACTS_LOCAL_SIDECAR_USERNAME=$localSidecarUsername"
    "MOFACTS_LOCAL_SIDECAR_PASSWORD=$Password"
    "MONGO_URI=$mongoUri"
    "DB_NAME=$DatabaseName"
    "MOFACTS_MONGO_REPLICA_SET_NAME=$ReplicaSetName"
  ) | Set-Content -LiteralPath $localSidecarEnvFile -Encoding ascii
}

function Invoke-LocalMongoSidecarProvisioning {
  param(
    [string]$DatabaseName,
    [string]$Password
  )

  $mongoState = docker ps `
    --filter 'label=com.docker.compose.project=deploy' `
    --filter 'label=com.docker.compose.service=mongodb' `
    --format '{{.State}}'
  if ($mongoState -notcontains 'running') {
    throw 'The local MongoDB service is not running. Start deploy\\hotfix-local.ps1 before starting the MCP sidecar.'
  }

  $provisioningScript = @"
const databaseName = $(ConvertTo-Json -Compress $DatabaseName);
const username = $(ConvertTo-Json -Compress $localSidecarUsername);
const password = $(ConvertTo-Json -Compress $Password);
const database = db.getSiblingDB(databaseName);
const roles = [{ role: 'read', db: databaseName }];
if (database.getUser(username)) {
  database.updateUser(username, { pwd: password, roles });
} else {
  database.createUser({ user: username, pwd: password, roles });
}
quit(0);
"@

  Push-Location $deployRoot
  try {
    $provisioningScript | docker @localDeployComposeArgs exec -T mongodb sh -lc 'mongosh --quiet --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --file /dev/stdin'
    if ($LASTEXITCODE -ne 0) {
      throw 'Could not provision the local read-only Mongo MCP account.'
    }
  } finally {
    Pop-Location
  }
}

function Ensure-LocalSidecarConfiguration {
  if (-not (Test-Path -LiteralPath $deployEnvFile)) {
    throw "Missing local Mongo configuration at $deployEnvFile. Start deploy\\hotfix-local.ps1 after restoring its required private configuration."
  }

  $deployValues = Get-EnvFileValues -Path $deployEnvFile
  $databaseName = Get-RequiredEnvFileValue -Values $deployValues -Name 'MOFACTS_MONGO_APP_DATABASE' -Path $deployEnvFile
  $replicaSetName = Get-RequiredEnvFileValue -Values $deployValues -Name 'MOFACTS_MONGO_REPLICA_SET_NAME' -Path $deployEnvFile
  Get-RequiredEnvFileValue -Values $deployValues -Name 'MONGO_INITDB_ROOT_USERNAME' -Path $deployEnvFile | Out-Null
  Get-RequiredEnvFileValue -Values $deployValues -Name 'MONGO_INITDB_ROOT_PASSWORD' -Path $deployEnvFile | Out-Null

  $sidecarValues = if (Test-Path -LiteralPath $localSidecarEnvFile) {
    Get-EnvFileValues -Path $localSidecarEnvFile
  } else {
    @{}
  }
  $password = $sidecarValues['MOFACTS_LOCAL_SIDECAR_PASSWORD']
  if ([string]::IsNullOrWhiteSpace($password)) {
    $password = New-LocalSidecarPassword
  }

  Write-LocalSidecarEnvFile -DatabaseName $databaseName -ReplicaSetName $replicaSetName -Password $password
  Invoke-LocalMongoSidecarProvisioning -DatabaseName $databaseName -Password $password
}

function Get-SidecarContainerStates {
  $containerRows = docker ps -a `
    --filter "label=com.docker.compose.project=$projectName" `
    --format '{{.Label "com.docker.compose.service"}}|{{.State}}|{{.Names}}'

  $states = @{}
  foreach ($row in $containerRows) {
    $parts = $row -split '\|', 3
    if ($parts.Count -eq 3 -and $parts[0] -in $expectedServices) {
      $states[$parts[0]] = [pscustomobject]@{
        State = $parts[1]
        Name = $parts[2]
      }
    }
  }

  return $states
}

function Test-SidecarAlreadyUp {
  param([hashtable]$ContainerStates)

  return @($expectedServices | Where-Object {
    -not $ContainerStates.ContainsKey($_) -or $ContainerStates[$_].State -ne 'running'
  }).Count -eq 0
}

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

$containerStates = Get-SidecarContainerStates
$sidecarAlreadyUp = Test-SidecarAlreadyUp -ContainerStates $containerStates

Write-Host 'MoFaCTS canonical localhost Playwright MCP check'
Write-Host "Repo: $repoRoot"
Write-Host "Sidecar: $sidecarRoot"
Write-Host ''

if ($Restart) {
  Ensure-LocalSidecarConfiguration
  Write-Host 'Restarting hotfix sidecar...'
  Invoke-SidecarCompose -CommandArgs @('up', '--build', '-d', '--force-recreate')
} elseif ($Start) {
  if ($sidecarAlreadyUp) {
    Write-Host 'Local MoFaCTS sidecar is already up; no Compose command was run.'
  } else {
    Ensure-LocalSidecarConfiguration
    Write-Host 'Starting local MoFaCTS sidecar...'
    Invoke-SidecarCompose -CommandArgs @('up', '--build', '-d')
  }
} elseif ($sidecarAlreadyUp) {
  Write-Host 'Local MoFaCTS sidecar is already up; no Compose command was run.'
} else {
  Write-Host 'Local MoFaCTS sidecar is not fully running. Use -Start; it provisions its local read-only Mongo account from deploy\.env.local before invoking Compose.'
}

Write-Host ''
Write-Host 'HTTP endpoints:'
Test-HttpEndpoint -Name 'Canonical localhost app' -Url $localhostUrl | Format-Table -AutoSize
Test-HttpEndpoint -Name 'Playwright MCP' -Url $mcpUrl | Format-Table -AutoSize

Write-Host ''
Write-Host 'Sidecar container services:'
foreach ($service in $expectedServices) {
  if ($containerStates.ContainsKey($service)) {
    Write-Host "  $service : $($containerStates[$service].State) ($($containerStates[$service].Name))"
  } else {
    Write-Host "  $service : absent"
  }
}

Write-Host ''
Write-Host 'Expected Codex tool namespace: mcp__mofacts_playwright__'
Write-Host 'If that namespace is absent from a Codex turn after this sidecar is reachable,'
Write-Host 'treat it as a Codex tool-exposure/session issue, not as evidence that the'
Write-Host 'MoFaCTS Playwright sidecar is unavailable.'
Write-Host ''
Write-Host 'Useful commands:'
Write-Host '  deploy\hotfix-local.ps1'
Write-Host '  mofacts-mcp-sidecar\scripts\check-localhost-sidecar.ps1'
Write-Host '  mofacts-mcp-sidecar\scripts\check-localhost-sidecar.ps1 -Start'
