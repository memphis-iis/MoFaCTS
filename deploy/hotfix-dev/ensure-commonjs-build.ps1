param(
    [Parameter(Mandatory = $true)]
    [string]$AppDir,
    [Parameter(Mandatory = $true)]
    [string]$PidPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$localMeteorDir = Join-Path $AppDir ".meteor\local"
$localPackageJsonPath = Join-Path $localMeteorDir "package.json"
$buildDir = Join-Path $localMeteorDir "build"
$packageJsonPath = Join-Path $buildDir "package.json"
$packageJson = "{`"type`":`"commonjs`"}"
$serverEntryPath = Join-Path $AppDir "server\main.ts"
$startedAt = Get-Date

function Set-CommonJsMarkerIfNeeded {
    param([string]$Path)

    $parentDir = Split-Path -Parent $Path
    if (-not (Test-Path $parentDir)) {
        return $false
    }

    $current = ""
    if (Test-Path $Path) {
        $raw = Get-Content $Path -Raw -ErrorAction SilentlyContinue
        if ($null -ne $raw) {
            $current = $raw.Trim()
        }
    }

    if ($current -ne $packageJson) {
        Set-Content -Path $Path -Value $packageJson -NoNewline
        return $true
    }

    return $false
}

function Ensure-CommonJsMarker {
    $changed = $false

    if (Set-CommonJsMarkerIfNeeded -Path $localPackageJsonPath) {
        $changed = $true
    }

    if (Set-CommonJsMarkerIfNeeded -Path $packageJsonPath) {
        $changed = $true
    }

    return $changed
}

while ($true) {
    $commonJsMarkerChanged = Ensure-CommonJsMarker
    if ($commonJsMarkerChanged -and (Test-Path $serverEntryPath)) {
        Write-Host "Meteor build CommonJS marker changed; touching server/main.ts to trigger rebuild."
        (Get-Item -LiteralPath $serverEntryPath).LastWriteTime = Get-Date
    }

    if (-not (Test-Path $PidPath)) {
        break
    }

    $pidContent = Get-Content $PidPath -Raw -ErrorAction SilentlyContinue
    if ($null -eq $pidContent) {
        Start-Sleep -Milliseconds 50
        continue
    }

    $rawPid = $pidContent.Trim()
    if (-not $rawPid) {
        Start-Sleep -Milliseconds 50
        continue
    }

    $process = Get-Process -Id ([int]$rawPid) -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        Start-Sleep -Milliseconds 50
        continue
    }

    $sleepMs = if (((Get-Date) - $startedAt).TotalSeconds -lt 120) { 5 } else { 50 }
    Start-Sleep -Milliseconds $sleepMs
}
