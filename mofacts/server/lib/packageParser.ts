/**
 * Package ZIP parsing extracted from package-upload orchestration.
 * Media is streamed into an owned temporary directory; only authored JSON is retained.
 */
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { removePackageDirectory } from './packageFileStorage';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export type UploadedPackageFile = {
  name: string;
  path: string;
  extension: string;
  contents: unknown;
  packageFile: string;
  type: 'stim' | 'tdf' | 'media';
  source?: { path: string; size: number; sha256: string };
};

const staging = new WeakMap<UploadedPackageFile[], string>();
export async function disposeParsedPackage(files: UploadedPackageFile[]): Promise<void> {
  const directory = staging.get(files);
  if (directory) {
    await removePackageDirectory(directory, tmpdir(), 'mofacts-package-');
    staging.delete(files);
  }
}

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
  if (zip.files.length > 10000) throw new Error('Package exceeds entry limit');
  const directory = await mkdtemp(join(tmpdir(), 'mofacts-package-'));
  staging.set(files, directory);
  let totalSize = 0;
  let authoredSize = 0;

  try {
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

      const fileNameArray = fileName.split('.');
      const extension = (fileNameArray[fileNameArray.length - 1] ?? '').toLowerCase();
      const stagedPath = join(directory, String(files.length));
      const hash = createHash('sha256');
      let size = 0;
      await pipeline(file.stream(), new Transform({ transform(chunk, _encoding, callback) {
        size += chunk.length;
        totalSize += chunk.length;
        if (size > (extension === 'json' ? 64 : 512) * 1024 * 1024 || totalSize > 2 * 1024 * 1024 * 1024) {
          callback(new Error('Package exceeds expanded size limit')); return;
        }
        hash.update(chunk);
        callback(null, chunk);
      } }), createWriteStream(stagedPath, { flags: 'wx' }));
      const source = { path: stagedPath, size, sha256: hash.digest('hex') };
      let fileContents: any;
      let type: UploadedPackageFile['type'];
      if (extension === 'json') {
        serverConsole(fileName);
        const jsonText = (await readFile(stagedPath, 'utf8')).replace(/^\uFEFF/, '');
        fileContents = JSON.parse(jsonText);
        type = fileContents?.setspec ? 'stim' : fileContents?.tutor ? 'tdf' : 'media';
        if (type !== 'media') {
          authoredSize += size;
          if (authoredSize > 64 * 1024 * 1024) throw new Error('Package exceeds authored JSON size limit');
        }
        // Catalogs and other JSON attachments are assets, not malformed TDFs.
        if (type === 'media') fileContents = undefined;
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
        source,
      });
    }

    serverConsole('Unzipped', files.length, 'files');
    return files;
  } catch (error) {
    await disposeParsedPackage(files);
    throw error;
  }
}
