$ErrorActionPreference = 'Stop'

$deployDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Push-Location $deployDir
try {
  Get-Process caddy -ErrorAction SilentlyContinue | Stop-Process -Force
  docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.local.yml down
  Write-Host 'LAN HTTPS stopped.'
}
finally {
  Pop-Location
}
