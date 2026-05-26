$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$sshKey = $env:MOFACTS_PROD_SSH_KEY
$sshHost = $env:MOFACTS_PROD_SSH_HOST
$remoteMongoContainer = 'mofacts-mongodb-1'
$publicBaseUrl = $env:MOFACTS_PROD_BASE_URL
$dbName = 'MoFACT-meteor3'

if (-not $sshKey) {
  throw 'MOFACTS_PROD_SSH_KEY is required.'
}
if (-not $sshHost) {
  throw 'MOFACTS_PROD_SSH_HOST is required.'
}
if (-not $publicBaseUrl) {
  throw 'MOFACTS_PROD_BASE_URL is required.'
}

$remoteMongoIp = ssh -i $sshKey $sshHost "docker inspect $remoteMongoContainer --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'"
$remoteMongoIp = $remoteMongoIp.Trim()

if (-not $remoteMongoIp) {
  throw "Could not resolve Mongo container IP for $remoteMongoContainer."
}

$env:BASE_URL = $publicBaseUrl
$env:DB_NAME = $dbName
$env:SSH_HOST = $sshHost
$env:SSH_KEY_PATH = $sshKey
$env:PROD_MONGO_HOST = $remoteMongoIp

Write-Host "Production Mongo container IP: $remoteMongoIp"
Write-Host "Starting sidecar against $publicBaseUrl"

Push-Location $projectRoot
try {
  docker compose -f docker-compose.yml -f docker-compose.production.yml up --build
} finally {
  Pop-Location
}
