[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][long]$CiRunId,
    [Parameter(Mandatory = $true)][long]$SecurityRunId,
    [Parameter(Mandatory = $true)][string]$ExpectedSourceFile,
    [Parameter(Mandatory = $true)][string]$TestAppRoot,
    [Parameter(Mandatory = $true)][string]$OutputDirectory
)

# Optional workstation action. gh uses the existing stored github.com sign-in.
# The Node owner validates the evidence; .NET owns bounded ZIP decoding.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'CI evidence acquisition requires PowerShell 7.' }
$collector = Join-Path $PSScriptRoot '../mofacts/scripts/security-audit/qualification/collectCiEvidence.mjs'
$powershellExecutable = Join-Path $PSHOME $(if ($IsWindows) { 'pwsh.exe' } else { 'pwsh' })
& node $collector --ci-run $CiRunId --security-run $SecurityRunId `
    --expected-source $ExpectedSourceFile --test-app $TestAppRoot `
    --output $OutputDirectory --powershell $powershellExecutable
if ($LASTEXITCODE -ne 0) { throw 'CI evidence acquisition failed; no qualification was issued.' }
