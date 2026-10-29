param(
    [ValidateSet("start", "restart", "stop", "status", "logs")]
    [string]$Action = "restart",
    [int]$LogTail = 120
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$deployDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = (Resolve-Path (Join-Path $deployDir "../mofacts")).Path
$localDevDir = Join-Path $deployDir "local-hotfix"
$localDataHome = Join-Path $deployDir "local-data"
$localAdminScript = Join-Path $deployDir "hotfix/ensure-local-admin.cjs"
$localAgentSecretsPath = Join-Path $localDevDir "agent-secrets.env"
$resolvedSettingsPath = ""
$defaultLocalAdminPassword = "local-admin-2026"
$rootUrl = "http://localhost:3200"
$port = "3200"
$rspackDevServerPort = "8082"
$composeArgs = @("compose", "--env-file", ".env.local", "-f", "docker-compose.yml", "-f", "docker-compose.local.yml")
$dockerExe = (Get-Command docker -ErrorAction Stop).Source

function Invoke-LocalCompose {
    param([string[]]$Arguments)
    Invoke-ExternalChecked -CommandLine (@($dockerExe) + $composeArgs + $Arguments) -WorkingDirectory $deployDir
}

function Get-LocalContainerState {
    Push-Location $deployDir
    try {
        $ids = @(& $dockerExe @composeArgs ps -a -q mofacts)
        if ($LASTEXITCODE -ne 0) { throw "Unable to query the localhost container" }
        if ($ids.Count -eq 0) { return "absent" }
        $state = & $dockerExe inspect --format '{{.State.Status}}' $ids[0]
        if ($LASTEXITCODE -ne 0) { throw "Unable to inspect the localhost container" }
        return ([string]$state).Trim()
    } finally { Pop-Location }
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

function Ensure-LocalAdminAccount {
    $secrets = Ensure-LocalAgentSecrets
    $previousEmail = $env:MOFACTS_AGENT_ADMIN_EMAIL
    $previousPassword = $env:MOFACTS_AGENT_ADMIN_PASSWORD
    $previousUrl = $env:MOFACTS_AGENT_DDP_URL
    Push-Location $deployDir
    try {
        $env:MOFACTS_AGENT_ADMIN_EMAIL = $secrets.Email
        $env:MOFACTS_AGENT_ADMIN_PASSWORD = $secrets.Password
        $env:MOFACTS_AGENT_DDP_URL = "ws://127.0.0.1:3200/websocket"
        $output = & $dockerExe @composeArgs exec -T -e MOFACTS_AGENT_ADMIN_EMAIL -e MOFACTS_AGENT_ADMIN_PASSWORD -e MOFACTS_AGENT_DDP_URL mofacts node /workspace/deploy/hotfix/ensure-local-admin.cjs 2>&1
        if ($LASTEXITCODE -ne 0) { throw "Local administrator bootstrap failed; inspect the localhost logs" }
        $result = $output | Where-Object { ([string]$_).Trim().StartsWith('{') } | Select-Object -Last 1 | ConvertFrom-Json
        Write-Host "Local administrator ready. Credentials remain in $localAgentSecretsPath"
        return ($null -ne $result -and $result.created -eq $true)
    } finally {
        Pop-Location
        $env:MOFACTS_AGENT_ADMIN_EMAIL = $previousEmail
        $env:MOFACTS_AGENT_ADMIN_PASSWORD = $previousPassword
        $env:MOFACTS_AGENT_DDP_URL = $previousUrl
    }
}

function Wait-HotfixDevReady {
    $deadline = (Get-Date).AddMinutes(15)
    do {
        if ((Get-LocalContainerState) -ne 'running') {
            throw "The Linux localhost watcher exited. Run hotfix-local.ps1 logs for the failure."
        }
        if (Test-HotfixDevEndpoints) {
            Get-ActiveChangeStreamCount -DockerComposeBinary $dockerExe -ComposeArgs $composeArgs | Out-Null
            return
        }
        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)
    throw "Timed out waiting for the Linux localhost watcher; inspect hotfix-local.ps1 logs."
}

function Start-HotfixDev {
    Assert-RequiredFiles
    $osType = & $dockerExe info --format '{{.OSType}}'
    if ($LASTEXITCODE -ne 0 -or ([string]$osType).Trim() -ne 'linux') {
        throw "Localhost requires Docker's Linux container engine."
    }
    Invoke-LocalCompose -Arguments @("config", "--quiet")
    if ((Get-LocalContainerState) -eq 'running' -and (Test-HotfixDevEndpoints)) {
        Write-Host "Localhost is already ready at $rootUrl"
        return
    }
    if ((Get-LocalContainerState) -ne 'running') {
        foreach ($listenPort in @(3200, 8082)) {
            if (Test-TcpPortOpen -HostName '127.0.0.1' -PortNumber $listenPort) {
                throw "Port $listenPort is occupied outside the managed Linux watcher. Stop its owner before starting localhost."
            }
        }
    }
    Invoke-LocalCompose -Arguments @("up", "-d", "mongodb", "mongodb-replica-init")
    Wait-ForMongo -HostName '127.0.0.1' -Port 27017 -DockerComposeBinary $dockerExe -ComposeArgs $composeArgs | Out-Null
    Ensure-LocalAgentSecrets | Out-Null
    Invoke-LocalCompose -Arguments @("up", "-d", "--no-build", "mofacts")
    Wait-HotfixDevReady
    if (Ensure-LocalAdminAccount) {
        Invoke-LocalCompose -Arguments @("restart", "mofacts")
        Wait-HotfixDevReady
    }
    Write-Host "Linux localhost watcher ready at $rootUrl"
}

switch ($Action) {
    "start" { Start-HotfixDev }
    "restart" {
        Assert-RequiredFiles
        Invoke-LocalCompose -Arguments @("config", "--quiet")
        Invoke-LocalCompose -Arguments @("stop", "mofacts")
        Start-HotfixDev
    }
    "stop" { Invoke-LocalCompose -Arguments @("stop", "mofacts") }
    "logs" { Invoke-LocalCompose -Arguments @("logs", "--tail", "$LogTail", "mofacts") }
    "status" {
        Write-Host "Linux localhost container: $(Get-LocalContainerState)"
        Write-Host "App health: $(Test-HotfixDevAppHealth)"
        Write-Host "Browser bundle: $((Get-HotfixDevClientBundleState).Ready)"
        Write-Host "HMR: $(Test-TcpPortOpen -HostName '127.0.0.1' -PortNumber 8082)"
        if ((Get-LocalContainerState) -eq 'running') {
            Write-Host "Active Change Streams: $(Get-ActiveChangeStreamCount -DockerComposeBinary $dockerExe -ComposeArgs $composeArgs)"
        }
    }
}
