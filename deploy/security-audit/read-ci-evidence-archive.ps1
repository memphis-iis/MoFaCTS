[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ArchivePath,
    [Parameter(Mandatory = $true)]
    [string]$OutputDirectory
)

# The workstation acquisition owner authenticates the archive digest. This
# adapter owns only bounded ZIP reading; it does not issue qualification.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$archiveLimit = 8MB
$fileLimit = 4MB
$totalLimit = 12MB
$createdFiles = [System.Collections.Generic.List[string]]::new()
$archiveStream = $null
$archive = $null
$output = $null
$failureReason = 'invalid-archive'

function Assert-ExistingPath {
    param([string]$Path, [bool]$Directory)
    if (-not [System.IO.Path]::IsPathFullyQualified($Path)) { throw 'Invalid path' }
    $absolute = [System.IO.Path]::GetFullPath($Path)
    $root = [System.IO.Path]::GetPathRoot($absolute)
    $current = $root
    $parts = $absolute.Substring($root.Length).Split(
        [char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar),
        [System.StringSplitOptions]::RemoveEmptyEntries)
    $rootAttributes = [System.IO.File]::GetAttributes($root)
    if (($rootAttributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Invalid path' }
    for ($index = 0; $index -lt $parts.Length; $index++) {
        $current = [System.IO.Path]::Combine($current, $parts[$index])
        $attributes = [System.IO.File]::GetAttributes($current)
        if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Invalid path' }
        $isDirectory = ($attributes -band [System.IO.FileAttributes]::Directory) -ne 0
        if (($index -lt ($parts.Length - 1) -or $Directory) -and -not $isDirectory) { throw 'Invalid path' }
        if ($index -eq ($parts.Length - 1) -and -not $Directory -and $isDirectory) { throw 'Invalid path' }
    }
    if (-not $Directory -and $parts.Length -eq 0) { throw 'Invalid path' }
    return $absolute
}

try {
    if ($PSVersionTable.PSVersion.Major -lt 7) {
        $failureReason = 'unsupported-zip-integrity-runtime'
        throw 'Unsupported runtime'
    }
    # ZipArchive may bound reads to a forged central-directory Length. Its
    # public CRC metadata is required to verify the actual decompressed bytes.
    if ($null -eq [System.IO.Compression.ZipArchiveEntry].GetProperty('Crc32')) {
        $failureReason = 'unsupported-zip-integrity-runtime'
        throw 'Unsupported ZIP integrity capability'
    }
    $inputPath = Assert-ExistingPath -Path $ArchivePath -Directory $false
    $output = Assert-ExistingPath -Path $OutputDirectory -Directory $true
    $existing = [System.IO.Directory]::EnumerateFileSystemEntries($output).GetEnumerator()
    try { if ($existing.MoveNext()) { throw 'Output is not empty' } }
    finally { $existing.Dispose() }

    $archiveStream = [System.IO.FileStream]::new($inputPath, [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    if ($archiveStream.Length -le 0 -or $archiveStream.Length -gt $archiveLimit) { throw 'Archive size exceeded' }
    $hash = [System.Security.Cryptography.SHA256]::Create()
    try {
        $archiveDigest = [System.BitConverter]::ToString($hash.ComputeHash($archiveStream)).Replace('-', '').ToLowerInvariant()
    } finally { $hash.Dispose() }
    $archiveStream.Position = 0
    $archive = [System.IO.Compression.ZipArchive]::new($archiveStream,
        [System.IO.Compression.ZipArchiveMode]::Read, $true)
    $allowed = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($name in @('mofacts-source-observation.json', 'mofacts-meteor-test-run.json', 'mofacts-meteor-test-evidence.json')) {
        [void]$allowed.Add($name)
    }
    if ($archive.Entries.Count -ne $allowed.Count) { throw 'Invalid entry count' }
    $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($entry in $archive.Entries) {
        if (-not $allowed.Contains($entry.FullName) -or -not $seen.Add($entry.FullName)) { throw 'Invalid entry name' }
        $external = [uint32]([long]$entry.ExternalAttributes -band 0xffffffffL)
        $unixType = ($external -shr 16) -band 0xf000
        if ($unixType -notin @(0, 0x8000) -or ($external -band 0x450) -ne 0) { throw 'Invalid entry kind' }
        if ($entry.Length -lt 0 -or $entry.Length -gt $fileLimit -or
            $entry.CompressedLength -lt 0 -or $entry.CompressedLength -gt $archiveLimit) { throw 'Invalid entry size' }
    }

    $buffer = [byte[]]::new(8192)
    $crcTable = [uint32[]]::new(256)
    for ($index = 0; $index -lt $crcTable.Length; $index++) {
        $value = [uint32]$index
        for ($bit = 0; $bit -lt 8; $bit++) {
            if (($value -band 1) -ne 0) { $value = [uint32](($value -shr 1) -bxor 3988292384L) }
            else { $value = $value -shr 1 }
        }
        $crcTable[$index] = $value
    }
    $total = 0L
    foreach ($entry in $archive.Entries) {
        [void](Assert-ExistingPath -Path $output -Directory $true)
        $destination = [System.IO.Path]::Combine($output, $entry.FullName)
        $reader = $null
        $writer = $null
        try {
            $reader = $entry.Open()
            $writer = [System.IO.FileStream]::new($destination, [System.IO.FileMode]::CreateNew,
                [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
            $createdFiles.Add($destination)
            $count = 0L
            $crc = [uint32]::MaxValue
            while (($read = $reader.Read($buffer, 0, $buffer.Length)) -ne 0) {
                $count += $read
                $total += $read
                if ($count -gt $fileLimit -or $total -gt $totalLimit -or $count -gt $entry.Length) { throw 'Entry size exceeded' }
                for ($offset = 0; $offset -lt $read; $offset++) {
                    $crc = [uint32](($crc -shr 8) -bxor $crcTable[($crc -bxor $buffer[$offset]) -band 255])
                }
                $writer.Write($buffer, 0, $read)
            }
            if ($count -ne $entry.Length -or ($crc -bxor [uint32]::MaxValue) -ne $entry.Crc32) { throw 'Entry integrity mismatch' }
            $writer.Flush($true)
        } finally {
            if ($null -ne $writer) { $writer.Dispose() }
            if ($null -ne $reader) { $reader.Dispose() }
        }
    }
    [Console]::Out.WriteLine((@{ state = 'ci-evidence-archive-read'; files = 3; archiveDigestSha256 = $archiveDigest } | ConvertTo-Json -Compress))
} catch {
    # Delete only files exclusively created by this invocation. Re-check the
    # directory chain and exact regular file before every non-recursive deletion.
    $cleanupIncomplete = $false
    foreach ($file in $createdFiles) {
        try {
            [void](Assert-ExistingPath -Path $output -Directory $true)
            if ([System.IO.Path]::GetDirectoryName($file) -cne $output) { throw 'Invalid cleanup target' }
            [void](Assert-ExistingPath -Path $file -Directory $false)
            [System.IO.File]::Delete($file)
        } catch { $cleanupIncomplete = $true }
    }
    if ($cleanupIncomplete) {
        [Console]::Error.WriteLine('CI evidence archive validation failed; partial output cleanup incomplete.')
        exit 1
    }
    if ($failureReason -eq 'unsupported-zip-integrity-runtime') {
        [Console]::Error.WriteLine('CI evidence archive validation failed (unsupported-zip-integrity-runtime).')
        exit 1
    }
    [Console]::Error.WriteLine('CI evidence archive validation failed.')
    exit 1
} finally {
    if ($null -ne $archive) { $archive.Dispose() }
    if ($null -ne $archiveStream) { $archiveStream.Dispose() }
}
