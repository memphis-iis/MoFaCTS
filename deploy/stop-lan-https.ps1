$ErrorActionPreference = 'Stop'

$deployDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Push-Location $deployDir
try {
  Get-Process caddy -ErrorAction SilentlyContinue | Stop-Process -Force
  & (Join-Path $deployDir 'hotfix-local.ps1') stop
  Write-Host 'LAN HTTPS stopped.'
}
finally {
  Pop-Location
}
