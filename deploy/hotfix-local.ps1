param(
    [ValidateSet("start", "restart", "stop", "status", "logs")]
    [string]$Action = "restart",
    [int]$LogTail = 120
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$deployDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = (Resolve-Path (Join-Path $deployDir "..\mofacts")).Path
$localDevDir = Join-Path $deployDir "local-hotfix"
$staleLocalBuildDir = Join-Path $deployDir "local-build"
$pidPath = Join-Path $localDevDir "meteor.pid"
$watcherPidPath = Join-Path $localDevDir "commonjs-watcher.pid"
$stdoutPath = Join-Path $localDevDir "meteor.stdout.log"
$stderrPath = Join-Path $localDevDir "meteor.stderr.log"
$watcherStdoutPath = Join-Path $localDevDir "commonjs-watcher.stdout.log"
$watcherStderrPath = Join-Path $localDevDir "commonjs-watcher.stderr.log"
$resolvedSettingsPath = ""
$localDataHome = Join-Path $deployDir "local-data"
$commonJsWatcherScript = Join-Path $deployDir "hotfix\ensure-commonjs-build.ps1"
$localAdminScript = Join-Path $deployDir "hotfix\ensure-local-admin.cjs"
$localAgentSecretsPath = Join-Path $localDevDir "agent-secrets.env"
$meteorReleasePath = Join-Path $appDir ".meteor\release"

$expectedMongoDbName = "MoFACT-meteor3"
$rootUrl = "http://localhost:3200"
$port = "3200"
$rspackDevServerPort = "8082"
$defaultLocalAdminPassword = "local-admin-2026"

$composeArgs = @(
    "compose",
    "--env-file", ".env.local",
    "-f", "docker-compose.yml",
    "-f", "docker-compose.local.yml"
)

function Test-WindowsHost {
    return [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
        [System.Runtime.InteropServices.OSPlatform]::Windows
    )
}

function Resolve-ExternalCommandName {
    param([string]$CommandName)

    if (Test-WindowsHost) {
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
    $toolVersion = if ($version -match '^\d+\.\d+$') { "$version.0" } else { $version }
    $toolDir = Join-Path $meteorInstall "packages\meteor-tool\$toolVersion\mt-os.windows.x86_64"
    $toolBat = Join-Path $toolDir "meteor.bat"
    if (-not (Test-Path $toolBat)) {
        throw "Project requires Meteor $version (tool $toolVersion), but the matching tool is missing at $toolBat"
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

function Resolve-HotfixDevSettingsPath {
    $configuredPath = Read-LocalEnvValue -Name "METEOR_SETTINGS_HOST_PATH"
    if (-not $configuredPath) {
        throw ".env.local must define METEOR_SETTINGS_HOST_PATH"
    }
    $candidate = if ([IO.Path]::IsPathRooted($configuredPath)) {
        $configuredPath
    } else {
        Join-Path $deployDir $configuredPath
    }
    if (-not (Test-Path -LiteralPath $candidate)) {
        throw "METEOR_SETTINGS_HOST_PATH does not identify an existing private settings file"
    }
    return (Resolve-Path -LiteralPath $candidate).Path
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
    $nativeMongoUrl = Read-LocalEnvValue -Name "MOFACTS_NATIVE_MONGO_URL"
    if (-not $nativeMongoUrl) {
        throw ".env.local must define MOFACTS_NATIVE_MONGO_URL for the localhost hotfix watcher"
    }

    # The URI is an opaque driver input. The connected Meteor/Mongo driver owns
    # authentication, database selection, replica-set validation, and options.
    return $nativeMongoUrl
}

function Wait-ForMongo {
    param(
        [string]$HostName,
        [int]$Port,
        [string]$DockerComposeBinary,
        [string[]]$ComposeArgs,
        [int]$TimeoutSeconds = 120,
        [int]$DelayMilliseconds = 500
    )

    function Test-MongoCommand {
        param([ValidateSet("root", "app")][string]$CredentialSet)

        $mongoCommand = if ($CredentialSet -eq "root") {
            'mongosh --quiet --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "db.adminCommand({ ping: 1 }).ok"'
        } else {
            'mongosh --quiet --username "$MOFACTS_MONGO_APP_USERNAME" --password "$MOFACTS_MONGO_APP_PASSWORD" --authenticationDatabase "$MOFACTS_MONGO_APP_DATABASE" --eval "db.runCommand({ ping: 1 }).ok"'
        }
        $command = @($DockerComposeBinary) + $ComposeArgs + @("exec", "-T", "mongodb", "sh", "-lc", $mongoCommand)
        $commandArgs = $command[1..($command.Length - 1)]
        Push-Location $deployDir
        try {
            $result = & $command[0] @commandArgs 2>&1
            if ($LASTEXITCODE -ne 0) {
                return $false
            }
        } finally {
            Pop-Location
        }

        return (([string]$result).Trim() -eq "1")
    }

    function Test-MongoTcp {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            try {
                $connectResult = $tcp.BeginConnect($HostName, $Port, $null, $null)
                if (-not $connectResult.AsyncWaitHandle.WaitOne(1000)) {
                    throw "timeout"
                }
                $tcp.EndConnect($connectResult)
                return $true
            } finally {
                $tcp.Close()
            }
        } catch {
            return $false
        }
    }

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ($true) {
        if (-not (Test-MongoTcp)) {
            if ((Get-Date) -ge $deadline) {
                throw "Timed out waiting for MongoDB TCP listener at ${HostName}:${Port} after ${TimeoutSeconds}s"
            }

            Start-Sleep -Milliseconds $DelayMilliseconds
            continue
        }

        if (-not (Test-MongoCommand -CredentialSet "root")) {
            if ((Get-Date) -ge $deadline) {
                throw "Timed out waiting for MongoDB root auth at ${HostName}:${Port} after ${TimeoutSeconds}s"
            }
            Start-Sleep -Milliseconds $DelayMilliseconds
            continue
        }

        if (-not (Test-MongoCommand -CredentialSet "app")) {
            if ((Get-Date) -ge $deadline) {
                throw "Timed out waiting for MongoDB app user auth at ${HostName}:${Port} after ${TimeoutSeconds}s"
            }
            Start-Sleep -Milliseconds $DelayMilliseconds
            continue
        }

        return
    }
}

function Get-ActiveChangeStreamCount {
    param(
        [string]$DockerComposeBinary,
        [string[]]$ComposeArgs
    )

    $command = @($DockerComposeBinary) + $ComposeArgs + @(
        "exec", "-T", "mongodb", "/opt/mofacts-mongodb/assert-change-streams.sh"
    )
    $commandArgs = $command[1..($command.Length - 1)]
    Push-Location $deployDir
    try {
        $result = & $command[0] @commandArgs 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "MongoDB reported no active Change Streams for the canonical localhost application."
        }
    } finally {
        Pop-Location
    }

    $count = 0
    if (-not [int]::TryParse(([string]$result).Trim(), [ref]$count) -or $count -lt 1) {
        throw "MongoDB returned an invalid active Change Stream count."
    }
    return $count
}

function Get-LocalAdminEmail {
    $settings = Read-JsonFile -Path $resolvedSettingsPath
    $owner = ""
    if ($null -ne $settings.owner) {
        $owner = [string]$settings.owner
    }
    if (-not $owner.Trim()) {
        throw "The settings JSON named by METEOR_SETTINGS_HOST_PATH must define owner for local admin bootstrap"
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
    $localMeteorDir = Join-Path $appDir ".meteor\local"
    $buildDir = Join-Path $appDir ".meteor\local\build"
    $packageJson = "{`"type`":`"commonjs`"}"

    if (-not (Test-Path $localMeteorDir)) {
        New-Item -ItemType Directory -Path $localMeteorDir | Out-Null
    }

    Set-Content -Path (Join-Path $localMeteorDir "package.json") -Value $packageJson -NoNewline

    if (-not (Test-Path $buildDir)) {
        New-Item -ItemType Directory -Path $buildDir | Out-Null
    }

    Set-Content -Path (Join-Path $buildDir "package.json") -Value $packageJson -NoNewline
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
            if (($stdout -match "=> App running at") -and (Test-HotfixDevEndpoints)) {
                return
            }

            if ($stdout -match "=> Your application is crashing") {
                throw "Hotfix watcher is crashing. Run .\hotfix-local.ps1 logs for details."
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
    $script:resolvedSettingsPath = Resolve-HotfixDevSettingsPath

    if (-not (Test-Path (Join-Path $deployDir ".env.local"))) {
        throw "Missing .env.local in $deployDir"
    }

    if (-not (Test-Path $resolvedSettingsPath)) {
        throw "Missing settings JSON at $resolvedSettingsPath"
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

function Test-TcpPortOpen {
    param(
        [string]$HostName,
        [int]$PortNumber,
        [int]$TimeoutMilliseconds = 1000
    )

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connect = $client.BeginConnect($HostName, $PortNumber, $null, $null)
        if (-not $connect.AsyncWaitHandle.WaitOne($TimeoutMilliseconds)) {
            return $false
        }

        $client.EndConnect($connect)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Test-HotfixDevEndpoints {
    return (Test-HotfixDevAppHealth) -and
        (Test-TcpPortOpen -HostName "127.0.0.1" -PortNumber ([int]$rspackDevServerPort))
}

function Test-HotfixDevAppHealth {
    try {
        $response = Invoke-WebRequest -Uri "$rootUrl/health" -UseBasicParsing -TimeoutSec 10
        if ($response.StatusCode -ne 200) {
            return $false
        }
        $payload = $response.Content | ConvertFrom-Json
        return $payload.status -eq "ok"
    } catch {
        return $false
    }
}

function Stop-OwnedRspackDevPortListener {
    $listeners = @(Get-NetTCPConnection -LocalPort ([int]$rspackDevServerPort) -State Listen -ErrorAction SilentlyContinue)
    foreach ($listener in $listeners) {
        $ownerProcessId = [int]$listener.OwningProcess
        $ownerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerProcessId" -ErrorAction SilentlyContinue
        if ($null -eq $ownerProcess) {
            continue
        }

        $commandLine = [string]$ownerProcess.CommandLine
        $isOwnedRspack = $commandLine -like "*$appDir*" -and
            $commandLine -match "rspack(\.js)?['`" ]+serve|webpack-dev-server" -and
            $commandLine -match "devServerPort=($rspackDevServerPort)|[: ]$rspackDevServerPort(\s|$)"
        if (-not $isOwnedRspack) {
            throw "Rspack HMR port $rspackDevServerPort is occupied by unrelated PID $ownerProcessId. Stop that process or configure a different port before starting hotfix dev."
        }

        Write-Host "Stopping stale MoFaCTS Rspack dev-server listener PID $ownerProcessId on port $rspackDevServerPort."
        Stop-ProcessTree -RootProcessId $ownerProcessId
    }
}

function Remove-RspackDevBuild {
    $mainDevDir = Join-Path $appDir "_build\main-dev"
    if (-not (Test-Path $mainDevDir)) {
        return
    }

    $resolvedAppDir = (Resolve-Path $appDir).Path
    $resolvedMainDevDir = (Resolve-Path $mainDevDir).Path
    if (-not $resolvedMainDevDir.StartsWith($resolvedAppDir, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove Rspack dev build outside app directory: $resolvedMainDevDir"
    }

    Write-Host "Removing generated Rspack dev bundle directory: $resolvedMainDevDir"
    Remove-Item -LiteralPath $resolvedMainDevDir -Recurse -Force
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

    $dockerExe = Resolve-ExternalCommandName -CommandName "docker"
    $meteorTool = Get-ProjectMeteorTool
    Invoke-ExternalChecked -CommandLine (@($dockerExe) + $composeArgs + @("config", "--quiet")) -WorkingDirectory $deployDir

    $existing = Get-HotfixDevProcess
    if ($null -ne $existing) {
        if (Test-HotfixDevEndpoints) {
            Write-Host "Hotfix dev server is already running with PID $($existing.Id)."
            Write-Host "URL: $rootUrl"
            return
        }

        Write-Host "Hotfix dev server PID $($existing.Id) is running but app/HMR ports are not both reachable; rebuilding generated dev bundles."
        Stop-HotfixDev
    }

    Remove-StaleLocalBuild
    Stop-OwnedRspackDevPortListener

    Remove-RspackDevBuild
    Ensure-RspackDevBootstrap
    Ensure-CommonJsBuildMarker

    if (-not (Test-Path $localDevDir)) {
        New-Item -ItemType Directory -Path $localDevDir | Out-Null
    }

    # localhost:3200 has one owner: this source-watching Meteor process. Remove
    # any bundle-runner container left by the discarded manual hotfix workflow.
    Invoke-ExternalChecked -CommandLine (@($dockerExe) + $composeArgs + @("stop", "mofacts")) -WorkingDirectory $deployDir
    Invoke-ExternalChecked -CommandLine (@($dockerExe) + $composeArgs + @("rm", "-f", "mofacts")) -WorkingDirectory $deployDir
    Invoke-ExternalChecked -CommandLine (@($dockerExe) + $composeArgs + @("up", "-d", "mongodb", "mongodb-replica-init")) -WorkingDirectory $deployDir
    $nativeMongoUrl = Get-NativeMongoUrl

    Write-Host "Waiting for the canonical local MongoDB endpoint at 127.0.0.1:27017..."
    Wait-ForMongo `
        -HostName "127.0.0.1" `
        -Port 27017 `
        -DockerComposeBinary $dockerExe `
        -ComposeArgs $composeArgs | Out-Null
    Ensure-LocalAgentSecrets | Out-Null

    Set-Content -Path $stdoutPath -Value ""
    Set-Content -Path $stderrPath -Value ""

    $previousMongoUrl = $env:MONGO_URL
    $previousExpectedMongoDbName = $env:EXPECTED_MONGO_DB_NAME
    $previousRootUrl = $env:ROOT_URL
    $previousPort = $env:PORT
    $previousChangeStreamsEnabled = $env:MOFACTS_CHANGE_STREAMS_ENABLED
    $previousChangeStreamsQualification = $env:MOFACTS_CHANGE_STREAMS_QUALIFICATION
    $previousReactivityOrder = $env:METEOR_REACTIVITY_ORDER
    $previousDdpTransport = $env:DDP_TRANSPORT
    $previousPath = $env:PATH
    $previousMeteorInstallation = $env:METEOR_INSTALLATION

    try {
        $env:MONGO_URL = $nativeMongoUrl
        $env:EXPECTED_MONGO_DB_NAME = $expectedMongoDbName
        $env:ROOT_URL = $rootUrl
        $env:PORT = $port
        $env:MOFACTS_CHANGE_STREAMS_ENABLED = "true"
        $env:MOFACTS_CHANGE_STREAMS_QUALIFICATION = "false"
        $env:METEOR_REACTIVITY_ORDER = "changeStreams,polling"
        $env:DDP_TRANSPORT = "sockjs"
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
            -ArgumentList @("--settings", $resolvedSettingsPath, "--port", $port) `
            -WorkingDirectory $appDir `
            -RedirectStandardOutput $stdoutPath `
            -RedirectStandardError $stderrPath `
            -WindowStyle Hidden `
            -PassThru

        Set-Content -Path $pidPath -Value ([string]$process.Id)
        Write-Host "Started canonical source-watching hotfix server with PID $($process.Id) using Meteor $($meteorTool.Version)."
        Write-Host "URL: $rootUrl"
        Write-Host "Stdout: $stdoutPath"
        Write-Host "Stderr: $stderrPath"
    } finally {
        $env:MONGO_URL = $previousMongoUrl
        $env:EXPECTED_MONGO_DB_NAME = $previousExpectedMongoDbName
        $env:ROOT_URL = $previousRootUrl
        $env:PORT = $previousPort
        $env:MOFACTS_CHANGE_STREAMS_ENABLED = $previousChangeStreamsEnabled
        $env:MOFACTS_CHANGE_STREAMS_QUALIFICATION = $previousChangeStreamsQualification
        $env:METEOR_REACTIVITY_ORDER = $previousReactivityOrder
        $env:DDP_TRANSPORT = $previousDdpTransport
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
    $dockerExe = Resolve-ExternalCommandName -CommandName "docker"
    $existing = Get-HotfixDevProcess
    if ($null -eq $existing) {
        Write-Host "Hotfix dev server is not running."
        return
    }

    Write-Host "Hotfix dev server is running with PID $($existing.Id)."
    Write-Host "URL: $rootUrl"
    Write-Host "App health endpoint ready: $(Test-HotfixDevAppHealth)"
    Write-Host "Rspack HMR port $rspackDevServerPort reachable: $(Test-TcpPortOpen -HostName "127.0.0.1" -PortNumber ([int]$rspackDevServerPort))"
    $activeChangeStreams = Get-ActiveChangeStreamCount -DockerComposeBinary $dockerExe -ComposeArgs $composeArgs
    Write-Host "Active MongoDB Change Streams: $activeChangeStreams"
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
        Assert-RequiredFiles
        Remove-RspackDevBuild
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
