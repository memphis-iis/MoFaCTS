$ErrorActionPreference = 'Stop'

$deployDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$caddyExe = 'C:\Users\ppavl\AppData\Local\Microsoft\WinGet\Packages\CaddyServer.Caddy_Microsoft.Winget.Source_8wekyb3d8bbwe\caddy.exe'
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

  Write-Host 'LAN HTTPS started at https://192.168.50.44:3000'
}
finally {
  Pop-Location
}
