import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { deserialize, serialize } from 'node:v8';

const OWNER = 'mofacts-bounded-external-sort-v1';
const DIRECTORY_PREFIX = 'mofacts-external-sort-';
const MARKER = 'owner.json';

export type BoundedExternalSortOptions = {
  signal?: AbortSignal;
  maxRowsPerRun?: number;
  maxBytesPerRun?: number;
  mergeFanIn?: number;
  tempDirectory?: string;
};

type SortRow<T> = { ordinal: number; value: T };

async function removeScratchDirectory(root: string, directory: string): Promise<void> {
  const target = resolve(directory);
  const child = relative(root, target);
  if (!isAbsolute(root) || !child || isAbsolute(child) || child.startsWith(`..${sep}`)
    || child.includes(sep) || !/^mofacts-external-sort-\d+-[A-Za-z0-9]+$/.test(child)) {
    throw new Error('External sort cleanup target is outside its scratch directory');
  }
  const info = await fs.lstat(target);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('External sort cleanup target is not a private directory');
  await fs.rm(target, { recursive: true, force: true });
}

function checkAbort(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

function positiveInteger(value: number, name: string, minimum = 1): number {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`Invalid external sort ${name}`);
  return value;
}

async function writeBuffer(handle: FileHandle, data: Buffer): Promise<void> {
  let offset = 0;
  while (offset < data.length) {
    const { bytesWritten } = await handle.write(data, offset, data.length - offset);
    if (!bytesWritten) throw new Error('External sort scratch write did not advance');
    offset += bytesWritten;
  }
}

async function writeFrame<T>(handle: FileHandle, row: SortRow<T>): Promise<void> {
  const data = serialize(row);
  if (data.length > 0xFFFFFFFF) throw new Error('External sort record exceeds scratch frame limit');
  const size = Buffer.allocUnsafe(4);
  size.writeUInt32LE(data.length);
  await writeBuffer(handle, size);
  await writeBuffer(handle, data);
}

async function readExactly(handle: FileHandle, size: number, allowEof = false): Promise<Buffer | null> {
  const data = Buffer.allocUnsafe(size);
  let offset = 0;
  while (offset < size) {
    const { bytesRead } = await handle.read(data, offset, size - offset);
    if (!bytesRead) {
      if (allowEof && offset === 0) return null;
      throw new Error('External sort scratch frame is incomplete');
    }
    offset += bytesRead;
  }
  return data;
}

async function readFrame<T>(handle: FileHandle): Promise<SortRow<T> | null> {
  const size = await readExactly(handle, 4, true);
  if (!size) return null;
  const length = size.readUInt32LE();
  if (!length) throw new Error('External sort scratch frame is empty');
  const data = await readExactly(handle, length);
  return deserialize(data!) as SortRow<T>;
}

/**
 * Stable disk-backed sort for projected plain records. Callers must remove BSON/custom
 * prototypes before supplying records. V8 frames retain Date, undefined and numeric
 * values used by the original comparator and formatter. Returning from iteration,
 * failure and cancellation all close readers and remove the private scratch run.
 * A single source record may exceed the byte budget and occupies its own run.
 */
export async function* boundedExternalSort<T>(
  source: Iterable<T> | AsyncIterable<T>,
  compare: (a: T, b: T) => number,
  options: BoundedExternalSortOptions = {},
): AsyncGenerator<T> {
  const maxRows = positiveInteger(options.maxRowsPerRun ?? 1000, 'row bound');
  const maxBytes = positiveInteger(options.maxBytesPerRun ?? 8 * 1024 * 1024, 'byte bound');
  const fanIn = positiveInteger(options.mergeFanIn ?? 16, 'merge fan-in', 2);
  const compareRows = (a: SortRow<T>, b: SortRow<T>): number => {
    const result = compare(a.value, b.value);
    return result && !Number.isNaN(result) ? result : a.ordinal - b.ordinal;
  };
  checkAbort(options.signal);
  const scratchRoot = await fs.realpath(options.tempDirectory ?? tmpdir());
  const directory = await fs.mkdtemp(join(scratchRoot, `${DIRECTORY_PREFIX}${process.pid}-`));
  const runPath = (stage: number, run: number) => join(directory, `stage-${stage}-run-${run}.bin`);
  try {
    await fs.chmod(directory, 0o700);
    await fs.writeFile(join(directory, MARKER), JSON.stringify({ owner: OWNER, pid: process.pid, id: randomUUID() }), { flag: 'wx', mode: 0o600 });
    let batch: SortRow<T>[] = [];
    let batchBytes = 0;
    let runCount = 0;
    let ordinal = 0;
    async function flush(): Promise<void> {
      if (!batch.length) return;
      batch.sort(compareRows);
      const handle = await fs.open(runPath(0, runCount), 'wx', 0o600);
      try {
        for (const row of batch) {
          checkAbort(options.signal);
          await writeFrame(handle, row);
        }
      } finally { await handle.close(); }
      runCount += 1;
      batch = [];
      batchBytes = 0;
    }
    for await (const value of source) {
      checkAbort(options.signal);
      if (!Number.isSafeInteger(ordinal)) throw new Error('External sort record count exceeds safe ordinal range');
      const row = { ordinal: ordinal++, value };
      const bytes = serialize(row).length + 4;
      if (batch.length && (batch.length >= maxRows || batchBytes + bytes > maxBytes)) await flush();
      batch.push(row);
      batchBytes += bytes;
      if (batch.length >= maxRows || batchBytes >= maxBytes) await flush();
    }
    await flush();

    async function* merge(stage: number, start: number, count: number): AsyncGenerator<SortRow<T>> {
      const handles: FileHandle[] = [];
      try {
        for (let offset = 0; offset < count; offset += 1) {
          checkAbort(options.signal);
          handles.push(await fs.open(runPath(stage, start + offset), 'r'));
        }
        const heads = await Promise.all(handles.map(handle => readFrame<T>(handle)));
        while (true) {
          checkAbort(options.signal);
          let best = -1;
          for (let index = 0; index < heads.length; index += 1) {
            const head = heads[index];
            if (head && (best < 0 || compareRows(head, heads[best]!) < 0)) best = index;
          }
          if (best < 0) return;
          yield heads[best]!;
          heads[best] = await readFrame<T>(handles[best]!);
        }
      } finally { await Promise.all(handles.map(handle => handle.close())); }
    }

    let stage = 0;
    while (runCount > fanIn) {
      let nextCount = 0;
      for (let start = 0; start < runCount; start += fanIn) {
        const count = Math.min(fanIn, runCount - start);
        const handle = await fs.open(runPath(stage + 1, nextCount), 'wx', 0o600);
        try {
          for await (const row of merge(stage, start, count)) await writeFrame(handle, row);
        } finally { await handle.close(); }
        for (let offset = 0; offset < count; offset += 1) await fs.unlink(runPath(stage, start + offset));
        nextCount += 1;
      }
      stage += 1;
      runCount = nextCount;
    }
    if (runCount) {
      for await (const row of merge(stage, 0, runCount)) yield row.value;
    }
  } finally { await removeScratchDirectory(scratchRoot, directory); }
}

/** Startup cleanup owner: only marked scratch directories belonging to a dead process. */
export async function cleanupAbandonedExternalSortRuns(options: { tempDirectory?: string } = {}): Promise<void> {
  const directory = await fs.realpath(options.tempDirectory ?? tmpdir());
  const entries = await fs.opendir(directory);
  for await (const entry of entries) {
    if (!entry.isDirectory() || !/^mofacts-external-sort-\d+-[A-Za-z0-9]+$/.test(entry.name)) continue;
    const path = join(directory, entry.name);
    const markerPath = join(path, MARKER);
    let marker: { owner?: unknown; pid?: unknown };
    try {
      const info = await fs.lstat(markerPath);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 1024) continue;
      marker = JSON.parse(await fs.readFile(markerPath, 'utf8')) as typeof marker;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) continue;
      throw error;
    }
    if (marker.owner !== OWNER || typeof marker.pid !== 'number' || !Number.isSafeInteger(marker.pid) || marker.pid < 1) continue;
    if (!entry.name.startsWith(`${DIRECTORY_PREFIX}${marker.pid}-`)) continue;
    try { process.kill(marker.pid, 0); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') await removeScratchDirectory(directory, path);
      else if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
    }
  }
}
