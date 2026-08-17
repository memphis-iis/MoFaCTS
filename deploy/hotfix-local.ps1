param(
    [ValidateSet("start", "restart", "stop", "status", "logs", "__supervise")]
    [string]$Action = "restart",
    [int]$LogTail = 120
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$managerScriptPath = $MyInvocation.MyCommand.Path
$deployDir = Split-Path -Parent $managerScriptPath
$appDir = (Resolve-Path (Join-Path $deployDir "..\mofacts")).Path
$localDevDir = Join-Path $deployDir "local-hotfix"
$staleLocalBuildDir = Join-Path $deployDir "local-build"
$pidPath = Join-Path $localDevDir "meteor.pid"
$supervisorPidPath = Join-Path $localDevDir "supervisor.pid"
$runStatePath = Join-Path $localDevDir "run-state.json"
$stopRequestPath = Join-Path $localDevDir "stop.requested"
$runHistoryDir = Join-Path $localDevDir "runs"
$stdoutPath = Join-Path $localDevDir "meteor.stdout.log"
$stderrPath = Join-Path $localDevDir "meteor.stderr.log"
$supervisorStdoutPath = Join-Path $localDevDir "supervisor.stdout.log"
$supervisorStderrPath = Join-Path $localDevDir "supervisor.stderr.log"
$resolvedSettingsPath = ""
$localDataHome = Join-Path $deployDir "local-data"
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

function New-HotfixProcessJob {
    if (-not (Test-WindowsHost)) {
        throw "The canonical hotfix supervisor requires Windows Job Objects."
    }

    if (-not ("MoFaCTS.HotfixProcessJob" -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace MoFaCTS {
    public sealed class HotfixProcessJob : IDisposable {
        private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
        private IntPtr handle;

        [StructLayout(LayoutKind.Sequential)]
        private struct IO_COUNTERS {
            public ulong ReadOperationCount;
            public ulong WriteOperationCount;
            public ulong OtherOperationCount;
            public ulong ReadTransferCount;
            public ulong WriteTransferCount;
            public ulong OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
            public long PerProcessUserTimeLimit;
            public long PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize;
            public UIntPtr MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass;
            public uint SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
            public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
            public IO_COUNTERS IoInfo;
            public UIntPtr ProcessMemoryLimit;
            public UIntPtr JobMemoryLimit;
            public UIntPtr PeakProcessMemoryUsed;
            public UIntPtr PeakJobMemoryUsed;
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr CreateJobObject(IntPtr attributes, string name);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetInformationJobObject(
            IntPtr job,
            int informationClass,
            ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION information,
            uint informationLength);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr handle);

        public HotfixProcessJob(string name) {
            handle = CreateJobObject(IntPtr.Zero, name);
            if (handle == IntPtr.Zero) {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to create the hotfix process job.");
            }

            var information = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            information.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if (!SetInformationJobObject(handle, 9, ref information, (uint)Marshal.SizeOf(information))) {
                int error = Marshal.GetLastWin32Error();
                CloseHandle(handle);
                handle = IntPtr.Zero;
                throw new Win32Exception(error, "Unable to configure the hotfix process job.");
            }
        }

        public void AddProcess(int processId) {
            using (var process = Process.GetProcessById(processId)) {
                if (!AssignProcessToJobObject(handle, process.Handle)) {
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to assign Meteor to the hotfix process job.");
                }
            }
        }

        public void Dispose() {
            if (handle != IntPtr.Zero) {
                CloseHandle(handle);
                handle = IntPtr.Zero;
            }
            GC.SuppressFinalize(this);
        }
    }
}
'@
    }

    return [MoFaCTS.HotfixProcessJob]::new("MoFaCTS-Hotfix-$([string]$env:MOFACTS_HOTFIX_RUN_ID)")
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
    $nodeExe = Join-Path $toolDir "dev_bundle\bin\node.exe"
    $warningModule = Join-Path $toolDir "tools\node-process-warnings.js"
    $toolEntry = Join-Path $toolDir "tools\index.js"
    $nodePath = Join-Path $toolDir "dev_bundle\lib\node_modules"
    $babelCacheDir = Join-Path $toolDir ".babel-cache"
    foreach ($requiredPath in @($nodeExe, $warningModule, $toolEntry, $nodePath)) {
        if (-not (Test-Path $requiredPath)) {
            throw "Project requires Meteor $version (tool $toolVersion), but the pinned tool is incomplete at $requiredPath"
        }
    }

    return @{
        Version = $version
        InstallDir = $meteorInstall
        ToolDir = $toolDir
        NodeExe = $nodeExe
        WarningModule = $warningModule
        ToolEntry = $toolEntry
        NodePath = $nodePath
        BabelCacheDir = $babelCacheDir
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
        [int]$DelayMilliseconds = 500,
        [int]$RequiredStableChecks = 4,
        [int]$StabilityIntervalMilliseconds = 2000
    )

    function Test-MongoCommand {
        param([ValidateSet("root", "app")][string]$CredentialSet)

        $mongoCommand = if ($CredentialSet -eq "root") {
            'mongosh --quiet --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval ''const h = db.adminCommand({ hello: 1 }); print(h.ok === 1 && h.setName === process.env.MOFACTS_MONGO_REPLICA_SET_NAME && h.isWritablePrimary === true ? 1 : 0)'''
        } else {
            'mongosh --quiet --username "$MOFACTS_MONGO_APP_USERNAME" --password "$MOFACTS_MONGO_APP_PASSWORD" --authenticationDatabase "$MOFACTS_MONGO_APP_DATABASE" --eval ''db.runCommand({ ping: 1 }).ok'''
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
    $stableChecks = 0
    while ($true) {
        if (-not (Test-MongoTcp)) {
            $stableChecks = 0
            if ((Get-Date) -ge $deadline) {
                throw "Timed out waiting for MongoDB TCP listener at ${HostName}:${Port} after ${TimeoutSeconds}s"
            }

            Start-Sleep -Milliseconds $DelayMilliseconds
            continue
        }

        if (-not (Test-MongoCommand -CredentialSet "root")) {
            $stableChecks = 0
            if ((Get-Date) -ge $deadline) {
                throw "Timed out waiting for MongoDB root auth at ${HostName}:${Port} after ${TimeoutSeconds}s"
            }
            Start-Sleep -Milliseconds $DelayMilliseconds
            continue
        }

        if (-not (Test-MongoCommand -CredentialSet "app")) {
            $stableChecks = 0
            if ((Get-Date) -ge $deadline) {
                throw "Timed out waiting for MongoDB app user auth at ${HostName}:${Port} after ${TimeoutSeconds}s"
            }
            Start-Sleep -Milliseconds $DelayMilliseconds
            continue
        }

        $stableChecks += 1
        if ($stableChecks -ge $RequiredStableChecks) {
            return
        }

        Start-Sleep -Milliseconds $StabilityIntervalMilliseconds
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

function Ensure-CommonJsBoundary {
    $localMeteorDir = Join-Path $appDir ".meteor\local"
    $packageJson = "{`"type`":`"commonjs`"}"

    if (-not (Test-Path $localMeteorDir)) {
        New-Item -ItemType Directory -Path $localMeteorDir | Out-Null
    }

    # This stable ancestor owns the module boundary for every generated Meteor
    # build below .meteor/local. Do not poll generated build directories or
    # touch application source to force a second rebuild.
    Set-Content -Path (Join-Path $localMeteorDir "package.json") -Value $packageJson -NoNewline
}

function Wait-HotfixDevReady {
    param([int]$TimeoutSeconds = 360)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $existing = Get-HotfixDevProcess
        if ($null -eq $existing) {
            $supervisor = Get-HotfixSupervisorProcess
            if ($null -ne $supervisor) {
                Start-Sleep -Seconds 1
                continue
            }

            $failureSummary = Get-HotfixFailureSummary
            $detail = if ($failureSummary) { " $failureSummary" } else { "" }
            throw "Hotfix supervisor exited before Meteor became ready.$detail"
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

function Get-TrackedProcessId {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    $pidContent = Get-Content -LiteralPath $Path -Raw -ErrorAction SilentlyContinue
    if ($null -eq $pidContent) {
        return $null
    }

    $rawPid = $pidContent.Trim()
    if ($rawPid -notmatch '^\d+$') {
        return $null
    }

    return [int]$rawPid
}

function Test-TrackedProcess {
    param(
        $Process,
        [string]$TrackingPath,
        [string]$ExpectedExecutablePath
    )

    if ($null -eq $Process -or -not (Test-Path -LiteralPath $TrackingPath)) {
        return $false
    }

    $trackedAtUtc = (Get-Item -LiteralPath $TrackingPath).LastWriteTimeUtc
    $startedAtUtc = $Process.StartTime.ToUniversalTime()
    $expectedPath = [IO.Path]::GetFullPath($ExpectedExecutablePath)
    $actualPath = [IO.Path]::GetFullPath($Process.Path)
    return [Math]::Abs(($trackedAtUtc - $startedAtUtc).TotalSeconds) -le 30 -and
        $actualPath.Equals($expectedPath, [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-HotfixDevProcess {
    $processId = Get-TrackedProcessId -Path $pidPath
    if ($null -eq $processId) {
        return $null
    }

    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    $meteorTool = Get-ProjectMeteorTool
    if (-not (Test-TrackedProcess -Process $process -TrackingPath $pidPath -ExpectedExecutablePath $meteorTool.NodeExe)) {
        return $null
    }

    return $process
}

function Get-HotfixSupervisorProcess {
    $processId = Get-TrackedProcessId -Path $supervisorPidPath
    if ($null -eq $processId) {
        return $null
    }

    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    $powershellPath = (Get-Command powershell -ErrorAction Stop).Source
    if (-not (Test-TrackedProcess -Process $process -TrackingPath $supervisorPidPath -ExpectedExecutablePath $powershellPath)) {
        return $null
    }

    return $process
}

function Stop-ProcessTree {
    param([int]$RootProcessId)

    $process = Get-Process -Id $RootProcessId -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        return
    }

    & taskkill.exe /PID $RootProcessId /T /F 2>$null | Out-Null
}

function Stop-OwnedSupervisorProcesses {
    $process = Get-HotfixSupervisorProcess
    if ($null -ne $process) {
        Write-Host "Stopping stale MoFaCTS hotfix supervisor PID $($process.Id)."
        Stop-ProcessTree -RootProcessId $process.Id
    }
}

function Get-ObsoleteCommonJsGuardProcesses {
    $obsoletePidPath = Join-Path $localDevDir "commonjs-watcher.pid"
    $processId = Get-TrackedProcessId -Path $obsoletePidPath
    if ($null -eq $processId) {
        return @()
    }

    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    $powershellPath = (Get-Command powershell -ErrorAction Stop).Source
    if (Test-TrackedProcess -Process $process -TrackingPath $obsoletePidPath -ExpectedExecutablePath $powershellPath) {
        return @($process)
    }

    return @()
}

function Stop-ObsoleteCommonJsGuardProcesses {
    foreach ($process in @(Get-ObsoleteCommonJsGuardProcesses)) {
        Write-Host "Stopping obsolete MoFaCTS CommonJS guard PID $($process.Id)."
        Stop-ProcessTree -RootProcessId $process.Id
    }
    Remove-Item -LiteralPath (Join-Path $localDevDir "commonjs-watcher.pid") -ErrorAction SilentlyContinue
}

function Write-HotfixRunState {
    param(
        [string]$Status,
        $MeteorProcessId = $null,
        $ExitCode = $null
    )

    if (-not (Test-Path -LiteralPath $localDevDir)) {
        New-Item -ItemType Directory -Path $localDevDir | Out-Null
    }

    $state = [ordered]@{
        runId = [string]$env:MOFACTS_HOTFIX_RUN_ID
        status = $Status
        startedAtUtc = [string]$env:MOFACTS_HOTFIX_STARTED_AT_UTC
        updatedAtUtc = [DateTime]::UtcNow.ToString("o")
        supervisorPid = $PID
        meteorPid = $MeteorProcessId
        exitCode = $ExitCode
    }
    $temporaryPath = "$runStatePath.$PID.tmp"
    $state | ConvertTo-Json | Set-Content -LiteralPath $temporaryPath
    Move-Item -LiteralPath $temporaryPath -Destination $runStatePath -Force
}

function Set-HotfixRunStateStatus {
    param([string]$Status)

    if (-not (Test-Path -LiteralPath $runStatePath)) {
        return
    }

    $state = Get-Content -LiteralPath $runStatePath -Raw | ConvertFrom-Json
    $state.status = $Status
    $state.updatedAtUtc = [DateTime]::UtcNow.ToString("o")
    $temporaryPath = "$runStatePath.$PID.tmp"
    $state | ConvertTo-Json | Set-Content -LiteralPath $temporaryPath
    Move-Item -LiteralPath $temporaryPath -Destination $runStatePath -Force
}

function Archive-HotfixRunLogs {
    $paths = @($stdoutPath, $stderrPath, $supervisorStdoutPath, $supervisorStderrPath, $runStatePath)
    if (-not ($paths | Where-Object { Test-Path -LiteralPath $_ })) {
        return
    }

    if (-not (Test-Path -LiteralPath $runHistoryDir)) {
        New-Item -ItemType Directory -Path $runHistoryDir | Out-Null
    }

    $archivePrefix = [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmssfff")
    foreach ($path in $paths) {
        if (-not (Test-Path -LiteralPath $path)) {
            continue
        }

        $item = Get-Item -LiteralPath $path
        if ($item.Length -eq 0) {
            Remove-Item -LiteralPath $path
            continue
        }

        $destination = Join-Path $runHistoryDir "$archivePrefix-$($item.Name)"
        Move-Item -LiteralPath $path -Destination $destination
    }
}

function Get-HotfixFailureSummary {
    $stdout = if (Test-Path -LiteralPath $stdoutPath) {
        [string](Get-Content -LiteralPath $stdoutPath -Raw -ErrorAction SilentlyContinue)
    } else { "" }
    $stderr = if (Test-Path -LiteralPath $stderrPath) {
        [string](Get-Content -LiteralPath $stderrPath -Raw -ErrorAction SilentlyContinue)
    } else { "" }
    $combined = "$stdout`n$stderr"

    if ($combined -match 'ERR_IPC_CHANNEL_CLOSED') {
        return "Meteor IPC channel closed during a rebuild."
    }
    if ($combined -match "Module not found: Can't resolve .*_build\\main-dev\\client-entry\.js") {
        return "Rspack lost the generated development client entry during a rebuild."
    }
    if ($combined -match 'ModuleGraphModule .* not found') {
        return "Rspack failed inside its module graph."
    }
    if ($combined -match 'PoolClearedOnNetworkError|MongoNetworkTimeoutError|MongoTopologyClosedError|MongoServerSelectionError') {
        return "Meteor lost its MongoDB connection pool."
    }
    if ($combined -match '=> Your application is crashing') {
        return "Meteor reported an application crash."
    }

    return ""
}

function Invoke-HotfixSupervisor {
    $meteorTool = Get-ProjectMeteorTool
    $settingsPath = Resolve-HotfixDevSettingsPath
    $meteorProcess = $null
    $processJob = $null
    $exitCode = 1

    Set-Content -LiteralPath $supervisorPidPath -Value ([string]$PID)
    Remove-Item -LiteralPath $stopRequestPath -ErrorAction SilentlyContinue

    try {
        $processJob = New-HotfixProcessJob
        $meteorArguments = @(
            "--no-wasm-code-gc",
            "--require=$($meteorTool.WarningModule)",
            $meteorTool.ToolEntry,
            "--settings",
            $settingsPath,
            "--port",
            $port
        )
        $meteorProcess = Start-Process `
            -FilePath $meteorTool.NodeExe `
            -ArgumentList $meteorArguments `
            -WorkingDirectory $appDir `
            -RedirectStandardOutput $stdoutPath `
            -RedirectStandardError $stderrPath `
            -WindowStyle Hidden `
            -PassThru

        $processJob.AddProcess($meteorProcess.Id)
        Set-Content -LiteralPath $pidPath -Value ([string]$meteorProcess.Id)
        Write-HotfixRunState -Status "running" -MeteorProcessId $meteorProcess.Id
        Wait-Process -Id $meteorProcess.Id
        $meteorProcess.Refresh()
        $exitCode = $meteorProcess.ExitCode
        $status = if (Test-Path -LiteralPath $stopRequestPath) { "stopped" } else { "exited" }
        Write-HotfixRunState -Status $status -MeteorProcessId $meteorProcess.Id -ExitCode $exitCode
    } catch {
        Write-HotfixRunState -Status "failed" -MeteorProcessId $(if ($null -ne $meteorProcess) { $meteorProcess.Id } else { $null }) -ExitCode $exitCode
        Write-Error "Hotfix supervisor failed: $($_.Exception.Message)" -ErrorAction Continue
    } finally {
        if ($null -ne $meteorProcess) {
            Stop-ProcessTree -RootProcessId $meteorProcess.Id
        }
        if ($null -ne $processJob) {
            $processJob.Dispose()
        }
        Remove-Item -LiteralPath $pidPath -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $stopRequestPath -ErrorAction SilentlyContinue

        $trackedSupervisorId = Get-TrackedProcessId -Path $supervisorPidPath
        if ($trackedSupervisorId -eq $PID) {
            Remove-Item -LiteralPath $supervisorPidPath -ErrorAction SilentlyContinue
        }
    }

    return $exitCode
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
        (Test-TcpPortOpen -HostName "127.0.0.1" -PortNumber ([int]$rspackDevServerPort)) -and
        (Get-HotfixDevClientBundleState).Ready
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

function Get-HotfixDevClientBundleState {
    $bundleUrl = "$rootUrl/__rspack__/client-rspack.js"
    try {
        $response = Invoke-WebRequest -Uri $bundleUrl -UseBasicParsing -TimeoutSec 10
        if ($response.StatusCode -ne 200) {
            return [pscustomobject]@{
                Ready = $false
                Reason = "Client bundle returned HTTP $($response.StatusCode)."
            }
        }

        $content = [string]$response.Content
        if ($content.Length -lt 1024 -or $content.Contains("Placeholder until Rspack writes the client bundle")) {
            return [pscustomobject]@{
                Ready = $false
                Reason = "Client bundle is still the generated bootstrap placeholder."
            }
        }

        if (-not $content.Contains("./_build/main-dev/client-entry.js")) {
            return [pscustomobject]@{
                Ready = $false
                Reason = "Client bundle does not contain the Hotfix application entry."
            }
        }

        if (-not $content.Contains("__mofactsRspackClient")) {
            return [pscustomobject]@{
                Ready = $false
                Reason = "Client bundle is missing the browser-owned output marker."
            }
        }

        if ($content -match '(?m)\bmodule\.exports\s*=\s*__webpack_exports__\s*;') {
            return [pscustomobject]@{
                Ready = $false
                Reason = "Client bundle still has the invalid CommonJS browser footer."
            }
        }

        return [pscustomobject]@{
            Ready = $true
            Reason = "Browser client bundle is executable."
        }
    } catch {
        return [pscustomobject]@{
            Ready = $false
            Reason = "Client bundle request failed: $($_.Exception.Message)"
        }
    }
}

function Assert-RspackDevPortAvailable {
    $listeners = @(Get-NetTCPConnection -LocalPort ([int]$rspackDevServerPort) -State Listen -ErrorAction SilentlyContinue)
    foreach ($listener in $listeners) {
        $ownerProcessId = [int]$listener.OwningProcess
        $ownerProcess = Get-Process -Id $ownerProcessId -ErrorAction SilentlyContinue
        if ($null -eq $ownerProcess) {
            continue
        }

        throw "Rspack HMR port $rspackDevServerPort is occupied by unrelated PID $ownerProcessId. Stop that process or configure a different port before starting hotfix dev."
    }
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
    }

    foreach ($entry in $bootstrapFiles.GetEnumerator()) {
        $path = Join-Path $mainDevDir $entry.Key
        if (-not (Test-Path $path)) {
            Set-Content -Path $path -Value $entry.Value -NoNewline
        }
    }
}

function Reset-RspackDevContext {
    $buildRoot = [IO.Path]::GetFullPath((Join-Path $appDir "_build"))
    $mainDevDir = [IO.Path]::GetFullPath((Join-Path $buildRoot "main-dev"))
    $expectedPrefix = $buildRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $mainDevDir.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to reset Rspack development context outside $buildRoot"
    }

    # A complete cold-start reset is safe only here, after every owned process
    # has stopped and before either watcher starts. During a live run the
    # Rspack plugin preserves these files so no watcher observes a missing
    # entry or bridge file.
    if (Test-Path -LiteralPath $mainDevDir) {
        Remove-Item -LiteralPath $mainDevDir -Recurse -Force
    }
    Ensure-RspackDevBootstrap

    $outputFiles = @{
        "client-rspack.js" = "/* Placeholder until Rspack writes the client bundle. */`n"
        "server-rspack.js" = "/* Placeholder until Rspack writes the server bundle. */`n"
    }
    foreach ($entry in $outputFiles.GetEnumerator()) {
        Set-Content -LiteralPath (Join-Path $mainDevDir $entry.Key) -Value $entry.Value -NoNewline
    }
}

function Start-HotfixDev {
    param([ValidateRange(0, 1)][int]$RecoveryAttempt = 0)

    Assert-RequiredFiles

    $dockerExe = Resolve-ExternalCommandName -CommandName "docker"
    $meteorTool = Get-ProjectMeteorTool
    Invoke-ExternalChecked -CommandLine (@($dockerExe) + $composeArgs + @("config", "--quiet")) -WorkingDirectory $deployDir

    $existing = Get-HotfixDevProcess
    $existingSupervisor = Get-HotfixSupervisorProcess
    if ($null -ne $existing) {
        if ($null -ne $existingSupervisor -and (Test-HotfixDevEndpoints)) {
            Write-Host "Hotfix dev server is already running with PID $($existing.Id) under supervisor PID $($existingSupervisor.Id)."
            Write-Host "URL: $rootUrl"
            return
        }

        Write-Host "Hotfix dev server PID $($existing.Id) lacks a healthy supervised runtime; rebuilding generated dev bundles."
        Stop-HotfixDev
    }

    Remove-StaleLocalBuild
    Stop-ObsoleteCommonJsGuardProcesses
    Stop-OwnedSupervisorProcesses
    Assert-RspackDevPortAvailable

    Reset-RspackDevContext
    Ensure-CommonJsBoundary

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

    Archive-HotfixRunLogs
    Set-Content -Path $stdoutPath -Value ""
    Set-Content -Path $stderrPath -Value ""
    Set-Content -Path $supervisorStdoutPath -Value ""
    Set-Content -Path $supervisorStderrPath -Value ""

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
    $previousNodePath = $env:NODE_PATH
    $previousBabelCacheDir = $env:BABEL_CACHE_DIR
    $previousHotfixRunId = $env:MOFACTS_HOTFIX_RUN_ID
    $previousHotfixStartedAt = $env:MOFACTS_HOTFIX_STARTED_AT_UTC

    try {
        $env:MONGO_URL = $nativeMongoUrl
        $env:EXPECTED_MONGO_DB_NAME = $expectedMongoDbName
        $env:ROOT_URL = $rootUrl
        $env:PORT = $port
        Remove-Item Env:MOFACTS_CHANGE_STREAMS_ENABLED -ErrorAction SilentlyContinue
        $env:MOFACTS_CHANGE_STREAMS_QUALIFICATION = "false"
        $env:METEOR_REACTIVITY_ORDER = "changeStreams"
        $env:DDP_TRANSPORT = "sockjs"
        $env:METEOR_INSTALLATION = "$($meteorTool.InstallDir)\"
        $env:PATH = "$($meteorTool.ToolDir);$previousPath"
        $env:NODE_PATH = $meteorTool.NodePath
        $env:BABEL_CACHE_DIR = $meteorTool.BabelCacheDir
        $env:MOFACTS_HOTFIX_RUN_ID = [Guid]::NewGuid().ToString("N")
        $env:MOFACTS_HOTFIX_STARTED_AT_UTC = [DateTime]::UtcNow.ToString("o")

        $supervisor = Start-Process `
            -FilePath "powershell" `
            -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $managerScriptPath, "-Action", "__supervise") `
            -WorkingDirectory $deployDir `
            -RedirectStandardOutput $supervisorStdoutPath `
            -RedirectStandardError $supervisorStderrPath `
            -WindowStyle Hidden `
            -PassThru

        Set-Content -Path $supervisorPidPath -Value ([string]$supervisor.Id)
        Write-Host "Started canonical hotfix supervisor PID $($supervisor.Id) using Meteor $($meteorTool.Version)."
        Write-Host "URL: $rootUrl"
        Write-Host "Stdout: $stdoutPath"
        Write-Host "Stderr: $stderrPath"
    } finally {
        $env:MONGO_URL = $previousMongoUrl
        $env:EXPECTED_MONGO_DB_NAME = $previousExpectedMongoDbName
        $env:ROOT_URL = $previousRootUrl
        $env:PORT = $previousPort
        if ($null -eq $previousChangeStreamsEnabled) {
            Remove-Item Env:MOFACTS_CHANGE_STREAMS_ENABLED -ErrorAction SilentlyContinue
        } else {
            $env:MOFACTS_CHANGE_STREAMS_ENABLED = $previousChangeStreamsEnabled
        }
        $env:MOFACTS_CHANGE_STREAMS_QUALIFICATION = $previousChangeStreamsQualification
        $env:METEOR_REACTIVITY_ORDER = $previousReactivityOrder
        $env:DDP_TRANSPORT = $previousDdpTransport
        $env:PATH = $previousPath
        $env:METEOR_INSTALLATION = $previousMeteorInstallation
        $env:NODE_PATH = $previousNodePath
        $env:BABEL_CACHE_DIR = $previousBabelCacheDir
        $env:MOFACTS_HOTFIX_RUN_ID = $previousHotfixRunId
        $env:MOFACTS_HOTFIX_STARTED_AT_UTC = $previousHotfixStartedAt
    }

    try {
        Wait-HotfixDevReady
    } catch {
        $startupError = $_
        $failureSummary = Get-HotfixFailureSummary
        Stop-HotfixDev
        Set-HotfixRunStateStatus -Status "startup-failed"
        if ($RecoveryAttempt -eq 0 -and $failureSummary -eq "Meteor lost its MongoDB connection pool.") {
            Write-Host "Meteor lost MongoDB during startup; retrying the canonical supervised run once after the stable writable-primary gate."
            Start-HotfixDev -RecoveryAttempt 1
            return
        }
        throw $startupError
    }
    $createdLocalAdmin = Ensure-LocalAdminAccount
    if ($createdLocalAdmin) {
        Write-Host "Local admin was created for the first time; restarting once so startup sees the owner/admin account."
        Stop-HotfixDev
        Start-HotfixDev
    }
}

function Stop-HotfixDev {
    Stop-ObsoleteCommonJsGuardProcesses
    $existing = Get-HotfixDevProcess
    $supervisor = Get-HotfixSupervisorProcess
    if ($null -eq $existing -and $null -eq $supervisor) {
        Write-Host "Hotfix dev server is not running."
        Remove-Item -LiteralPath $pidPath -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $supervisorPidPath -ErrorAction SilentlyContinue
        Stop-OwnedSupervisorProcesses
        return
    }

    Set-Content -LiteralPath $stopRequestPath -Value ([DateTime]::UtcNow.ToString("o"))
    if ($null -ne $existing) {
        Stop-ProcessTree -RootProcessId $existing.Id
    }
    if ($null -ne $supervisor) {
        Wait-Process -Id $supervisor.Id -Timeout 10 -ErrorAction SilentlyContinue
        Stop-ProcessTree -RootProcessId $supervisor.Id
    }
    Stop-OwnedSupervisorProcesses
    Remove-Item -LiteralPath $pidPath -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $supervisorPidPath -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $stopRequestPath -ErrorAction SilentlyContinue
    Set-HotfixRunStateStatus -Status "stopped"
    Write-Host "Stopped the canonical hotfix process tree."
}

function Show-HotfixDevStatus {
    $dockerExe = Resolve-ExternalCommandName -CommandName "docker"
    $existing = Get-HotfixDevProcess
    $supervisor = Get-HotfixSupervisorProcess
    $obsoleteGuards = @(Get-ObsoleteCommonJsGuardProcesses)

    if ($null -eq $existing) {
        Write-Host "Hotfix dev server is not running."
    } else {
        Write-Host "Hotfix dev server is running with PID $($existing.Id)."
        Write-Host "URL: $rootUrl"
        Write-Host "App health endpoint ready: $(Test-HotfixDevAppHealth)"
        Write-Host "Rspack HMR port $rspackDevServerPort reachable: $(Test-TcpPortOpen -HostName "127.0.0.1" -PortNumber ([int]$rspackDevServerPort))"
        $clientBundleState = Get-HotfixDevClientBundleState
        Write-Host "Browser client bundle ready: $($clientBundleState.Ready)"
        if (-not $clientBundleState.Ready) {
            Write-Host "Browser client bundle issue: $($clientBundleState.Reason)"
        }
        try {
            $activeChangeStreams = Get-ActiveChangeStreamCount -DockerComposeBinary $dockerExe -ComposeArgs $composeArgs
            Write-Host "Active MongoDB Change Streams: $activeChangeStreams"
        } catch {
            Write-Host "Active MongoDB Change Streams: unavailable ($($_.Exception.Message))"
        }
    }

    if ($null -ne $supervisor) {
        Write-Host "Hotfix supervisor PID: $($supervisor.Id)"
    } elseif (Test-Path -LiteralPath $supervisorPidPath) {
        Write-Host "Hotfix supervisor PID file is stale or belongs to another process."
    }
    if ((Test-Path -LiteralPath $pidPath) -and $null -eq $existing) {
        Write-Host "Meteor PID file is stale or belongs to another process."
    }
    Write-Host "Hotfix supervisor active: $($null -ne $supervisor)"
    Write-Host "Obsolete CommonJS guards: $($obsoleteGuards.Count)"

    if (Test-Path -LiteralPath $runStatePath) {
        $state = Get-Content -LiteralPath $runStatePath -Raw | ConvertFrom-Json
        Write-Host "Last run state: $($state.status) at $($state.updatedAtUtc); exit code: $($state.exitCode)"
    }
    $failureSummary = Get-HotfixFailureSummary
    if ($failureSummary) {
        Write-Host "Last failure: $failureSummary"
    }
    Write-Host "Stdout: $stdoutPath"
    Write-Host "Stderr: $stderrPath"
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

    if (Test-Path $supervisorStderrPath) {
        Write-Host "---- supervisor stderr tail ----"
        Get-Content -Path $supervisorStderrPath -Tail $LogTail
    }
}

switch ($Action) {
    "start" {
        Start-HotfixDev
    }
    "restart" {
        Stop-HotfixDev
        Assert-RequiredFiles
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
    "__supervise" {
        exit (Invoke-HotfixSupervisor)
    }
}
