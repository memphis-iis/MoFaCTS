[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$CandidateFile,
    [Parameter(Mandatory = $true)][long]$CiRunId,
    [Parameter(Mandatory = $true)][long]$SecurityRunId,
    [Parameter(Mandatory = $true)][string]$ExpectedSourceFile,
    [Parameter(Mandatory = $true)][string]$TestAppRoot,
    [Parameter(Mandatory = $true)][string]$OutputDirectory
)

# Emits a new candidate JSON record only. The existing release-record storage
# owner remains responsible for any separately authorized authoritative write.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'Release evidence preparation requires PowerShell 7.' }
$preparer = Join-Path $PSScriptRoot '../mofacts/scripts/security-audit/qualification/prepareReleaseEvidence.mjs'
$powershellExecutable = Join-Path $PSHOME $(if ($IsWindows) { 'pwsh.exe' } else { 'pwsh' })
& node $preparer --candidate $CandidateFile --ci-run $CiRunId --security-run $SecurityRunId `
    --expected-source $ExpectedSourceFile --test-app $TestAppRoot `
    --output $OutputDirectory --powershell $powershellExecutable
if ($LASTEXITCODE -ne 0) { throw 'Release evidence preparation failed; no record was published or qualified.' }
