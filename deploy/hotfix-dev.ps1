param(
    [ValidateSet("start", "restart", "stop", "status", "logs")]
    [string]$Action = "start",
    [int]$LogTail = 120
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$deployDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = (Resolve-Path (Join-Path $deployDir "..\mofacts")).Path
$localDevDir = Join-Path $deployDir "local-dev"
$staleLocalBuildDir = Join-Path $deployDir "local-build"
$pidPath = Join-Path $localDevDir "meteor.pid"
$watcherPidPath = Join-Path $localDevDir "commonjs-watcher.pid"
$stdoutPath = Join-Path $localDevDir "meteor.stdout.log"
$stderrPath = Join-Path $localDevDir "meteor.stderr.log"
$watcherStdoutPath = Join-Path $localDevDir "commonjs-watcher.stdout.log"
$watcherStderrPath = Join-Path $localDevDir "commonjs-watcher.stderr.log"
$settingsPath = Join-Path $deployDir "settings.local.json"
$localDataHome = Join-Path $deployDir "local-data"
$commonJsWatcherScript = Join-Path $deployDir "hotfix-dev\ensure-commonjs-build.ps1"

$mongoUrl = "mongodb://127.0.0.1:27017/MoFACT-meteor3"
$expectedMongoDbName = "MoFACT-meteor3"
$rootUrl = "http://localhost:3200"
$port = "3200"

$composeArgs = @(
    "compose",
    "--env-file", ".env.local",
    "-f", "docker-compose.yml",
    "-f", "docker-compose.local.yml",
    "-f", "docker-compose.hotfix-native.yml"
)

function Resolve-ExternalCommandName {
    param([string]$CommandName)

    if ($IsWindows -or $env:OS -eq "Windows_NT") {
        $windowsCommand = Get-Command "${CommandName}.cmd" -ErrorAction SilentlyContinue
        if ($null -ne $windowsCommand) {
            return $windowsCommand.Source
        }

        $windowsBat = Get-Command "${CommandName}.bat" -ErrorAction SilentlyContinue
        if ($null -ne $windowsBat) {
            return $windowsBat.Source
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

function Get-HotfixDevProcess {
    if (-not (Test-Path $pidPath)) {
        return $null
    }

    $rawPid = (Get-Content $pidPath -Raw).Trim()
    if (-not $rawPid) {
        return $null
    }

    $processId = [int]$rawPid
    return Get-Process -Id $processId -ErrorAction SilentlyContinue
}

function Stop-ProcessTree {
    param([int]$RootProcessId)

    $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $RootProcessId }
    foreach ($child in $children) {
        Stop-ProcessTree -RootProcessId ([int]$child.ProcessId)
    }

    $process = Get-Process -Id $RootProcessId -ErrorAction SilentlyContinue
    if ($null -ne $process) {
        Stop-Process -Id $RootProcessId -Force
    }
}

function Assert-RequiredFiles {
    if (-not (Test-Path (Join-Path $deployDir ".env.local"))) {
        throw "Missing .env.local in $deployDir"
    }

    if (-not (Test-Path $settingsPath)) {
        throw "Missing settings.local.json in $deployDir"
    }

    if (-not (Test-Path $localDataHome)) {
        throw "Missing local-data directory in $deployDir"
    }

    if (-not (Test-Path $commonJsWatcherScript)) {
        throw "Missing CommonJS build guard script at $commonJsWatcherScript"
    }
}

function Remove-StaleLocalBuild {
    if (-not (Test-Path $staleLocalBuildDir)) {
        return
    }

    $resolvedDeployDir = (Resolve-Path $deployDir).Path
    $resolvedLocalBuildDir = (Resolve-Path $staleLocalBuildDir).Path
    if (-not $resolvedLocalBuildDir.StartsWith($resolvedDeployDir, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove stale local-build outside deploy directory: $resolvedLocalBuildDir"
    }

    Write-Host "Removing stale generated bundle directory that breaks native Meteor scanning: $resolvedLocalBuildDir"
    Remove-Item -LiteralPath $resolvedLocalBuildDir -Recurse -Force
}

function Start-HotfixDev {
    Assert-RequiredFiles
    Remove-StaleLocalBuild

    $existing = Get-HotfixDevProcess
    if ($null -ne $existing) {
        Write-Host "Hotfix dev server is already running with PID $($existing.Id)."
        Write-Host "URL: $rootUrl"
        return
    }

    if (-not (Test-Path $localDevDir)) {
        New-Item -ItemType Directory -Path $localDevDir | Out-Null
    }

    $dockerExe = Resolve-ExternalCommandName -CommandName "docker"
    $meteorExe = Resolve-ExternalCommandName -CommandName "meteor"

    Invoke-ExternalChecked -CommandLine (@($dockerExe) + $composeArgs + @("config")) -WorkingDirectory $deployDir
    Invoke-ExternalChecked -CommandLine (@($dockerExe) + $composeArgs + @("up", "-d", "mongodb")) -WorkingDirectory $deployDir

    Set-Content -Path $stdoutPath -Value ""
    Set-Content -Path $stderrPath -Value ""

    $previousMongoUrl = $env:MONGO_URL
    $previousExpectedMongoDbName = $env:EXPECTED_MONGO_DB_NAME
    $previousRootUrl = $env:ROOT_URL
    $previousPort = $env:PORT
    $previousMeteorSettingsWorkaround = $env:METEOR_SETTINGS_WORKAROUND
    $previousHome = $env:HOME

    try {
        $env:MONGO_URL = $mongoUrl
        $env:EXPECTED_MONGO_DB_NAME = $expectedMongoDbName
        $env:ROOT_URL = $rootUrl
        $env:PORT = $port
        $env:METEOR_SETTINGS_WORKAROUND = $settingsPath
        $env:HOME = $localDataHome

        Set-Content -Path $pidPath -Value ([string]$PID)

        $watcher = Start-Process `
            -FilePath "powershell" `
            -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $commonJsWatcherScript, "-AppDir", $appDir, "-PidPath", $pidPath) `
            -WorkingDirectory $deployDir `
            -RedirectStandardOutput $watcherStdoutPath `
            -RedirectStandardError $watcherStderrPath `
            -WindowStyle Hidden `
            -PassThru

        Set-Content -Path $watcherPidPath -Value ([string]$watcher.Id)

        $process = Start-Process `
            -FilePath $meteorExe `
            -ArgumentList @("--settings", $settingsPath, "--port", $port) `
            -WorkingDirectory $appDir `
            -RedirectStandardOutput $stdoutPath `
            -RedirectStandardError $stderrPath `
            -WindowStyle Hidden `
            -PassThru

        Set-Content -Path $pidPath -Value ([string]$process.Id)
        Write-Host "Started native Meteor hotfix dev server with PID $($process.Id)."
        Write-Host "URL: $rootUrl"
        Write-Host "Stdout: $stdoutPath"
        Write-Host "Stderr: $stderrPath"
    } finally {
        $env:MONGO_URL = $previousMongoUrl
        $env:EXPECTED_MONGO_DB_NAME = $previousExpectedMongoDbName
        $env:ROOT_URL = $previousRootUrl
        $env:PORT = $previousPort
        $env:METEOR_SETTINGS_WORKAROUND = $previousMeteorSettingsWorkaround
        $env:HOME = $previousHome
    }
}

function Stop-HotfixDev {
    if (Test-Path $watcherPidPath) {
        $rawWatcherPid = (Get-Content $watcherPidPath -Raw).Trim()
        if ($rawWatcherPid) {
            $watcherProcess = Get-Process -Id ([int]$rawWatcherPid) -ErrorAction SilentlyContinue
            if ($null -ne $watcherProcess) {
                Stop-ProcessTree -RootProcessId $watcherProcess.Id
            }
        }
        Remove-Item -LiteralPath $watcherPidPath -ErrorAction SilentlyContinue
    }

    $existing = Get-HotfixDevProcess
    if ($null -eq $existing) {
        Write-Host "Hotfix dev server is not running."
        if (Test-Path $pidPath) {
            Remove-Item -LiteralPath $pidPath
        }
        return
    }

    Stop-ProcessTree -RootProcessId $existing.Id
    Remove-Item -LiteralPath $pidPath -ErrorAction SilentlyContinue
    Write-Host "Stopped hotfix dev server PID $($existing.Id)."
}

function Show-HotfixDevStatus {
    $existing = Get-HotfixDevProcess
    if ($null -eq $existing) {
        Write-Host "Hotfix dev server is not running."
        return
    }

    Write-Host "Hotfix dev server is running with PID $($existing.Id)."
    Write-Host "URL: $rootUrl"
    Write-Host "Stdout: $stdoutPath"
    Write-Host "Stderr: $stderrPath"
    if (Test-Path $watcherPidPath) {
        Write-Host "CommonJS build guard PID: $((Get-Content $watcherPidPath -Raw).Trim())"
    }
}

function Show-HotfixDevLogs {
    if (-not (Test-Path $stdoutPath)) {
        throw "Missing stdout log at $stdoutPath"
    }

    Write-Host "---- stdout tail ----"
    Get-Content -Path $stdoutPath -Tail $LogTail

    if (Test-Path $stderrPath) {
        Write-Host "---- stderr tail ----"
        Get-Content -Path $stderrPath -Tail $LogTail
    }

    if (Test-Path $watcherStderrPath) {
        Write-Host "---- CommonJS build guard stderr tail ----"
        Get-Content -Path $watcherStderrPath -Tail $LogTail
    }
}

switch ($Action) {
    "start" {
        Start-HotfixDev
    }
    "restart" {
        Stop-HotfixDev
        Start-HotfixDev
    }
    "stop" {
        Stop-HotfixDev
    }
    "status" {
        Show-HotfixDevStatus
    }
    "logs" {
        Show-HotfixDevLogs
    }
}
