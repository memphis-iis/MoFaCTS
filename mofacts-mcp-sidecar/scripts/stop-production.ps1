$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot

# Set dummy env vars for stop so docker-compose doesn't complain about invalid volume specs
$env:SSH_KEY_PATH = $PSScriptRoot # Just a dummy valid path
$env:SSH_HOST = "dummy"
$env:PROD_MONGO_HOST = "0.0.0.0"

Push-Location $projectRoot
try {
  docker compose -f docker-compose.yml -f docker-compose.production.yml down
} finally {
  Pop-Location
}
