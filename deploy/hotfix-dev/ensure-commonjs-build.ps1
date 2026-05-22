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

while ($true) {
    if (-not (Test-Path $PidPath)) {
        break
    }

    $rawPid = (Get-Content $PidPath -Raw -ErrorAction SilentlyContinue).Trim()
    if (-not $rawPid) {
        break
    }

    $process = Get-Process -Id ([int]$rawPid) -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        break
    }

    if (Test-Path $buildDir) {
        $current = ""
        if (Test-Path $packageJsonPath) {
            $current = (Get-Content $packageJsonPath -Raw -ErrorAction SilentlyContinue).Trim()
        }

        if ($current -ne $packageJson) {
            Set-Content -Path $packageJsonPath -Value $packageJson -NoNewline
        }
    }

    Start-Sleep -Milliseconds 50
}
