import JSZip from 'jszip';
import { sanitizeImportName } from './importCompositionBuilder';

const IMAGE_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'webp']);
const ZIP_EXTENSION = 'zip';
const MAX_SOURCE_IMAGE_BYTES = 50 * 1024 * 1024;
export const AI_IMAGE_MAX_WIDTH = 1280;
export const AI_IMAGE_WEBP_QUALITY = 0.86;

export type AiImageSourceFile = {
  file: File;
  sourcePath: string;
};

export type PreparedAiImageAsset = {
  id: string;
  originalName: string;
  sourcePath: string;
  packageFileName: string;
  bytes: Uint8Array;
  width: number;
  height: number;
};

export type ConvertedImage = {
  bytes: Uint8Array;
  width: number;
  height: number;
};

type DroppedFileSystemEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath?: string;
  file?: (success: (file: File) => void, failure?: (error: unknown) => void) => void;
  createReader?: () => {
    readEntries: (success: (entries: DroppedFileSystemEntry[]) => void, failure?: (error: unknown) => void) => void;
  };
};

function extensionOf(name: string): string {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
}

function imageMimeType(name: string): string {
  const extension = extensionOf(name);
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'bmp') return 'image/bmp';
  if (extension === 'avif') return 'image/avif';
  return '';
}

export function isSupportedAiImageFile(file: Pick<File, 'name' | 'type'>): boolean {
  const extension = extensionOf(file.name);
  return IMAGE_EXTENSIONS.has(extension) && (!file.type || file.type.startsWith('image/'));
}

function isZipFile(file: Pick<File, 'name' | 'type'>): boolean {
  return extensionOf(file.name) === ZIP_EXTENSION || file.type === 'application/zip';
}

function safeArchivePath(path: string): boolean {
  const normalized = String(path || '').replace(/\\/g, '/');
  return Boolean(normalized) &&
    !normalized.startsWith('/') &&
    !/^[a-z]:\//i.test(normalized) &&
    !normalized.split('/').includes('..');
}

async function unzipImageSources(source: AiImageSourceFile): Promise<AiImageSourceFile[]> {
  const zip = await JSZip.loadAsync(await source.file.arrayBuffer());
  const unsafeEntry = Object.values(zip.files).find((entry) => !entry.dir && !safeArchivePath(entry.name));
  if (unsafeEntry) {
    throw new Error(`ZIP archive contains an unsafe file path: ${unsafeEntry.name}`);
  }
  const imageEntries = Object.values(zip.files).filter((entry) =>
    !entry.dir &&
    !entry.name.split('/').includes('__MACOSX') &&
    IMAGE_EXTENSIONS.has(extensionOf(entry.name))
  );
  const extracted: AiImageSourceFile[] = [];
  for (const entry of imageEntries) {
    const blob = await entry.async('blob');
    const name = entry.name.split('/').filter(Boolean).pop() || 'image';
    extracted.push({
      file: new File([blob], name, { type: imageMimeType(name), lastModified: source.file.lastModified }),
      sourcePath: `${source.sourcePath}/${entry.name}`,
    });
  }
  return extracted;
}

export async function expandAiImageSources(sources: AiImageSourceFile[]): Promise<AiImageSourceFile[]> {
  const expanded: AiImageSourceFile[] = [];
  for (const source of sources) {
    if (isZipFile(source.file)) {
      expanded.push(...await unzipImageSources(source));
      continue;
    }
    if (isSupportedAiImageFile(source.file)) {
      expanded.push(source);
    }
  }
  return expanded;
}

function readEntryFile(entry: DroppedFileSystemEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!entry.file) {
      reject(new Error(`Dropped file entry "${entry.name}" cannot be read.`));
      return;
    }
    entry.file(resolve, reject);
  });
}

async function readDirectoryEntries(entry: DroppedFileSystemEntry): Promise<DroppedFileSystemEntry[]> {
  if (!entry.createReader) {
    throw new Error(`Dropped folder "${entry.name}" cannot be read.`);
  }
  const reader = entry.createReader();
  const entries: DroppedFileSystemEntry[] = [];
  while (true) {
    const next = await new Promise<DroppedFileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (next.length === 0) {
      return entries;
    }
    entries.push(...next);
  }
}

async function collectEntryFiles(entry: DroppedFileSystemEntry): Promise<AiImageSourceFile[]> {
  if (entry.isFile) {
    const file = await readEntryFile(entry);
    return [{ file, sourcePath: String(entry.fullPath || file.name).replace(/^\//, '') }];
  }
  if (!entry.isDirectory) {
    return [];
  }
  const nested = await readDirectoryEntries(entry);
  const files: AiImageSourceFile[] = [];
  for (const child of nested) {
    files.push(...await collectEntryFiles(child));
  }
  return files;
}

export async function collectAiImageDropSources(dataTransfer: DataTransfer): Promise<AiImageSourceFile[]> {
  const entries = Array.from(dataTransfer.items || [])
    .map((item): DroppedFileSystemEntry | null => {
      const getter = (item as unknown as { webkitGetAsEntry?: () => DroppedFileSystemEntry | null }).webkitGetAsEntry;
      return getter ? getter.call(item) : null;
    })
    .filter((entry): entry is DroppedFileSystemEntry => Boolean(entry));
  if (entries.length > 0) {
    const files: AiImageSourceFile[] = [];
    for (const entry of entries) {
      files.push(...await collectEntryFiles(entry));
    }
    return files;
  }
  return Array.from(dataTransfer.files || []).map((file) => ({
    file,
    sourcePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
  }));
}

export function sourcesFromFileList(fileList: FileList | File[]): AiImageSourceFile[] {
  return Array.from(fileList || []).map((file) => ({
    file,
    sourcePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
  }));
}

function canvasToWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== 'image/webp') {
        reject(new Error('This browser could not encode the uploaded image as WebP.'));
        return;
      }
      resolve(blob);
    }, 'image/webp', AI_IMAGE_WEBP_QUALITY);
  });
}

export async function convertAiImageToWebp(file: File): Promise<ConvertedImage> {
  if (!isSupportedAiImageFile(file)) {
    throw new Error(`Unsupported image file: ${file.name}`);
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error(`Image "${file.name}" is larger than 50 MB.`);
  }
  if (typeof createImageBitmap !== 'function') {
    throw new Error('This browser cannot decode images for WebP conversion.');
  }
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height) {
      throw new Error(`Image "${file.name}" has invalid dimensions.`);
    }
    const width = Math.min(AI_IMAGE_MAX_WIDTH, bitmap.width);
    const height = Math.max(1, Math.round(bitmap.height * (width / bitmap.width)));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('This browser could not prepare the image conversion canvas.');
    }
    context.drawImage(bitmap, 0, 0, width, height);
    const webp = await canvasToWebp(canvas);
    return {
      bytes: new Uint8Array(await webp.arrayBuffer()),
      width,
      height,
    };
  } finally {
    bitmap.close();
  }
}

function uniquePackageFileName(sourceName: string, reserved: Set<string>): string {
  const withoutExtension = sourceName.replace(/\.[^.]+$/, '');
  const base = sanitizeImportName(withoutExtension, 'image');
  let candidate = `${base}.webp`;
  let suffix = 2;
  while (reserved.has(candidate.toLowerCase())) {
    candidate = `${base}_${suffix}.webp`;
    suffix += 1;
  }
  reserved.add(candidate.toLowerCase());
  return candidate;
}

export async function prepareAiImageAssets(
  sources: AiImageSourceFile[],
  existingAssets: PreparedAiImageAsset[] = [],
  converter: (file: File) => Promise<ConvertedImage> = convertAiImageToWebp,
): Promise<PreparedAiImageAsset[]> {
  const expanded = await expandAiImageSources(sources);
  if (expanded.length === 0) {
    throw new Error('No supported images were found. Use JPEG, PNG, WebP, GIF, BMP, or AVIF files.');
  }
  const reserved = new Set(existingAssets.map((asset) => asset.packageFileName.toLowerCase()));
  const prepared: PreparedAiImageAsset[] = [];
  for (const source of expanded) {
    const converted = await converter(source.file);
    const packageFileName = uniquePackageFileName(source.file.name, reserved);
    prepared.push({
      id: packageFileName,
      originalName: source.file.name,
      sourcePath: source.sourcePath,
      packageFileName,
      bytes: converted.bytes,
      width: converted.width,
      height: converted.height,
    });
  }
  return prepared;
}

export function aiImageAssetDataUrl(asset: PreparedAiImageAsset): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Could not prepare "${asset.originalName}" for visual analysis.`));
    reader.readAsDataURL(new Blob([new Uint8Array(asset.bytes).buffer], { type: 'image/webp' }));
  });
}
