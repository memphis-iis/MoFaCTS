param(
  [string]$EnvFile = $env:MOFACTS_PROD_ENV_FILE
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $EnvFile) {
  throw 'MOFACTS_PROD_ENV_FILE or -EnvFile is required.'
}
$resolvedEnvFile = (Resolve-Path -LiteralPath $EnvFile).Path

Write-Host 'Starting the production sidecar from the private topology-capable environment file.'

Push-Location $projectRoot
try {
  docker compose --env-file $resolvedEnvFile -f docker-compose.yml -f docker-compose.production.yml up --build
} finally {
  Pop-Location
}
