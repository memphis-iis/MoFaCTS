[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$NodeExecutable,
    [Parameter(Mandatory=$true)][string]$RecordPath,
    [Parameter(Mandatory=$true)][string]$CandidatePath,
    [Parameter(Mandatory=$true)][string]$SshHost,
    [Parameter(Mandatory=$true)][string]$SshKey,
    [Parameter(Mandatory=$true)][string]$KnownHosts,
    [Parameter(Mandatory=$true)][string]$EvidenceDirectory,
    [switch]$ParticipantChecksPassed
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if (-not $ParticipantChecksPassed) { throw 'Readiness and participant checks must pass before release recording.' }
$Runtime=& (Join-Path $PSScriptRoot 'resolve-node-runtime.ps1') -NodeExecutable $NodeExecutable
& $Runtime (Join-Path $PSScriptRoot '../mofacts/scripts/security-audit/qualification/recordDeploymentRelease.mjs') `
    $RecordPath $CandidatePath $SshHost $SshKey $KnownHosts $EvidenceDirectory --participant-checks-passed
if ($LASTEXITCODE -ne 0) { throw 'Verified release recording failed; do not publish or install a receipt.' }
