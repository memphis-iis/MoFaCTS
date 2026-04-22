/**
 * Package ZIP parsing extracted from package-upload orchestration.
 * Pure computation: parses a ZIP buffer, validates structure, returns typed file list.
 */

export type UploadedPackageFile = {
  name: string;
  path: string;
  extension: string;
  contents: unknown;
  packageFile: string;
  type: 'stim' | 'tdf' | 'media';
};

function hasPathTraversal(filePath: string): boolean {
  if (typeof filePath !== 'string') {
    return true;
  }
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.startsWith('/')) {
    return true;
  }
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return true;
  }
  return normalized.split('/').some((segment) => segment === '..');
}

function isInvalidZipFilename(fileName: string): boolean {
  if (typeof fileName !== 'string' || !fileName.trim()) {
    return true;
  }
  if (fileName === '.' || fileName === '..') {
    return true;
  }
  return fileName.includes('/') || fileName.includes('\\');
}

/**
 * Parse a ZIP file at the given path and return categorized file entries.
 * Throws on path traversal, invalid filenames, or malformed ZIP content.
 */
export async function parsePackageZip(
  zipFilePath: string,
  packageFile: string,
  serverConsole: (...args: unknown[]) => void
): Promise<UploadedPackageFile[]> {
  const unzipper = Npm.require('unzipper');
  const zip = await unzipper.Open.file(zipFilePath);
  const files: UploadedPackageFile[] = [];

  for (const file of zip.files) {
    const filePath: string = file.path;
    const normalizedFilePath = filePath.replace(/\\/g, '/');

    // Skip directory entries
    if (/[\\/]$/.test(filePath)) {
      continue;
    }

    // Security: Validate path to prevent path traversal attacks
    if (hasPathTraversal(filePath)) {
      throw new Error('Invalid file path in zip: path traversal detected');
    }

    const filePathArray = normalizedFilePath.split('/');
    const fileName = filePathArray[filePathArray.length - 1] ?? '';

    if (!fileName || !fileName.trim()) {
      continue;
    }

    if (isInvalidZipFilename(fileName)) {
      throw new Error('Invalid filename in zip: ' + fileName);
    }

    let fileContents = await file.buffer();

    const fileNameArray = fileName.split('.');
    const extension = fileNameArray[fileNameArray.length - 1] ?? '';
    let type: UploadedPackageFile['type'];
    if (extension === 'json') {
      serverConsole(fileName);
      fileContents = JSON.parse(fileContents.toString());
      type = fileContents.setspec ? 'stim' : 'tdf';
    } else {
      type = 'media';
    }

    files.push({
      name: fileName,
      path: filePath,
      extension,
      contents: fileContents,
      packageFile,
      type,
    });
  }

  serverConsole('Unzipped', files.length, 'files');
  return files;
}
