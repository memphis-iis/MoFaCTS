[CmdletBinding()]
param(
    [string]$OutputPath = (Join-Path $PSScriptRoot 'local-secrets\mongodb-keyfile'),
    [switch]$Force
)

$fullPath = [System.IO.Path]::GetFullPath($OutputPath)
if ((Test-Path -LiteralPath $fullPath) -and -not $Force) {
    throw "Replica-set keyfile already exists at $fullPath. Use -Force only when intentionally rotating it."
}

$parent = Split-Path -Parent $fullPath
if (-not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
}

$bytes = New-Object byte[] 756
$generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $generator.GetBytes($bytes)
} finally {
    $generator.Dispose()
}

$value = [Convert]::ToBase64String($bytes)
[System.IO.File]::WriteAllText($fullPath, $value, [System.Text.Encoding]::ASCII)

Write-Host "Created private MongoDB replica-set keyfile at $fullPath"
Write-Host 'Set MONGO_REPLICA_SET_KEYFILE_HOST_PATH to this file. Copy the same secret securely to every future member.'
