[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][long]$CiRunId,
    [Parameter(Mandatory = $true)][long]$SecurityRunId,
    [Parameter(Mandatory = $true)][string]$ExpectedSourceFile,
    [Parameter(Mandatory = $true)][string]$TestAppRoot,
    [Parameter(Mandatory = $true)][string]$OutputDirectory
)

# Opt-in GET-only acquisition. Source and image bundles remain independently
# immutable; neither one supplies a workstation release image or qualification.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'CI evidence acquisition requires PowerShell 7.' }
$collector = Join-Path $PSScriptRoot '../mofacts/scripts/security-audit/qualification/collectCiImageEvidence.mjs'
$powershellExecutable = Join-Path $PSHOME $(if ($IsWindows) { 'pwsh.exe' } else { 'pwsh' })
& node $collector --ci-run $CiRunId --security-run $SecurityRunId `
    --expected-source $ExpectedSourceFile --test-app $TestAppRoot `
    --output $OutputDirectory --powershell $powershellExecutable
if ($LASTEXITCODE -ne 0) { throw 'CI image evidence acquisition failed; no qualification was issued.' }
