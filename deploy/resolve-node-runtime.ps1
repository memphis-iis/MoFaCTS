[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$NodeExecutable)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if (-not [IO.Path]::IsPathRooted($NodeExecutable)) { throw 'Supply the absolute path of the repository-pinned Node executable.' }
$NodeFile=Get-Item -LiteralPath $NodeExecutable -ErrorAction Stop
if ($NodeFile.PSIsContainer -or ($NodeFile.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Pinned Node must be a regular executable, not a linked path.' }
$Expected=(Get-Content -LiteralPath (Join-Path $PSScriptRoot '../mofacts/package.json') -Raw | ConvertFrom-Json).engines.node
$Observed=(& $NodeFile.FullName --version | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $Observed -cne "v$Expected") { throw "Production release recording requires Node $Expected; the selected executable does not match." }
$NodeFile.FullName
