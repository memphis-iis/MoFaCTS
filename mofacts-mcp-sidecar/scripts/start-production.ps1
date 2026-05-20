$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$sshKey = 'C:\Users\ppavl\OneDrive\Desktop\prodkey.pem'
$sshHost = 'ubuntu@52.89.109.53'
$remoteMongoContainer = 'mofacts-mongodb-1'
$publicBaseUrl = 'https://mofacts.optimallearning.org'
$dbName = 'MoFACT-meteor3'

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
