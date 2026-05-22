param(
    [switch]$SkipTypecheck,
    [switch]$NoStart,
    [int]$LogTail = 80
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$deployDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = (Resolve-Path (Join-Path $deployDir "..\mofacts")).Path

$composeArgs = @(
    "compose",
    "--env-file", ".env.local",
    "-f", "docker-compose.yml",
    "-f", "docker-compose.local.yml",
    "-f", "docker-compose.hotfix-local.yml"
)

function Resolve-ExternalCommandName {
    param(
        [string]$CommandName
    )

    if ($IsWindows -or $env:OS -eq "Windows_NT") {
        $windowsCommand = Get-Command "${CommandName}.cmd" -ErrorAction SilentlyContinue
        if ($null -ne $windowsCommand) {
            return $windowsCommand.Source
        }
    }

    $command = Get-Command $CommandName -ErrorAction Stop
    return $command.Source
}

function Invoke-ExternalChecked {
    param(
        [string[]]$CommandLine,
        [string]$WorkingDirectory
    )

    if ($CommandLine.Count -lt 1) {
        throw "CommandLine must include an executable name."
    }

    $exe = $CommandLine[0]
    $cmdArgs = @()
    if ($CommandLine.Count -gt 1) {
        $cmdArgs = $CommandLine[1..($CommandLine.Count - 1)]
    }

    Write-Host "Running: $($CommandLine -join ' ')"
    Push-Location $WorkingDirectory
    try {
        & $exe @cmdArgs
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code ${LASTEXITCODE}: $($CommandLine -join ' ')"
        }
    } finally {
        Pop-Location
    }
}

$npmExe = Resolve-ExternalCommandName -CommandName "npm"
$dockerExe = Resolve-ExternalCommandName -CommandName "docker"

if (-not (Test-Path (Join-Path $deployDir ".env.local"))) {
    throw "Missing .env.local in $deployDir"
}

if (-not (Test-Path (Join-Path $deployDir "settings.local.json"))) {
    throw "Missing settings.local.json in $deployDir"
}

if (-not $SkipTypecheck) {
    Invoke-ExternalChecked -CommandLine @($npmExe, "run", "typecheck") -WorkingDirectory $appDir
}

Invoke-ExternalChecked -CommandLine (@($dockerExe) + $composeArgs + @("config")) -WorkingDirectory $deployDir
Invoke-ExternalChecked -CommandLine (@($dockerExe) + $composeArgs + @("--profile", "hotfix-build", "run", "--rm", "hotfix-builder")) -WorkingDirectory $deployDir
Invoke-ExternalChecked -CommandLine (@($dockerExe) + $composeArgs + @("--profile", "hotfix-build", "run", "--rm", "hotfix-deps")) -WorkingDirectory $deployDir

if (-not $NoStart) {
    Invoke-ExternalChecked -CommandLine (@($dockerExe) + $composeArgs + @("up", "-d", "mongodb", "mofacts")) -WorkingDirectory $deployDir
    Invoke-ExternalChecked -CommandLine (@($dockerExe) + $composeArgs + @("ps")) -WorkingDirectory $deployDir
    Invoke-ExternalChecked -CommandLine (@($dockerExe) + $composeArgs + @("logs", "--tail", [string]$LogTail, "mofacts")) -WorkingDirectory $deployDir
    Write-Host "Local hotfix app should be ready at http://localhost:3100"
}
