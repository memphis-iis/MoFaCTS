param(
    [Parameter(Mandatory = $true)]
    [string]$AppDir,
    [Parameter(Mandatory = $true)]
    [string]$PidPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$buildDir = Join-Path $AppDir ".meteor\local\build"
$packageJsonPath = Join-Path $buildDir "package.json"
$packageJson = "{`"type`":`"commonjs`"}"

function Ensure-CommonJsMarker {
    if (-not (Test-Path $buildDir)) {
        return
    }

    $current = ""
    if (Test-Path $packageJsonPath) {
        $raw = Get-Content $packageJsonPath -Raw -ErrorAction SilentlyContinue
        if ($null -ne $raw) {
            $current = $raw.Trim()
        }
    }

    if ($current -ne $packageJson) {
        Set-Content -Path $packageJsonPath -Value $packageJson -NoNewline
    }
}

while ($true) {
    Ensure-CommonJsMarker

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

    Start-Sleep -Milliseconds 50
}
