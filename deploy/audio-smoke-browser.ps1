param(
  [switch] $FakeMicrophone
)

$ErrorActionPreference = "Stop"

$chromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe"
)

$browserPath = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browserPath) {
  throw "Could not find Chrome or Edge. Install one of them before running the audio smoke browser."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$profileDir = Join-Path $repoRoot "deploy\local-dev\audio-smoke-browser-profile"
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

$arguments = @(
  "--user-data-dir=$profileDir",
  "--new-window",
  "--use-fake-ui-for-media-stream",
  "http://localhost:3200"
)

if ($FakeMicrophone) {
  $arguments += "--use-fake-device-for-media-stream"
}

Start-Process -FilePath $browserPath -ArgumentList $arguments

Write-Host "Opened MoFaCTS audio smoke browser at http://localhost:3200"
Write-Host "Profile: $profileDir"
if ($FakeMicrophone) {
  Write-Host "Microphone capture is using Chromium's fake device."
} else {
  Write-Host "Microphone capture will use the real host microphone when the browser grants access."
}
