import { gunzip, gzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const BLOCK_SIZE = 512;

export type TarEntry = {
  name: string;
  body: Buffer;
  mode?: number;
  mtime?: Date;
};

function sanitizeEntryName(name: string): string {
  const normalized = name.replace(/\\/g, '/').split('/').filter(Boolean).join('/');
  if (!normalized || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`Unsafe tar entry name: ${name}`);
  }
  return normalized;
}

function splitUstarName(name: string): { name: string; prefix: string } {
  if (Buffer.byteLength(name) <= 100) {
    return { name, prefix: '' };
  }
  if (Buffer.byteLength(name) > 255) {
    throw new Error(`Tar entry name is too long: ${name}`);
  }
  const parts = name.split('/');
  for (let index = parts.length - 1; index > 0; index -= 1) {
    const prefix = parts.slice(0, index).join('/');
    const shortName = parts.slice(index).join('/');
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(shortName) <= 100) {
      return { name: shortName, prefix };
    }
  }
  throw new Error(`Tar entry name cannot be represented in ustar format: ${name}`);
}

function writeOctal(header: Buffer, value: number, offset: number, length: number): void {
  const text = Math.max(0, Math.floor(value)).toString(8).padStart(length - 1, '0').slice(-(length - 1));
  header.write(`${text}\0`, offset, length, 'ascii');
}

function writeString(header: Buffer, value: string, offset: number, length: number): void {
  header.write(value.slice(0, length), offset, length, 'ascii');
}

function createHeader(entry: TarEntry): Buffer {
  const header = Buffer.alloc(BLOCK_SIZE, 0);
  const entryName = sanitizeEntryName(entry.name);
  const ustarName = splitUstarName(entryName);
  writeString(header, ustarName.name, 0, 100);
  writeOctal(header, entry.mode || 0o600, 100, 8);
  writeOctal(header, 0, 108, 8);
  writeOctal(header, 0, 116, 8);
  writeOctal(header, entry.body.length, 124, 12);
  writeOctal(header, Math.floor((entry.mtime || new Date()).getTime() / 1000), 136, 12);
  header.fill(' ', 148, 156);
  header.write('0', 156, 1, 'ascii');
  writeString(header, 'ustar', 257, 6);
  writeString(header, '00', 263, 2);
  writeString(header, ustarName.prefix, 345, 155);
  let checksum = 0;
  for (const byte of header) {
    checksum += byte;
  }
  const checksumText = checksum.toString(8).padStart(6, '0');
  header.write(`${checksumText}\0 `, 148, 8, 'ascii');
  return header;
}

function padContent(content: Buffer): Buffer {
  const remainder = content.length % BLOCK_SIZE;
  if (remainder === 0) {
    return content;
  }
  return Buffer.concat([content, Buffer.alloc(BLOCK_SIZE - remainder, 0)]);
}

export async function createTarGzArchive(entries: TarEntry[]): Promise<Buffer> {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    blocks.push(createHeader(entry));
    blocks.push(padContent(entry.body));
  }
  blocks.push(Buffer.alloc(BLOCK_SIZE, 0), Buffer.alloc(BLOCK_SIZE, 0));
  return await gzipAsync(Buffer.concat(blocks));
}

function readString(buffer: Buffer, start: number, length: number): string {
  return buffer.subarray(start, start + length).toString('utf8').replace(/\0.*$/, '').trim();
}

function readOctal(buffer: Buffer, start: number, length: number): number {
  const raw = readString(buffer, start, length).replace(/\0/g, '').trim();
  return raw ? parseInt(raw, 8) : 0;
}

function isZeroBlock(buffer: Buffer): boolean {
  return buffer.every((byte) => byte === 0);
}

export async function readTarGzArchive(archive: Buffer): Promise<TarEntry[]> {
  const tar = await gunzipAsync(archive);
  const entries: TarEntry[] = [];
  let offset = 0;
  while (offset + BLOCK_SIZE <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK_SIZE);
    offset += BLOCK_SIZE;
    if (isZeroBlock(header)) {
      break;
    }
    const name = readString(header, 0, 100);
    const prefix = readString(header, 345, 155);
    const size = readOctal(header, 124, 12);
    if (!name) {
      throw new Error('Tar archive included an entry with no name');
    }
    const fullName = prefix ? `${prefix}/${name}` : name;
    const body = tar.subarray(offset, offset + size);
    entries.push({ name: fullName, body: Buffer.from(body) });
    offset += Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
  }
  return entries;
}
