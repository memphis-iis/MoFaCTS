import JSZip from 'jszip';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { UploadedPackageFile } from './packageParser';

type UnknownRecord = Record<string, unknown>;

export type H5PContentReference = {
  contentId: string;
  packageAssetId: string;
  library: string;
  clusterIndex: number;
  stimIndex: number;
};

export type ParsedH5PPackage = {
  packageAssetId: string;
  hash: string;
  title: string;
  mainLibrary: string;
  library: string;
  contentParams: UnknownRecord;
  requiredLibraryFolders: string[];
  bundledLibraryFolders: string[];
};

export type StoredH5PPackage = ParsedH5PPackage & {
  storagePath: string;
};

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function parseLibraryVersion(h5pJson: UnknownRecord): string {
  const deps = Array.isArray(h5pJson.preloadedDependencies) ? h5pJson.preloadedDependencies : [];
  const mainLibrary = String(h5pJson.mainLibrary || '').trim();
  const match = deps
    .map((dep) => asRecord(dep))
    .find((dep) => dep && dep.machineName === mainLibrary);
  const major = Number(match?.majorVersion);
  const minor = Number(match?.minorVersion);
  if (Number.isFinite(major) && Number.isFinite(minor)) {
    return `${mainLibrary} ${major}.${minor}`;
  }
  return mainLibrary;
}

function getPreloadedDependencyFolders(h5pJson: UnknownRecord): string[] {
  const deps = Array.isArray(h5pJson.preloadedDependencies) ? h5pJson.preloadedDependencies : [];
  return deps
    .map((dep) => asRecord(dep))
    .filter((dep): dep is UnknownRecord => Boolean(dep))
    .map((dep) => {
      const machineName = String(dep.machineName || '').trim();
      const major = String(dep.majorVersion || '').trim();
      const minor = String(dep.minorVersion || '').trim();
      return machineName && major && minor ? `${machineName}-${major}.${minor}` : '';
    })
    .filter(Boolean);
}

function hasUnsafeZipPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  return (
    !normalized ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split('/').some((segment) => segment === '..')
  );
}

function getH5PStorageRoot(): string {
  return path.resolve(process.env.HOME || process.cwd(), 'h5p-content');
}

export function getH5PLibraryStorageRoot(): string {
  return path.resolve(process.env.HOME || process.cwd(), 'h5p-libraries');
}

function sanitizeStorageSegment(value: string): string {
  const sanitized = value.trim().replace(/[^A-Za-z0-9._-]/g, '_');
  if (!sanitized) {
    throw new Error('H5P content id cannot be empty when storing package files');
  }
  return sanitized;
}

function assertInsideDirectory(targetPath: string, parentPath: string) {
  const relative = path.relative(parentPath, targetPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Resolved H5P package path "${targetPath}" escapes storage directory`);
  }
}

function sanitizeLibraryFolder(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_.-]+-\d+\.\d+$/.test(normalized)) {
    throw new Error(`Invalid H5P library folder "${value}"`);
  }
  return normalized;
}

async function loadSafeZip(file: UploadedPackageFile): Promise<JSZip> {
  if (!Buffer.isBuffer(file.contents)) {
    throw new Error(`H5P package "${file.name}" was not parsed as binary content`);
  }

  const zip = await JSZip.loadAsync(file.contents);
  for (const entryName of Object.keys(zip.files)) {
    if (hasUnsafeZipPath(entryName)) {
      throw new Error(`H5P package "${file.name}" contains unsafe path "${entryName}"`);
    }
  }
  return zip;
}

function getBundledLibraryFolders(zip: JSZip): string[] {
  return Array.from(new Set(
    Object.keys(zip.files)
      .map((entryName) => entryName.replace(/\\/g, '/').split('/')[0])
      .filter((folder): folder is string => Boolean(folder) && Boolean(zip.file(`${folder}/library.json`)))
      .map((folder) => sanitizeLibraryFolder(folder))
  )).sort();
}

async function writeZipFolder(args: {
  zip: JSZip;
  sourcePrefix: string;
  targetRoot: string;
  stripPrefix?: boolean;
}) {
  const cleanPrefix = args.sourcePrefix.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const sourcePrefix = cleanPrefix ? `${cleanPrefix}/` : '';
  const targetRoot = path.resolve(args.targetRoot);
  await fs.mkdir(targetRoot, { recursive: true });

  for (const entryName of Object.keys(args.zip.files)) {
    const normalizedEntry = entryName.replace(/\\/g, '/');
    if (sourcePrefix && !normalizedEntry.startsWith(sourcePrefix)) {
      continue;
    }
    const entry = args.zip.files[entryName];
    if (!entry) {
      continue;
    }
    const relativeName = args.stripPrefix
      ? normalizedEntry.slice(sourcePrefix.length)
      : normalizedEntry;
    if (!relativeName) {
      continue;
    }
    const targetPath = path.resolve(targetRoot, relativeName);
    assertInsideDirectory(targetPath, targetRoot);
    if (entry.dir) {
      await fs.mkdir(targetPath, { recursive: true });
      continue;
    }
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, Buffer.from(await entry.async('uint8array')));
  }
}

export function extractH5PContentReferences(rawStimuliFile: unknown): H5PContentReference[] {
  const root = asRecord(rawStimuliFile);
  const setspec = asRecord(root?.setspec);
  const clusters = Array.isArray(setspec?.clusters)
    ? setspec.clusters as unknown[]
    : [];
  const references: H5PContentReference[] = [];

  clusters.forEach((cluster, clusterIndex) => {
    const clusterRecord = asRecord(cluster);
    const stims = Array.isArray(clusterRecord?.stims) ? clusterRecord.stims : [];
    stims.forEach((stim, stimIndex) => {
      const display = asRecord(asRecord(stim)?.display);
      const h5p = asRecord(display?.h5p);
      if (!h5p || h5p.sourceType !== 'self-hosted') {
        return;
      }
      const contentId = String(h5p.contentId || '').trim();
      const packageAssetId = String(h5p.packageAssetId || '').trim();
      const library = String(h5p.library || '').trim();
      if (!contentId || !packageAssetId || !library) {
        throw new Error(`Self-hosted H5P stim ${clusterIndex}/${stimIndex} requires contentId, packageAssetId, and library`);
      }
      references.push({ contentId, packageAssetId, library, clusterIndex, stimIndex });
    });
  });

  return references;
}

export async function parseH5PPackageFile(file: UploadedPackageFile): Promise<ParsedH5PPackage> {
  const zip = await loadSafeZip(file);

  const h5pJsonFile = zip.file('h5p.json');
  const contentJsonFile = zip.file('content/content.json');
  if (!h5pJsonFile || !contentJsonFile) {
    throw new Error(`H5P package "${file.name}" must contain h5p.json and content/content.json`);
  }

  const h5pJson = JSON.parse(await h5pJsonFile.async('string')) as UnknownRecord;
  const contentParams = JSON.parse(await contentJsonFile.async('string')) as UnknownRecord;
  const mainLibrary = String(h5pJson.mainLibrary || '').trim();
  if (!mainLibrary) {
    throw new Error(`H5P package "${file.name}" is missing h5p.json mainLibrary`);
  }
  const requiredLibraryFolders = getPreloadedDependencyFolders(h5pJson);
  const bundledLibraryFolders = getBundledLibraryFolders(zip);

  return {
    packageAssetId: file.name,
    hash: createHash('sha256').update(file.contents as Buffer).digest('hex'),
    title: String(h5pJson.title || file.name).trim(),
    mainLibrary,
    library: parseLibraryVersion(h5pJson),
    contentParams,
    requiredLibraryFolders,
    bundledLibraryFolders,
  };
}

export async function storeH5PLibrariesFromPackage(file: UploadedPackageFile): Promise<string[]> {
  const zip = await loadSafeZip(file);
  const bundledLibraryFolders = getBundledLibraryFolders(zip);
  const libraryRoot = getH5PLibraryStorageRoot();

  for (const folder of bundledLibraryFolders) {
    await writeZipFolder({
      zip,
      sourcePrefix: folder,
      targetRoot: path.join(libraryRoot, folder),
      stripPrefix: true,
    });
  }

  return bundledLibraryFolders;
}

export async function getMissingH5PLibraryFolders(requiredLibraryFolders: string[]): Promise<string[]> {
  const libraryRoot = getH5PLibraryStorageRoot();
  const missing: string[] = [];
  for (const folder of requiredLibraryFolders) {
    const safeFolder = sanitizeLibraryFolder(folder);
    try {
      const stat = await fs.stat(path.join(libraryRoot, safeFolder, 'library.json'));
      if (!stat.isFile()) {
        missing.push(safeFolder);
      }
    } catch (_error) {
      missing.push(safeFolder);
    }
  }
  return missing;
}

export async function storeH5PPackageFile(file: UploadedPackageFile, contentId: string): Promise<StoredH5PPackage> {
  const parsed = await parseH5PPackageFile(file);
  const zip = await loadSafeZip(file);
  const storagePath = path.join(
    getH5PStorageRoot(),
    sanitizeStorageSegment(contentId),
    parsed.hash
  );
  await fs.mkdir(storagePath, { recursive: true });
  await writeZipFolder({ zip, sourcePrefix: '', targetRoot: storagePath });

  return {
    ...parsed,
    storagePath,
  };
}
