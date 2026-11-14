import { createReadStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, basename, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

export async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

/** Delete only a direct child created by this operation's mkdtemp prefix. */
export async function removePackageDirectory(directory: string, parent: string, prefix: string) {
  const target = resolve(directory);
  if (dirname(target) !== resolve(parent) || !basename(target).startsWith(prefix) || basename(target) === prefix) throw new Error('Unsafe package cleanup target');
  await rm(target, { recursive: true, force: true });
}

/** Register a durable copy through FilesCollection's public filesystem API.
 * The caller retains ownership of its temporary source, including on failure. */
export async function storePackageFile(
  assets: { addFile: (path: string, options: Record<string, any>) => Promise<any> },
  storageRoot: string,
  source: string,
  options: Record<string, any> & { fileName: string },
) {
  if (basename(options.fileName) !== options.fileName || /[\\/]/.test(options.fileName)) throw new Error('Unsafe stored package filename');
  await mkdir(storageRoot, { recursive: true });
  const directory = await mkdtemp(join(storageRoot, 'package-'));
  try {
    const destination = join(directory, options.fileName);
    await copyFile(source, destination);
    return await assets.addFile(destination, options);
  } catch (error) {
    await removePackageDirectory(directory, storageRoot, 'package-');
    throw error;
  }
}
