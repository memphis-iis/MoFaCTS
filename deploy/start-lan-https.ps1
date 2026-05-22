$ErrorActionPreference = 'Stop'

$deployDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$caddyExe = $env:MOFACTS_CADDY_EXE
if (-not $caddyExe) {
  throw 'Set MOFACTS_CADDY_EXE to the full path of caddy.exe before running start-lan-https.ps1'
}
if (-not (Test-Path -LiteralPath $caddyExe)) {
  throw "MOFACTS_CADDY_EXE does not point to an existing file: $caddyExe"
}
$caddyConfig = Join-Path $deployDir 'Caddyfile.local'
$caddyStdout = Join-Path $deployDir 'caddy.stdout.log'
$caddyStderr = Join-Path $deployDir 'caddy.stderr.log'

Push-Location $deployDir
try {
  docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.local.yml up --build -d

  Get-Process caddy -ErrorAction SilentlyContinue | Stop-Process -Force
  Remove-Item $caddyStdout, $caddyStderr -ErrorAction SilentlyContinue

  Start-Process -FilePath $caddyExe `
    -ArgumentList @('run', '--config', $caddyConfig) `
    -RedirectStandardOutput $caddyStdout `
    -RedirectStandardError $caddyStderr `
    -WindowStyle Hidden

  Write-Host 'LAN HTTPS started at https://localhost:3000'
}
finally {
  Pop-Location
}
