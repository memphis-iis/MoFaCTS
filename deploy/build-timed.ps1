param(
    [string]$Service = "mofacts",
    [switch]$NoCache,
    [switch]$PlainProgress,
    [string]$LogPath = ".\\build-timings.csv"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$composeArgs = @("compose", "build", $Service)
if ($NoCache) {
    $composeArgs += "--no-cache"
}
if ($PlainProgress) {
    $composeArgs += @("--progress", "plain")
}

$start = Get-Date
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

Write-Host "Starting: docker $($composeArgs -join ' ')"
Write-Host "Started (UTC): $($start.ToUniversalTime().ToString('u'))"

& docker @composeArgs
$exitCode = $LASTEXITCODE

$stopwatch.Stop()
$finish = Get-Date
$elapsedSeconds = [Math]::Round($stopwatch.Elapsed.TotalSeconds, 2)

$record = [PSCustomObject]@{
    started_at_utc = $start.ToUniversalTime().ToString("o")
    finished_at_utc = $finish.ToUniversalTime().ToString("o")
    elapsed_seconds = $elapsedSeconds
    service = $Service
    no_cache = [bool]$NoCache
    plain_progress = [bool]$PlainProgress
    exit_code = $exitCode
}

if (Test-Path $LogPath) {
    $record | Export-Csv -Path $LogPath -NoTypeInformation -Append
} else {
    $record | Export-Csv -Path $LogPath -NoTypeInformation
}

Write-Host "Finished (UTC): $($finish.ToUniversalTime().ToString('u'))"
Write-Host "Elapsed: $elapsedSeconds seconds"
Write-Host "Exit code: $exitCode"
Write-Host "Timing log appended to: $LogPath"

if ($exitCode -ne 0) {
    exit $exitCode
}
