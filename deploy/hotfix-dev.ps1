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
$localAdminScript = Join-Path $deployDir "hotfix-dev\ensure-local-admin.cjs"
$localAgentSecretsPath = Join-Path $localDevDir "agent-secrets.env"
$meteorReleasePath = Join-Path $appDir ".meteor\release"

$expectedMongoDbName = "MoFACT-meteor3"
$rootUrl = "http://localhost:3200"
$port = "3200"
$defaultLocalAdminPassword = "local-admin-2026"

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

function Get-ProjectMeteorTool {
    if (-not (Test-Path $meteorReleasePath)) {
        throw "Missing Meteor release file at $meteorReleasePath"
    }

    $release = (Get-Content $meteorReleasePath -Raw).Trim()
    if (-not $release.StartsWith("METEOR@", [System.StringComparison]::Ordinal)) {
        throw "Unexpected Meteor release format in ${meteorReleasePath}: $release"
    }

    $version = $release.Substring("METEOR@".Length)
    if (-not $version) {
        throw "Meteor release version is empty in $meteorReleasePath"
    }

    $meteorInstall = Join-Path $env:LOCALAPPDATA ".meteor"
    $toolDir = Join-Path $meteorInstall "packages\meteor-tool\$version\mt-os.windows.x86_64"
    $toolBat = Join-Path $toolDir "meteor.bat"
    if (-not (Test-Path $toolBat)) {
        throw "Project requires Meteor $version, but the matching tool is missing at $toolBat"
    }

    return @{
        Version = $version
        InstallDir = $meteorInstall
        ToolDir = $toolDir
        ToolBat = $toolBat
    }
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

function Read-LocalEnvValue {
    param([string]$Name)

    $envPath = Join-Path $deployDir ".env.local"
    foreach ($line in Get-Content $envPath) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) {
            continue
        }

        $separatorIndex = $trimmed.IndexOf("=")
        if ($separatorIndex -lt 1) {
            continue
        }

        $key = $trimmed.Substring(0, $separatorIndex).Trim()
        if ($key -ne $Name) {
            continue
        }

        return $trimmed.Substring($separatorIndex + 1).Trim().Trim('"').Trim("'")
    }

    return ""
}

function Read-JsonFile {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        throw "Missing JSON file at $Path"
    }

    return Get-Content $Path -Raw | ConvertFrom-Json
}

function Read-AgentSecretValue {
    param([string]$Name)

    if (-not (Test-Path $localAgentSecretsPath)) {
        return ""
    }

    foreach ($line in Get-Content $localAgentSecretsPath) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) {
            continue
        }

        $separatorIndex = $trimmed.IndexOf("=")
        if ($separatorIndex -lt 1) {
            continue
        }

        $key = $trimmed.Substring(0, $separatorIndex).Trim()
        if ($key -ne $Name) {
            continue
        }

        return $trimmed.Substring($separatorIndex + 1).Trim().Trim('"').Trim("'")
    }

    return ""
}

function Get-NativeMongoUrl {
    $composeMongoUrl = Read-LocalEnvValue -Name "MONGO_URL"
    if (-not $composeMongoUrl) {
        throw ".env.local must define MONGO_URL for the native hotfix dev server"
    }

    return $composeMongoUrl -replace "@mongodb:", "@127.0.0.1:" -replace "//mongodb:", "//127.0.0.1:"
}

function Get-LocalAdminEmail {
    $settings = Read-JsonFile -Path $settingsPath
    $owner = ""
    if ($null -ne $settings.owner) {
        $owner = [string]$settings.owner
    }
    if (-not $owner.Trim()) {
        throw "settings.local.json must define owner for local admin bootstrap"
    }

    return $owner.Trim().ToLowerInvariant()
}

function New-LocalAdminPassword {
    return $defaultLocalAdminPassword
}

function Ensure-LocalAgentSecrets {
    if (-not (Test-Path $localDevDir)) {
        New-Item -ItemType Directory -Path $localDevDir | Out-Null
    }

    $email = Read-AgentSecretValue -Name "MOFACTS_AGENT_ADMIN_EMAIL"
    $password = Read-AgentSecretValue -Name "MOFACTS_AGENT_ADMIN_PASSWORD"
    $expectedEmail = Get-LocalAdminEmail

    if (-not $email -or $email -ne $expectedEmail) {
        $email = $expectedEmail
    }

    if (-not $password) {
        $password = New-LocalAdminPassword
    }

    $content = @(
        "MOFACTS_AGENT_ADMIN_EMAIL=$email",
        "MOFACTS_AGENT_ADMIN_PASSWORD=$password"
    )
    Set-Content -Path $localAgentSecretsPath -Value $content

    return @{
        Email = $email
        Password = $password
        Path = $localAgentSecretsPath
    }
}

function Ensure-CommonJsBuildMarker {
    $buildDir = Join-Path $appDir ".meteor\local\build"
    if (-not (Test-Path $buildDir)) {
        New-Item -ItemType Directory -Path $buildDir | Out-Null
    }

    Set-Content -Path (Join-Path $buildDir "package.json") -Value "{`"type`":`"commonjs`"}" -NoNewline
}

function Wait-HotfixDevReady {
    param([int]$TimeoutSeconds = 360)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $existing = Get-HotfixDevProcess
        if ($null -eq $existing) {
            throw "Hotfix dev server exited before it became ready"
        }

        if (Test-Path $stdoutPath) {
            $stdout = Get-Content -Path $stdoutPath -Raw -ErrorAction SilentlyContinue
            if ($stdout -match "=> App running at") {
                return
            }

            if ($stdout -match "=> Your application is crashing") {
                throw "Hotfix dev server is crashing. Run .\hotfix-dev.ps1 logs for details."
            }
        }

        if (Test-Path $stderrPath) {
            $stderr = Get-Content -Path $stderrPath -Raw -ErrorAction SilentlyContinue
            if ($stderr -match "ReferenceError|SyntaxError|TypeError|Error:") {
                $latestError = ($stderr -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -First 1)
                throw "Hotfix dev server startup error: $latestError"
            }
        }

        Start-Sleep -Seconds 5
    } while ((Get-Date) -lt $deadline)

    throw "Timed out waiting for hotfix dev server at $rootUrl"
}

function Ensure-LocalAdminAccount {
    $secrets = Ensure-LocalAgentSecrets
    $nodeExe = Resolve-ExternalCommandName -CommandName "node"

    $previousEmail = $env:MOFACTS_AGENT_ADMIN_EMAIL
    $previousPassword = $env:MOFACTS_AGENT_ADMIN_PASSWORD
    $previousDdpUrl = $env:MOFACTS_AGENT_DDP_URL

    try {
        $env:MOFACTS_AGENT_ADMIN_EMAIL = $secrets.Email
        $env:MOFACTS_AGENT_ADMIN_PASSWORD = $secrets.Password
        $env:MOFACTS_AGENT_DDP_URL = "ws://localhost:$port/websocket"
        Write-Host "Running: $nodeExe $localAdminScript"
        Push-Location $deployDir
        try {
            $output = & $nodeExe $localAdminScript 2>&1
            $exitCode = $LASTEXITCODE
        } finally {
            Pop-Location
        }

        if ($output) {
            $output | ForEach-Object { Write-Host $_ }
        }
        if ($exitCode -ne 0) {
            throw "Local admin bootstrap failed with exit code $exitCode"
        }

        $result = $null
        foreach ($line in $output) {
            $trimmed = [string]$line
            $trimmed = $trimmed.Trim()
            if ($trimmed.StartsWith("{") -and $trimmed.EndsWith("}")) {
                $result = $trimmed | ConvertFrom-Json
            }
        }

        Write-Host "Local admin ready: $($secrets.Email)"
        Write-Host "Local admin credentials: $($secrets.Path)"
        return ($null -ne $result -and $result.created -eq $true)
    } finally {
        $env:MOFACTS_AGENT_ADMIN_EMAIL = $previousEmail
        $env:MOFACTS_AGENT_ADMIN_PASSWORD = $previousPassword
        $env:MOFACTS_AGENT_DDP_URL = $previousDdpUrl
    }
}

function Get-HotfixDevProcess {
    if (-not (Test-Path $pidPath)) {
        return $null
    }

    $pidContent = Get-Content $pidPath -Raw -ErrorAction SilentlyContinue
    if ($null -eq $pidContent) {
        return $null
    }

    $rawPid = $pidContent.Trim()
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

    if (-not (Test-Path $localAdminScript)) {
        throw "Missing local admin bootstrap script at $localAdminScript"
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

function Ensure-RspackDevBootstrap {
    $mainDevDir = Join-Path $appDir "_build\main-dev"
    if (-not (Test-Path $mainDevDir)) {
        New-Item -ItemType Directory -Path $mainDevDir | Out-Null
    }

    $bootstrapFiles = @{
        "client-entry.js" = "if (module.hot) {`n  module.hot.accept();`n}`nimport '../../client/index.ts';`n"
        "server-entry.js" = "import '../../server/main.ts';`n"
        "client-meteor.js" = "/* Rspack dev-server serves the client bundle during hotfix dev. */`n"
        "server-meteor.js" = "import './server-rspack.js';`n"
        "client-rspack.js" = "/* Placeholder until Rspack writes the client bundle. */`n"
        "server-rspack.js" = "/* Placeholder until Rspack writes the server bundle. */`n"
    }

    foreach ($entry in $bootstrapFiles.GetEnumerator()) {
        $path = Join-Path $mainDevDir $entry.Key
        if (-not (Test-Path $path)) {
            Set-Content -Path $path -Value $entry.Value -NoNewline
        }
    }
}

function Start-HotfixDev {
    Assert-RequiredFiles
    Remove-StaleLocalBuild
    Ensure-RspackDevBootstrap
    Ensure-CommonJsBuildMarker

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
    $meteorTool = Get-ProjectMeteorTool

    Invoke-ExternalChecked -CommandLine (@($dockerExe) + $composeArgs + @("config")) -WorkingDirectory $deployDir
    Invoke-ExternalChecked -CommandLine (@($dockerExe) + $composeArgs + @("up", "-d", "mongodb")) -WorkingDirectory $deployDir
    Ensure-LocalAgentSecrets | Out-Null

    Set-Content -Path $stdoutPath -Value ""
    Set-Content -Path $stderrPath -Value ""

    $previousMongoUrl = $env:MONGO_URL
    $previousExpectedMongoDbName = $env:EXPECTED_MONGO_DB_NAME
    $previousRootUrl = $env:ROOT_URL
    $previousPort = $env:PORT
    $previousMeteorSettingsWorkaround = $env:METEOR_SETTINGS_WORKAROUND
    $previousHome = $env:HOME
    $previousPath = $env:PATH
    $previousMeteorInstallation = $env:METEOR_INSTALLATION

    try {
        $env:MONGO_URL = Get-NativeMongoUrl
        $env:EXPECTED_MONGO_DB_NAME = $expectedMongoDbName
        $env:ROOT_URL = $rootUrl
        $env:PORT = $port
        $env:METEOR_SETTINGS_WORKAROUND = $settingsPath
        $env:HOME = $localDataHome
        $env:METEOR_INSTALLATION = "$($meteorTool.InstallDir)\"
        $env:PATH = "$($meteorTool.ToolDir);$previousPath"

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
            -FilePath $meteorTool.ToolBat `
            -ArgumentList @("--settings", $settingsPath, "--port", $port) `
            -WorkingDirectory $appDir `
            -RedirectStandardOutput $stdoutPath `
            -RedirectStandardError $stderrPath `
            -WindowStyle Hidden `
            -PassThru

        Set-Content -Path $pidPath -Value ([string]$process.Id)
        Write-Host "Started native Meteor hotfix dev server with PID $($process.Id) using Meteor $($meteorTool.Version)."
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
        $env:PATH = $previousPath
        $env:METEOR_INSTALLATION = $previousMeteorInstallation
    }

    Wait-HotfixDevReady
    $createdLocalAdmin = Ensure-LocalAdminAccount
    if ($createdLocalAdmin) {
        Write-Host "Local admin was created for the first time; restarting once so startup sees the owner/admin account."
        Stop-HotfixDev
        Start-HotfixDev
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
