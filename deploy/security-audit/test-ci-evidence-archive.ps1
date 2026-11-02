[CmdletBinding()]
param()

# Synthetic filesystem/ZIP checks only. No GitHub, Docker, Meteor or app data.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$scriptPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'read-ci-evidence-archive.ps1'))
$powershell = (Get-Command pwsh -ErrorAction Stop).Source
$temporaryParent = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$testRoot = Join-Path $temporaryParent ('mofacts-ci-archive-test-' + [Guid]::NewGuid().ToString('N'))
$names = @('mofacts-source-observation.json', 'mofacts-meteor-test-run.json', 'mofacts-meteor-test-evidence.json')
$links = [System.Collections.Generic.List[string]]::new()
$passed = 0
$failed = 0

function Write-TestArchive {
    param([string]$Path, [array]$Entries)
    $stream = [System.IO.FileStream]::new($Path, [System.IO.FileMode]::CreateNew)
    $zip = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create, $true)
    try {
        foreach ($item in $Entries) {
            $entry = $zip.CreateEntry($item.Name, [System.IO.Compression.CompressionLevel]::Optimal)
            if ($item.ContainsKey('Attributes')) { $entry.ExternalAttributes = $item.Attributes }
            $entryStream = $entry.Open()
            try { $entryStream.Write($item.Bytes, 0, $item.Bytes.Length) }
            finally { $entryStream.Dispose() }
        }
    } finally { $zip.Dispose(); $stream.Dispose() }
}

function Invoke-TestAdapter {
    param([string]$ArchivePath, [string]$OutputDirectory, [string]$Profile = '')
    $start = [System.Diagnostics.ProcessStartInfo]::new($powershell)
    $start.UseShellExecute = $false
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    foreach ($argument in @('-NoProfile', '-NonInteractive', '-File', $scriptPath,
        '-ArchivePath', $ArchivePath, '-OutputDirectory', $OutputDirectory)) { $start.ArgumentList.Add($argument) }
    if ($Profile) {
        $start.ArgumentList.Add('-Profile')
        $start.ArgumentList.Add($Profile)
    }
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $start
    try {
        [void]$process.Start()
        $outputTask = $process.StandardOutput.ReadToEndAsync()
        $errorTask = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(15000)) { $process.Kill($true); throw 'Adapter timed out' }
        return @{ Code = $process.ExitCode; Output = $outputTask.GetAwaiter().GetResult(); Error = $errorTask.GetAwaiter().GetResult() }
    } finally { $process.Dispose() }
}

function Assert-Case {
    param([string]$Name, [scriptblock]$Check)
    try { & $Check; $script:passed++ }
    catch { $script:failed++; [Console]::Error.WriteLine('Synthetic archive case failed: ' + $Name) }
}

function Expect-Rejection {
    param([string]$ArchivePath, [string]$OutputDirectory, [string]$Profile = '')
    $result = Invoke-TestAdapter -ArchivePath $ArchivePath -OutputDirectory $OutputDirectory -Profile $Profile
    if ($result.Code -eq 0 -or $result.Output -or $result.Error.Trim() -cne 'CI evidence archive validation failed.') { throw 'Expected sanitized failure' }
}

try {
    [void][System.IO.Directory]::CreateDirectory($testRoot)
    $baseEntries = @($names | ForEach-Object { @{ Name = $_; Bytes = [System.Text.Encoding]::UTF8.GetBytes('{"synthetic":true}') } })
    $validArchive = Join-Path $testRoot 'valid.zip'
    Write-TestArchive -Path $validArchive -Entries $baseEntries

    Assert-Case 'valid bytes and digest' {
        $out = Join-Path $testRoot 'valid-output'
        [void][System.IO.Directory]::CreateDirectory($out)
        $result = Invoke-TestAdapter -ArchivePath $validArchive -OutputDirectory $out
        if ($result.Code -ne 0 -or $result.Error) { throw 'Valid archive failed' }
        $record = $result.Output | ConvertFrom-Json
        $expectedDigest = (Get-FileHash -LiteralPath $validArchive -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($record.state -cne 'ci-evidence-archive-read' -or $record.files -ne 3 -or $record.archiveDigestSha256 -cne $expectedDigest) { throw 'Wrong success record' }
        foreach ($name in $names) {
            if ([System.IO.File]::ReadAllText((Join-Path $out $name)) -cne '{"synthetic":true}') { throw 'Bytes changed' }
        }
    }

    $malformed = @{
        'missing' = @($baseEntries[0], $baseEntries[1]);
        'duplicate' = @($baseEntries[0], $baseEntries[0], $baseEntries[2]);
        'traversal' = @(@{ Name = '../mofacts-source-observation.json'; Bytes = [byte[]]@(1) }, $baseEntries[1], $baseEntries[2]);
        'nested' = @(@{ Name = 'nested/mofacts-source-observation.json'; Bytes = [byte[]]@(1) }, $baseEntries[1], $baseEntries[2]);
        'extra' = @($baseEntries[0], $baseEntries[1], $baseEntries[2], @{ Name = 'extra.json'; Bytes = [byte[]]@(1) });
        'symlink' = @(@{ Name = $names[0]; Bytes = [byte[]]@(1); Attributes = [int]0xa1ff0000 }, $baseEntries[1], $baseEntries[2]);
        'directory' = @(@{ Name = $names[0]; Bytes = [byte[]]@(1); Attributes = 0x10 }, $baseEntries[1], $baseEntries[2]);
        'oversized-entry' = @(@{ Name = $names[0]; Bytes = [byte[]]::new(4MB + 1) }, $baseEntries[1], $baseEntries[2]);
    }
    foreach ($caseName in $malformed.Keys) {
        $caseArchive = Join-Path $testRoot ($caseName + '.zip')
        Write-TestArchive -Path $caseArchive -Entries $malformed[$caseName]
        $caseOutput = Join-Path $testRoot ($caseName + '-output')
        [void][System.IO.Directory]::CreateDirectory($caseOutput)
        Assert-Case $caseName {
            Expect-Rejection -ArchivePath $caseArchive -OutputDirectory $caseOutput
            if ([System.IO.Directory]::EnumerateFileSystemEntries($caseOutput).GetEnumerator().MoveNext()) { throw 'Rejected archive left output' }
        }
    }

    Assert-Case 'existing output preserved' {
        $out = Join-Path $testRoot 'existing-output'
        [void][System.IO.Directory]::CreateDirectory($out)
        $marker = Join-Path $out 'marker.json'
        [System.IO.File]::WriteAllText($marker, 'preserve')
        Expect-Rejection -ArchivePath $validArchive -OutputDirectory $out
        if ([System.IO.File]::ReadAllText($marker) -cne 'preserve') { throw 'Existing output changed' }
    }
    Assert-Case 'invalid ZIP' {
        $bad = Join-Path $testRoot 'invalid.zip'
        [System.IO.File]::WriteAllText($bad, 'synthetic invalid archive')
        $out = Join-Path $testRoot 'invalid-output'
        [void][System.IO.Directory]::CreateDirectory($out)
        Expect-Rejection -ArchivePath $bad -OutputDirectory $out
    }
    Assert-Case 'truncated ZIP' {
        $bad = Join-Path $testRoot 'truncated.zip'
        $bytes = [System.IO.File]::ReadAllBytes($validArchive)
        [System.IO.File]::WriteAllBytes($bad, $bytes[0..($bytes.Length - 12)])
        $out = Join-Path $testRoot 'truncated-output'
        [void][System.IO.Directory]::CreateDirectory($out)
        Expect-Rejection -ArchivePath $bad -OutputDirectory $out
    }
    Assert-Case 'declared size mismatch cleans partial output' {
        $bad = Join-Path $testRoot 'mismatched-size.zip'
        $bytes = [System.IO.File]::ReadAllBytes($validArchive)
        $changed = $false
        for ($index = 0; $index -lt $bytes.Length - 28; $index++) {
            if ($bytes[$index] -eq 0x50 -and $bytes[$index + 1] -eq 0x4b -and
                $bytes[$index + 2] -eq 0x01 -and $bytes[$index + 3] -eq 0x02) {
                # Synthetic fixture mutation of central-directory length only.
                [System.BitConverter]::GetBytes([uint32]1).CopyTo($bytes, $index + 24)
                $changed = $true
                break
            }
        }
        if (-not $changed) { throw 'Synthetic ZIP mutation failed' }
        [System.IO.File]::WriteAllBytes($bad, $bytes)
        $out = Join-Path $testRoot 'mismatched-output'
        [void][System.IO.Directory]::CreateDirectory($out)
        Expect-Rejection -ArchivePath $bad -OutputDirectory $out
        if ([System.IO.Directory]::EnumerateFileSystemEntries($out).GetEnumerator().MoveNext()) { throw 'Partial output remained' }
    }
    Assert-Case 'oversized archive' {
        $bad = Join-Path $testRoot 'oversized.zip'
        $stream = [System.IO.FileStream]::new($bad, [System.IO.FileMode]::CreateNew)
        try { $stream.SetLength(8MB + 1) } finally { $stream.Dispose() }
        $out = Join-Path $testRoot 'oversized-output'
        [void][System.IO.Directory]::CreateDirectory($out)
        Expect-Rejection -ArchivePath $bad -OutputDirectory $out
    }
    $imageEntries = @(@{ Name = 'mofacts-ci-image-observation.json'; Bytes = [System.Text.Encoding]::UTF8.GetBytes('{"image":"synthetic"}') })
    $imageArchive = Join-Path $testRoot 'image-valid.zip'
    Write-TestArchive -Path $imageArchive -Entries $imageEntries
    Assert-Case 'image bytes and digest' {
        $out = Join-Path $testRoot 'image-valid-output'
        [void][System.IO.Directory]::CreateDirectory($out)
        $result = Invoke-TestAdapter -ArchivePath $imageArchive -OutputDirectory $out -Profile image
        if ($result.Code -ne 0 -or $result.Error) { throw 'Valid image archive failed' }
        $record = $result.Output | ConvertFrom-Json
        $expectedDigest = (Get-FileHash -LiteralPath $imageArchive -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($record.state -cne 'ci-evidence-archive-read' -or $record.files -ne 1 -or $record.archiveDigestSha256 -cne $expectedDigest) { throw 'Wrong image success record' }
        if ([System.IO.File]::ReadAllText((Join-Path $out 'mofacts-ci-image-observation.json')) -cne '{"image":"synthetic"}') { throw 'Image bytes changed' }
    }
    $malformedImages = @{
        'wrong-name' = @(@{ Name = 'other.json'; Bytes = [byte[]]@(1) });
        'unpublished-short-name' = @(@{ Name = 'image-observation.json'; Bytes = [byte[]]@(1) });
        'duplicate' = @($imageEntries[0], $imageEntries[0]);
        'traversal' = @(@{ Name = '../mofacts-ci-image-observation.json'; Bytes = [byte[]]@(1) });
        'nested' = @(@{ Name = 'nested/mofacts-ci-image-observation.json'; Bytes = [byte[]]@(1) });
        'symlink' = @(@{ Name = 'mofacts-ci-image-observation.json'; Bytes = [byte[]]@(1); Attributes = [int]0xa1ff0000 });
        'directory' = @(@{ Name = 'mofacts-ci-image-observation.json'; Bytes = [byte[]]@(1); Attributes = 0x10 });
        'oversized-entry' = @(@{ Name = 'mofacts-ci-image-observation.json'; Bytes = [byte[]]::new(16KB + 1) });
        'source-substitution' = $baseEntries;
    }
    foreach ($caseName in $malformedImages.Keys) {
        $caseArchive = Join-Path $testRoot ('image-' + $caseName + '.zip')
        Write-TestArchive -Path $caseArchive -Entries $malformedImages[$caseName]
        $caseOutput = Join-Path $testRoot ('image-' + $caseName + '-output')
        [void][System.IO.Directory]::CreateDirectory($caseOutput)
        Assert-Case ('image-' + $caseName) {
            Expect-Rejection -ArchivePath $caseArchive -OutputDirectory $caseOutput -Profile image
            if ([System.IO.Directory]::EnumerateFileSystemEntries($caseOutput).GetEnumerator().MoveNext()) { throw 'Rejected image archive left output' }
        }
    }
    Assert-Case 'image rejected by default source profile' {
        $out = Join-Path $testRoot 'image-default-source-output'
        [void][System.IO.Directory]::CreateDirectory($out)
        Expect-Rejection -ArchivePath $imageArchive -OutputDirectory $out
    }
    Assert-Case 'explicit source profile unchanged' {
        $out = Join-Path $testRoot 'explicit-source-output'
        [void][System.IO.Directory]::CreateDirectory($out)
        $result = Invoke-TestAdapter -ArchivePath $validArchive -OutputDirectory $out -Profile source
        if ($result.Code -ne 0 -or $result.Error -or ($result.Output | ConvertFrom-Json).files -ne 3) { throw 'Explicit source failed' }
    }
    Assert-Case 'image CRC mismatch cleans partial output' {
        $bad = Join-Path $testRoot 'image-crc-mismatch.zip'
        $bytes = [System.IO.File]::ReadAllBytes($imageArchive)
        $changed = $false
        for ($index = 0; $index -lt $bytes.Length - 20; $index++) {
            if ($bytes[$index] -eq 0x50 -and $bytes[$index + 1] -eq 0x4b -and
                $bytes[$index + 2] -eq 0x01 -and $bytes[$index + 3] -eq 0x02) {
                # Corrupt central-directory CRC while preserving entry content.
                $bytes[$index + 16] = $bytes[$index + 16] -bxor 1
                $changed = $true
                break
            }
        }
        if (-not $changed) { throw 'Synthetic ZIP mutation failed' }
        [System.IO.File]::WriteAllBytes($bad, $bytes)
        $out = Join-Path $testRoot 'image-crc-output'
        [void][System.IO.Directory]::CreateDirectory($out)
        Expect-Rejection -ArchivePath $bad -OutputDirectory $out -Profile image
        if ([System.IO.Directory]::EnumerateFileSystemEntries($out).GetEnumerator().MoveNext()) { throw 'Partial image output remained' }
    }
    Assert-Case 'image malformed ZIP' {
        $bad = Join-Path $testRoot 'image-invalid.zip'
        [System.IO.File]::WriteAllText($bad, 'synthetic invalid image archive')
        $out = Join-Path $testRoot 'image-invalid-output'
        [void][System.IO.Directory]::CreateDirectory($out)
        Expect-Rejection -ArchivePath $bad -OutputDirectory $out -Profile image
    }
    Assert-Case 'image oversized archive' {
        $bad = Join-Path $testRoot 'image-oversized.zip'
        $stream = [System.IO.FileStream]::new($bad, [System.IO.FileMode]::CreateNew)
        try { $stream.SetLength(64KB + 1) } finally { $stream.Dispose() }
        $out = Join-Path $testRoot 'image-oversized-output'
        [void][System.IO.Directory]::CreateDirectory($out)
        Expect-Rejection -ArchivePath $bad -OutputDirectory $out -Profile image
    }
    if ($IsWindows) {
        Assert-Case 'linked output ancestor' {
            $target = Join-Path $testRoot 'link-target'
            [void][System.IO.Directory]::CreateDirectory($target)
            $link = Join-Path $testRoot 'linked-output'
            [void](New-Item -ItemType Junction -Path $link -Target $target)
            $links.Add($link)
            Expect-Rejection -ArchivePath $validArchive -OutputDirectory $link
        }
        Assert-Case 'linked archive ancestor' {
            $link = Join-Path $testRoot 'linked-input'
            [void](New-Item -ItemType Junction -Path $link -Target $testRoot)
            $links.Add($link)
            $out = Join-Path $testRoot 'linked-input-output'
            [void][System.IO.Directory]::CreateDirectory($out)
            Expect-Rejection -ArchivePath (Join-Path $link 'valid.zip') -OutputDirectory $out
        }
    }
} finally {
    foreach ($link in $links) {
        if ([System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($link)) -cne $testRoot) { throw 'Invalid link cleanup' }
        [System.IO.Directory]::Delete($link, $false)
    }
    $resolved = [System.IO.Path]::GetFullPath($testRoot)
    if ([System.IO.Path]::GetDirectoryName($resolved).TrimEnd([System.IO.Path]::DirectorySeparatorChar) -cne $temporaryParent.TrimEnd([System.IO.Path]::DirectorySeparatorChar) -or
        -not [System.IO.Path]::GetFileName($resolved).StartsWith('mofacts-ci-archive-test-', [System.StringComparison]::Ordinal) -or
        ([System.IO.File]::GetAttributes($resolved) -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Invalid test cleanup' }
    [System.IO.Directory]::Delete($resolved, $true)
}
[Console]::Out.WriteLine((@{ state = 'synthetic-archive-tests-complete'; passed = $passed; failed = $failed } | ConvertTo-Json -Compress))
if ($failed) { exit 1 }
